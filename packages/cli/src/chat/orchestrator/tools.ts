import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { Config } from '../../config/index.js';
import { setConfigValue } from '../../config/index.js';
import { resolvePermission } from './permissions.js';
import {
  PipelineEngine,
  loadSkillFile,
  scanSkillFiles,
  scanSkillSummaries,
  estimatePipelineCost,
  loadAgentSkill,
  readAgentSkillResource,
  remapModelForProvider,
  type PipelineContext,
  type ProviderConfig,
  type SkillEntry,
  type AgentSkillSummary,
  type AgentSkill,
  type HookManager,
} from '@scrutari/core';
import { ToolRegistry, type ToolContext, type ToolDefinition } from '@scrutari/tools';
import { type MCPClientManager, type AdaptedToolDefinition } from '@scrutari/mcp';
import { listSessions } from '../session/storage.js';
import type { OrchestratorConfig } from '../types.js';

function getBuiltInSkillsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  const bundledPath = resolve(thisDir, '..', 'skills');
  if (existsSync(bundledPath)) return bundledPath;
  const tscPath = resolve(thisDir, '..', '..', '..', '..', 'skills');
  return tscPath;
}

function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

function findSkill(name: string, builtInDir: string, userDir?: string): SkillEntry | undefined {
  const scanned = scanSkillFiles(builtInDir, userDir);
  const userMatch = scanned.find(s => s.name === name && s.source === 'user');
  const builtInMatch = scanned.find(s => s.name === name && s.source === 'built-in');
  const match = userMatch ?? builtInMatch;
  if (!match) return undefined;
  return loadSkillFile(match.filePath, match.source);
}

/**
 * Converts MCP AdaptedToolDefinitions to ToolDefinitions for ToolRegistry.
 */
function mcpToToolDefinitions(mcpTools: AdaptedToolDefinition[]): ToolDefinition[] {
  return mcpTools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    execute: t.execute as ToolDefinition['execute'],
  }));
}

/**
 * Converts MCP AdaptedToolDefinitions to AI SDK tool format for the orchestrator.
 */
function mcpToAISDKTools(mcpTools: AdaptedToolDefinition[]): Record<string, {
  description: string;
  inputSchema: z.ZodSchema;
  execute: (params: unknown) => Promise<unknown>;
}> {
  const tools: Record<string, {
    description: string;
    inputSchema: z.ZodSchema;
    execute: (params: unknown) => Promise<unknown>;
  }> = {};

  for (const t of mcpTools) {
    tools[t.name] = {
      description: t.description,
      inputSchema: t.parameters,
      execute: async (params: unknown) => {
        const result = await t.execute(params, {});
        if (!result.success) {
          return { error: result.error ?? 'MCP tool execution failed' };
        }
        return result.data;
      },
    };
  }

  return tools;
}

/**
 * Build agent config map from CLI config for use with the estimator.
 */
function buildAgentConfigMap(config: Config): Record<string, { model?: string; maxTokens?: number; temperature?: number }> {
  const map: Record<string, { model?: string; maxTokens?: number; temperature?: number }> = {};
  for (const type of ['research', 'explore', 'verify', 'default'] as const) {
    const entry = config.agents[type];
    if (entry.model || entry.max_tokens || entry.temperature) {
      map[type] = {
        ...(entry.model ? { model: entry.model } : {}),
        ...(entry.max_tokens ? { maxTokens: entry.max_tokens } : {}),
        ...(entry.temperature !== undefined ? { temperature: entry.temperature } : {}),
      };
    }
  }
  return map;
}

/**
 * Format a DAG visualization from execution levels.
 */
function formatDagVisualization(executionLevels: string[][]): string {
  return executionLevels.map((level, i) =>
    `Level ${i + 1}: ${level.join(' + ')}`
  ).join('\n');
}

const READ_ONLY_TOOLS = new Set([
  'get_quote', 'search_filings', 'search_news',
  'list_skills', 'get_skill_detail', 'list_sessions',
  'manage_config', 'preview_pipeline',
]);

export interface OrchestratorToolsOptions {
  dryRun?: boolean;
  readOnly?: boolean;
  approvalThreshold?: number;
  agentSkillSummaries?: AgentSkillSummary[];
  activeAgentSkill?: AgentSkill;
  sessionSpentUsd?: number;
  sessionBudgetUsd?: number;
  permissions?: Record<string, import('../../config/schema.js').PermissionLevel>;
  hookManager?: HookManager;
}

