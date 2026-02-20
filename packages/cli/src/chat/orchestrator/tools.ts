import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { Config } from '../../config/index.js';
import { setConfigValue } from '../../config/index.js';
import {
  PipelineEngine,
  loadSkillFile,
  scanSkillFiles,
  type PipelineContext,
  type SkillEntry,
} from '@scrutari/core';
import { ToolRegistry, type ToolContext } from '@scrutari/tools';
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

export function createOrchestratorTools(config: Config, orchestratorConfig: OrchestratorConfig) {
  const builtInDir = getBuiltInSkillsDir();
  const userDir = expandTilde(config.skills_dir);

  return {
    run_pipeline: {
      description: 'Run a skill-based analysis pipeline on a stock ticker. Returns the analysis report.',
      inputSchema: z.object({
        ticker: z.string().describe('Stock ticker symbol (e.g., AAPL, NVDA)'),
        skill: z.string().default('deep-dive').describe('Analysis skill to use'),
        budget: z.number().optional().describe('Budget cap in USD'),
      }),
      execute: async ({ ticker, skill: skillName, budget }: { ticker: string; skill: string; budget?: number }) => {
        const tickerUpper = ticker.toUpperCase();
        const budgetUsd = budget ?? config.defaults.max_budget_usd;

        const skillEntry = findSkill(skillName, builtInDir, userDir);
        if (!skillEntry) {
          return { error: `Skill "${skillName}" not found.` };
        }

        const skill = skillEntry.skill;

        const toolRegistry = new ToolRegistry();
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
          return toolRegistry.toAISDKToolSet(tools, toolContext);
        };

        const pipelineContext: PipelineContext = {
          skill,
          inputs: { ticker: tickerUpper },
          modelOverride: config.defaults.model,
          maxBudgetUsd: budgetUsd,
          providerConfig: {
            providers: {
              anthropic: { apiKey: config.providers.anthropic.api_key },
              openai: { apiKey: config.providers.openai.api_key },
              google: { apiKey: config.providers.google.api_key },
            },
          },
          resolveTools,
          isToolAvailable: (name: string) => toolRegistry.isAvailable(name),
          toolsConfig: skill.tools_config,
          abortSignal: orchestratorConfig.abortSignal,
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
            ticker: tickerUpper,
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

    list_skills: {
      description: 'List all available analysis skills.',
      inputSchema: z.object({}),
      execute: async () => {
        const scanned = scanSkillFiles(builtInDir, userDir);
        const skills = scanned.map(s => {
          try {
            const entry = loadSkillFile(s.filePath, s.source);
            return {
              name: entry.skill.name,
              description: entry.skill.description,
              stages: entry.skill.stages.map(st => st.name),
              source: s.source,
            };
          } catch {
            return { name: s.name, description: 'Failed to load', stages: [] as string[], source: s.source };
          }
        });
        return { skills };
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
  };
}