export function createOrchestratorTools(config: Config, orchestratorConfig: OrchestratorConfig, mcpClient?: MCPClientManager, options: OrchestratorToolsOptions = {}) {
  const builtInDir = getBuiltInSkillsDir();
  const userDir = expandTilde(config.skills_dir);

  // Build provider config for model remapping
  const providerConfig: ProviderConfig = {
    providers: {
      anthropic: { apiKey: config.providers.anthropic?.api_key },
      openai: { apiKey: config.providers.openai?.api_key },
      google: { apiKey: config.providers.google?.api_key },
      minimax: { apiKey: config.providers.minimax?.api_key },
    },
  };
  const remapModel = (modelId: string) => remapModelForProvider(modelId, providerConfig);

  // Get MCP tools once (stable for the lifetime of this tool set)
  const mcpTools = mcpClient?.listTools() ?? [];
  const mcpOrchestratorTools = mcpToAISDKTools(mcpTools);
  const mcpToolDefinitions = mcpToToolDefinitions(mcpTools);

  const allTools = {
    run_pipeline: {
      description: 'Run a skill-based analysis pipeline. Pass inputs matching the skill\'s declared input schema.',
      inputSchema: z.object({
        skill: z.string().default('deep-dive').describe('Analysis skill to use'),
        inputs: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
        ).describe('Skill inputs as key-value pairs (e.g. { ticker: "NVDA" } or { tickers: ["AAPL", "NVDA"] })'),
        budget: z.number().optional().describe('Budget cap in USD'),
        model: z.string().optional().describe('Override the model for all pipeline stages. Omit to use each stage\'s configured model.'),
      }),
      execute: async ({ skill: skillName, inputs: rawInputs, budget, model }: {
        skill: string;
        inputs: Record<string, string | number | boolean | string[]>;
        budget?: number;
        model?: string;
      }) => {
        const budgetUsd = budget ?? config.defaults.max_budget_usd;

        const skillEntry = findSkill(skillName, builtInDir, userDir);
        if (!skillEntry) {
          return { error: `Skill "${skillName}" not found.` };
        }

        const skill = skillEntry.skill;

        // Validate inputs against skill's declared input schema
        const declaredInputs = skill.inputs ?? [];
        const resolvedInputs: Record<string, string | number | boolean | string[]> = {};

        for (const decl of declaredInputs) {
          const provided = rawInputs[decl.name];
          if (provided !== undefined) {
            resolvedInputs[decl.name] = provided;
          } else if (decl.default !== undefined) {
            resolvedInputs[decl.name] = decl.default;
          } else if (decl.required) {
            return {
              error: `Missing required input "${decl.name}" for skill "${skillName}". Expected inputs: ${declaredInputs.map(i => `${i.name} (${i.type}${i.required ? ', required' : ''})`).join(', ')}`,
            };
          }
        }

        const agentConfigMap = buildAgentConfigMap(config);
        const agentConfig = Object.keys(agentConfigMap).length > 0 ? agentConfigMap : undefined;
        const loadSkillFn = (n: string) => findSkill(n, builtInDir, userDir);
        const estimate = estimatePipelineCost(skill, model, agentConfig, loadSkillFn, remapModel);

        // Dry-run: return estimate without executing
        if (options.dryRun) {
          return {
            dryRun: true,
            skillName: skillName,
            inputs: resolvedInputs,
            estimate: {
              stages: estimate.stages.map(s => ({
                name: s.stageName,
                model: s.model,
                agentType: s.agentType,
                estimatedInputTokens: s.estimatedInputTokens,
                estimatedOutputTokens: s.estimatedOutputTokens,
                estimatedCostUsd: s.estimatedCostUsd,
                estimatedTimeSeconds: s.estimatedTimeSeconds,
                tools: s.tools,
              })),
              executionLevels: estimate.executionLevels,
              totalEstimatedCostUsd: estimate.totalEstimatedCostUsd,
              totalEstimatedTimeSeconds: estimate.totalEstimatedTimeSeconds,
              toolsRequired: estimate.toolsRequired,
              toolsOptional: estimate.toolsOptional,
            },
          };
        }

        // Pre-execution session budget enforcement
        const sessionSpent = options.sessionSpentUsd ?? 0;
        const sessionBudget = options.sessionBudgetUsd ?? Infinity;
        const remaining = sessionBudget - sessionSpent;

        if (estimate.totalEstimatedCostUsd > remaining) {
          return {
            error: `Estimated cost ($${estimate.totalEstimatedCostUsd.toFixed(4)}) exceeds remaining session budget ($${remaining.toFixed(4)}). Session spent: $${sessionSpent.toFixed(4)} of $${sessionBudget.toFixed(2)}.`,
          };
        }

        // Approval gate: check if cost exceeds threshold
        const approvalThreshold = options.approvalThreshold ?? config.defaults.approval_threshold_usd;
        if (orchestratorConfig.onApprovalRequired) {
          if (estimate.totalEstimatedCostUsd > approvalThreshold) {
            const approved = await orchestratorConfig.onApprovalRequired(estimate);
            if (!approved) {
              return {
                cancelled: true,
                reason: 'User declined',
                estimatedCost: estimate.totalEstimatedCostUsd,
              };
            }
          }
        }

        const toolRegistry = new ToolRegistry();

        // Register MCP tools so pipelines can reference MCP servers as tool groups
        if (mcpClient) {
          for (const info of mcpClient.getServerInfos()) {
            const serverTools = mcpToolDefinitions.filter(t => t.name.startsWith(`${info.name}/`));
            if (serverTools.length > 0) {
              toolRegistry.registerGroup(info.name, serverTools);
            }
          }
        }

        const toolContext: ToolContext = {
          config: {
            userAgent: config.providers.anthropic.api_key
              ? 'scrutari-cli/0.1 (scrutari@example.com)'
              : undefined,
            ...(skill.tools_config ?? {}),
          },
        };

        const resolveTools = (groupNames: string[]) => {
          const tools = toolRegistry.resolveToolGroups(groupNames);
          return toolRegistry.toAISDKToolSet(tools, toolContext, options.hookManager);
        };

        const pipelineContext: PipelineContext = {
          skill,
          inputs: resolvedInputs,
          modelOverride: model,
          maxBudgetUsd: budgetUsd,
          providerConfig,
          resolveTools,
          isToolAvailable: (name: string) => toolRegistry.isAvailable(name),
          toolsConfig: skill.tools_config,
          abortSignal: orchestratorConfig.abortSignal,
          maxConcurrency: 5,
          agentConfig: Object.keys(agentConfigMap).length > 0 ? agentConfigMap : undefined,
          loadSkill: (name: string) => findSkill(name, builtInDir, userDir),
          hookManager: options.hookManager,
        };

        const pipeline = new PipelineEngine(pipelineContext);

        // Wire pipeline events to orchestrator
        pipeline.on('stage:start', (event) => {
          orchestratorConfig.onPipelineEvent({
            type: 'stage:start',
            stageName: event.stageName,
            model: event.model,
            stageIndex: event.stageIndex,
            totalStages: event.totalStages,
          });
        });

        pipeline.on('stage:stream', (event) => {
          orchestratorConfig.onPipelineEvent({
            type: 'stage:stream',
            stageName: event.stageName,
            chunk: event.chunk,
          });
        });

        pipeline.on('stage:complete', (event) => {
          orchestratorConfig.onPipelineEvent({
            type: 'stage:complete',
            stageName: event.stageName,
            costUsd: event.costUsd,
            durationMs: event.durationMs,
          });
        });

        pipeline.on('stage:error', (event) => {
          orchestratorConfig.onPipelineEvent({
            type: 'stage:error',
            stageName: event.stageName,
            error: event.error.message,
          });
        });

        try {
          const result = await pipeline.run();

          orchestratorConfig.onPipelineEvent({
            type: 'pipeline:complete',
            totalCostUsd: result.totalCostUsd,
            report: result.primaryOutput,
          });

          return {
            inputs: resolvedInputs,
            skill: skillName,
            stagesCompleted: result.stagesCompleted,
            totalCostUsd: result.totalCostUsd,
            report: result.primaryOutput.slice(0, 2000),
            fullReportAvailable: result.primaryOutput.length > 2000,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          orchestratorConfig.onPipelineEvent({
            type: 'pipeline:error',
            error: message,
          });
          return { error: message };
        }
      },
    },

    preview_pipeline: {
      description: 'Preview a pipeline execution plan with real cost and time estimates, without executing it. Use this in plan mode instead of run_pipeline.',
      inputSchema: z.object({
        skill: z.string().default('deep-dive').describe('Analysis skill to preview'),
        inputs: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
        ).describe('Skill inputs as key-value pairs'),
        model: z.string().optional().describe('Override the model for all pipeline stages'),
      }),
      execute: async ({ skill: skillName, inputs: rawInputs, model }: {
        skill: string;
        inputs: Record<string, string | number | boolean | string[]>;
        model?: string;
      }) => {
        const skillEntry = findSkill(skillName, builtInDir, userDir);
        if (!skillEntry) {
          return { error: `Skill "${skillName}" not found.` };
        }

        const skill = skillEntry.skill;

        // Validate inputs
        const declaredInputs = skill.inputs ?? [];
        const resolvedInputs: Record<string, string | number | boolean | string[]> = {};
        for (const decl of declaredInputs) {
          const provided = rawInputs[decl.name];
          if (provided !== undefined) {
            resolvedInputs[decl.name] = provided;
          } else if (decl.default !== undefined) {
            resolvedInputs[decl.name] = decl.default;
          } else if (decl.required) {
            return {
              error: `Missing required input "${decl.name}" for skill "${skillName}".`,
            };
          }
        }

        const agentConfigMap = buildAgentConfigMap(config);
        const estimate = estimatePipelineCost(skill, model, Object.keys(agentConfigMap).length > 0 ? agentConfigMap : undefined, (n: string) => findSkill(n, builtInDir, userDir), remapModel);

        return {
          preview: true,
          skillName,
          description: skill.description,
          inputs: resolvedInputs,
          stages: estimate.stages.map(s => ({
            name: s.stageName,
            model: s.model,
            agentType: s.agentType,
            estimatedCostUsd: s.estimatedCostUsd,
            estimatedTimeSeconds: s.estimatedTimeSeconds,
            tools: s.tools,
          })),
          executionLevels: estimate.executionLevels,
          dagVisualization: formatDagVisualization(estimate.executionLevels),
          totalEstimatedCostUsd: estimate.totalEstimatedCostUsd,
          totalEstimatedTimeSeconds: estimate.totalEstimatedTimeSeconds,
          toolsRequired: estimate.toolsRequired,
          toolsOptional: estimate.toolsOptional,
        };
      },
    },

    list_skills: {
      description: 'List all available analysis skills. Use detail=true for full info (slower).',
      inputSchema: z.object({
        detail: z.boolean().optional().default(false).describe('If true, load full skill details (inputs, stages). Default: false (fast summary).'),
      }),
      execute: async ({ detail }: { detail?: boolean }) => {
        if (detail) {
          const scanned = scanSkillFiles(builtInDir, userDir);
          const skills = scanned.map(s => {
            try {
              const entry = loadSkillFile(s.filePath, s.source);
              return {
                name: entry.skill.name,
                description: entry.skill.description,
                inputs: (entry.skill.inputs ?? []).map(i => ({
                  name: i.name,
                  type: i.type,
                  required: i.required,
                  ...(i.default !== undefined ? { default: i.default } : {}),
                  ...(i.description ? { description: i.description } : {}),
                })),
                stages: entry.skill.stages.map(st => st.name),
                source: s.source,
              };
            } catch {
              return { name: s.name, description: 'Failed to load', stages: [] as string[], source: s.source };
            }
          });

          const agentSkills = (options.agentSkillSummaries ?? []).map(s => ({
            name: s.name,
            description: s.description,
            kind: 'agent' as const,
            source: s.source,
          }));

          return { pipelineSkills: skills, agentSkills };
        }

        // Fast path: summaries only
        const summaries = scanSkillSummaries(builtInDir, userDir);
        const agentSkills = (options.agentSkillSummaries ?? []).map(s => ({
          name: s.name,
          description: s.description,
          kind: 'agent' as const,
          source: s.source,
        }));
        return {
          pipelineSkills: summaries.map(s => ({
            name: s.name,
            description: s.description,
            source: s.source,
          })),
          agentSkills,
        };
      },
    },

    get_skill_detail: {
      description: 'Get detailed information about a specific skill including inputs, stages, tools, and cost estimate.',
      inputSchema: z.object({
        name: z.string().describe('Skill name to get details for'),
      }),
      execute: async ({ name }: { name: string }) => {
        // Check pipeline skills first
        const skillEntry = findSkill(name, builtInDir, userDir);
        if (skillEntry) {
          const skill = skillEntry.skill;
          const estimate = estimatePipelineCost(skill, undefined, undefined, undefined, remapModel);

          return {
            name: skill.name,
            description: skill.description,
            kind: 'pipeline' as const,
            source: skillEntry.source,
            inputs: (skill.inputs ?? []).map(i => ({
              name: i.name,
              type: i.type,
              required: i.required,
              ...(i.default !== undefined ? { default: i.default } : {}),
              ...(i.description ? { description: i.description } : {}),
            })),
            stages: skill.stages.map(st => ({
              name: st.name,
              description: st.description,
              model: st.model,
              tools: st.tools,
              input_from: st.input_from,
              sub_pipeline: st.sub_pipeline,
            })),
            tools_required: skill.tools_required,
            tools_optional: skill.tools_optional,
            estimatedCostUsd: estimate.totalEstimatedCostUsd,
            executionLevels: estimate.executionLevels,
          };
        }

        // Check agent skills
        const agentSummary = (options.agentSkillSummaries ?? []).find(s => s.name === name);
        if (agentSummary) {
          try {
            const agentSkill = loadAgentSkill(agentSummary.dirPath, agentSummary.source);
            const bodyPreview = agentSkill.body.slice(0, 500);
            return {
              name: agentSkill.frontmatter.name,
              description: agentSkill.frontmatter.description,
              kind: 'agent' as const,
              source: agentSummary.source,
              bodyPreview,
              bodyTokenEstimate: Math.ceil(agentSkill.body.length / 4),
              hasPipeline: !!agentSkill.pipelineSkillPath,
            };
          } catch {
            return { error: `Failed to load agent skill "${name}".` };
          }
        }

        return { error: `Skill "${name}" not found.` };
      },
    },

    get_quote: {
      description: 'Get a real-time stock quote with price, change, volume, and market cap.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
      }),
      execute: async ({ ticker }: { ticker: string }) => {
        const toolRegistry = new ToolRegistry();
        const toolContext: ToolContext = {
          config: {
            userAgent: 'scrutari-cli/0.1 (scrutari@example.com)',
          },
        };
        const result = await toolRegistry.executeTool('market_data_get_quote', { ticker: ticker.toUpperCase() }, toolContext);
        if (!result.success) {
          return { error: result.error ?? 'Failed to fetch quote' };
        }
        return result.data;
      },
    },

    search_filings: {
      description: 'Search SEC EDGAR for company filings (10-K, 10-Q, 8-K, etc.).',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol'),
        formType: z.string().optional().describe('SEC form type filter (e.g., 10-K, 10-Q)'),
      }),
      execute: async ({ ticker, formType }: { ticker: string; formType?: string }) => {
        const toolRegistry = new ToolRegistry();
        const toolContext: ToolContext = {
          config: {
            userAgent: 'scrutari-cli/0.1 (scrutari@example.com)',
          },
        };
        const result = await toolRegistry.executeTool(
          'edgar_search_filings',
          { ticker: ticker.toUpperCase(), filing_type: formType },
          toolContext,
        );
        if (!result.success) {
          return { error: result.error ?? 'Failed to search filings' };
        }
        return result.data;
      },
    },

    search_news: {
      description: 'Search for recent financial news articles.',
      inputSchema: z.object({
        query: z.string().describe('Search query (e.g., "NVDA earnings", "AI chip shortage")'),
      }),
      execute: async ({ query }: { query: string }) => {
        const toolRegistry = new ToolRegistry();
        const toolContext: ToolContext = {
          config: {},
        };
        const result = await toolRegistry.executeTool('news_search', { query }, toolContext);
        if (!result.success) {
          return { error: result.error ?? 'Failed to search news' };
        }
        return result.data;
      },
    },

    manage_config: {
      description: 'View or update scrutari configuration.',
      inputSchema: z.object({
        action: z.enum(['show', 'set']).describe("'show' to display config, 'set' to update a value"),
        key: z.string().optional().describe('Config key to set (e.g., defaults.provider)'),
        value: z.string().optional().describe('Value to set'),
      }),
      execute: async ({ action, key, value }: { action: 'show' | 'set'; key?: string; value?: string }) => {
        if (action === 'show') {
          return {
            provider: config.defaults.provider,
            model: config.defaults.model,
            max_budget_usd: config.defaults.max_budget_usd,
            output_format: config.defaults.output_format,
            output_dir: config.defaults.output_dir,
            skills_dir: config.skills_dir,
          };
        }
        if (action === 'set' && key && value) {
          try {
            setConfigValue(key, value);
            return { success: true, message: `Set ${key} = ${value}` };
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        }
        return { error: 'Invalid action or missing key/value' };
      },
    },

    list_sessions: {
      description: 'List past chat sessions.',
      inputSchema: z.object({}),
      execute: async () => {
        const sessions = listSessions();
        return { sessions };
      },
    },

    activate_skill: {
      description: 'Activate an agent skill to load its domain expertise into the conversation context. Only one agent skill can be active at a time.',
      inputSchema: z.object({
        name: z.string().describe('Agent skill name to activate'),
      }),
      execute: async ({ name }: { name: string }) => {
        const agentSummary = (options.agentSkillSummaries ?? []).find(s => s.name === name);
        if (!agentSummary) {
          return { error: `Agent skill "${name}" not found. Use list_skills to see available agent skills.` };
        }

        try {
          const skill = loadAgentSkill(agentSummary.dirPath, agentSummary.source);
          if (orchestratorConfig.onAgentSkillActivated) {
            orchestratorConfig.onAgentSkillActivated(skill);
          }
          return {
            activated: name,
            description: skill.frontmatter.description,
            hasPipeline: !!skill.pipelineSkillPath,
            message: `Agent skill "${name}" is now active. Its methodology and instructions are loaded into context.${skill.pipelineSkillPath ? ' This skill also has a co-located pipeline that can be run with run_pipeline.' : ''}`,
          };
        } catch (err) {
          return { error: `Failed to load agent skill "${name}": ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },

    read_skill_resource: {
      description: 'Read a reference file from the active agent skill directory (e.g., guides, glossaries, templates).',
      inputSchema: z.object({
        path: z.string().describe('Relative path within the skill directory (e.g., "references/guide.md", "scripts/calc.py")'),
      }),
      execute: async ({ path }: { path: string }) => {
        const activeSkill = options.activeAgentSkill;
        if (!activeSkill) {
          return { error: 'No agent skill is currently active. Use activate_skill first.' };
        }

        try {
          const content = readAgentSkillResource(activeSkill.dirPath, path);
          return { path, content };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },

    // MCP tools exposed directly to the orchestrator LLM
    ...mcpOrchestratorTools,
  };

  // Read-only mode: filter to only read-only tools
  if (options.readOnly) {
    const filtered: Record<string, unknown> = {};
    for (const [name, tool] of Object.entries(allTools)) {
      if (READ_ONLY_TOOLS.has(name)) {
        // In read-only mode, block manage_config set action
        if (name === 'manage_config') {
          const original = tool as { description: string; inputSchema: z.ZodSchema; execute: (params: { action: string; key?: string; value?: string }) => Promise<unknown> };
          filtered[name] = {
            ...original,
            execute: async (params: { action: string; key?: string; value?: string }) => {
              if (params.action === 'set') {
                return { error: 'Config changes are not allowed in read-only mode.' };
              }
              return original.execute(params);
            },
          };
        } else {
          filtered[name] = tool;
        }
      }
    }
    return filtered as typeof allTools;
  }

  // Permission wrapping
  const permissions = options.permissions ?? {};
  if (Object.keys(permissions).length > 0) {
    for (const [name, tool] of Object.entries(allTools)) {
      const level = resolvePermission(name, permissions);
      if (level === 'deny') {
        const typedTool = tool as { description: string; inputSchema: z.ZodSchema; execute: (...args: unknown[]) => Promise<unknown> };
        typedTool.execute = async () => ({
          error: `Tool "${name}" is denied by permission configuration.`,
        });
      } else if (level === 'confirm' && orchestratorConfig.onPermissionRequired) {
        const typedTool = tool as { description: string; inputSchema: z.ZodSchema; execute: (params: unknown) => Promise<unknown> };
        const originalExecute = typedTool.execute;
        const onPermReq = orchestratorConfig.onPermissionRequired;
        typedTool.execute = async (params: unknown) => {
          const approved = await onPermReq(name, params as Record<string, unknown>);
          if (!approved) {
            return { error: `Tool "${name}" was denied by user.` };
          }
          return originalExecute(params);
        };
      }
    }
  }

  return allTools;
}
