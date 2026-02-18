import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { getConfig, type GlobalOptions } from '../context.js';
import { renderAnalysis, runHeadless } from '../tui/index.js';
import type {
  PipelineContext,
  PipelineCompleteEvent,
  StageCompleteEvent,
  SkillEntry,
  ToolUnavailableEvent,
  StageUsageInfo,
} from '@scrutari/core';
import {
  PipelineEngine,
  loadSkillFile,
  scanSkillFiles,
  topologicalSort,
  writeOutputAsync,
} from '@scrutari/core';
import { ToolRegistry, type ToolContext } from '@scrutari/tools';
import { MCPClientManager, type MCPServerConfig } from '@scrutari/mcp';

interface AnalyzeOptions {
  skill?: string;
  model?: string;
  output?: string;
  outputDir?: string;
  deep?: boolean;
  budget?: string;
}

function getBuiltInSkillsDir(): string {
  // Works with both tsup bundle (dist/index.js) and tsc output (dist/commands/analyze.js)
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // tsup bundle: dist/index.js -> ../skills/
  const bundledPath = resolve(thisDir, '..', 'skills');
  if (existsSync(bundledPath)) return bundledPath;

  // tsc dev layout: dist/commands/analyze.js -> ../../../../skills/
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

  // User skills override built-in by name
  const userMatch = scanned.find((s: { name: string; source: string }) => s.name === name && s.source === 'user');
  const builtInMatch = scanned.find((s: { name: string; source: string }) => s.name === name && s.source === 'built-in');
  const match = userMatch ?? builtInMatch;

  if (!match) return undefined;
  return loadSkillFile(match.filePath, match.source);
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Run deep analysis on a ticker')
    .argument('<ticker>', 'Stock ticker symbol (e.g., AAPL)')
    .option('-s, --skill <name>', 'Skill to use for analysis')
    .option('-m, --model <model>', 'Override default model')
    .option('-o, --output <format>', 'Output format (markdown|json|docx)')
    .option('--output-dir <dir>', 'Output directory')
    .option('--deep', 'Use deep-dive skill')
    .option('--budget <usd>', 'Budget cap in USD')
    .action(async (ticker: string, options: AnalyzeOptions, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const config = getConfig();

      const skillName = options.deep ? 'deep-dive' : (options.skill ?? 'deep-dive');
      const model = options.model ?? config.defaults.model;
      const budgetUsd = options.budget ? parseFloat(options.budget) : config.defaults.max_budget_usd;
      const outputFormat = (options.output ?? config.defaults.output_format) as 'markdown' | 'json' | 'docx';
      const outputDir = options.outputDir ?? config.defaults.output_dir;
      const useTui = process.stdout.isTTY === true && globalOpts.tui !== false;

      // Load the requested skill
      const builtInDir = getBuiltInSkillsDir();
      const userDir = expandTilde(config.skills_dir);
      let skillEntry: SkillEntry | undefined;

      try {
        skillEntry = findSkill(skillName, builtInDir, userDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to load skill "${skillName}": ${message}`));
        process.exitCode = 1;
        return;
      }

      if (!skillEntry) {
        console.error(chalk.red(`Skill "${skillName}" not found.`));
        console.error(chalk.dim(`Searched: ${builtInDir}`));
        if (userDir) console.error(chalk.dim(`         ${userDir}`));
        process.exitCode = 1;
        return;
      }

      const skill = skillEntry.skill;
      const stageNames = topologicalSort(skill);

      // Build pipeline context
      const tickerUpper = ticker.toUpperCase();

      // Set up tool registry and resolver
      const toolRegistry = new ToolRegistry();
      const toolContext: ToolContext = {
        config: {
          userAgent: config.providers.anthropic.api_key
            ? 'scrutari-cli/0.1 (scrutari@example.com)'
            : undefined,
          // Merge tools_config into tool context
          ...(skill.tools_config ?? {}),
        },
      };

      // Connect MCP servers and register their tools
      const mcpManager = new MCPClientManager();
      if (config.mcp.servers.length > 0) {
        await mcpManager.initialize(
          config.mcp.servers as MCPServerConfig[],
          (serverName, error) => {
            if (!globalOpts.json) {
              console.error(chalk.yellow(`Warning: MCP server "${serverName}" failed: ${error.message}`));
            }
          },
        );

        // Register MCP tools as dynamic groups in the tool registry
        for (const serverInfo of mcpManager.getServerInfos()) {
          const mcpTools = mcpManager.listTools().filter(t => t.name.startsWith(serverInfo.name + '/'));
          toolRegistry.registerGroup(serverInfo.name, mcpTools);
        }
      }

      const resolveTools = (groupNames: string[]) => {
        const tools = toolRegistry.resolveToolGroups(groupNames);
        return toolRegistry.toAISDKToolSet(tools, toolContext);
      };

      const pipelineContext: PipelineContext = {
        skill,
        inputs: { ticker: tickerUpper },
        modelOverride: options.model,
        maxBudgetUsd: budgetUsd,
        providerConfig: {
          providers: {
            anthropic: { apiKey: config.providers.anthropic.api_key },
            openai: { apiKey: config.providers.openai.api_key },
          },
        },
        resolveTools,
        isToolAvailable: (name: string) => toolRegistry.isAvailable(name),
        toolsConfig: skill.tools_config,
      };

      const pipeline = new PipelineEngine(pipelineContext);

      // Listen for tool availability warnings
      pipeline.on('tool:unavailable', (event: ToolUnavailableEvent) => {
        if (!globalOpts.json && !event.required) {
          console.log(chalk.yellow(`  Warning: Optional tool "${event.toolName}" is not available`));
        }
      });

      // Collect per-stage usage data for output formatters
      const stageUsage: Record<string, StageUsageInfo> = {};
      pipeline.on('stage:complete', (event: StageCompleteEvent) => {
        stageUsage[event.stageName] = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          costUsd: event.costUsd,
          model: event.model,
          durationMs: event.durationMs,
        };
      });

      // Set up output saving on pipeline completion
      pipeline.on('pipeline:complete', async (event: PipelineCompleteEvent) => {
        try {
          const result = await writeOutputAsync({
            skill,
            primaryOutput: event.primaryOutput,
            outputs: event.outputs,
            inputs: { ticker: tickerUpper },
            outputDir: resolve(outputDir),
            outputFormat,
            model,
            totalCostUsd: event.totalCostUsd,
            totalDurationMs: event.totalDurationMs,
            verification: event.verificationReport,
            stageUsage,
          });

          if (!globalOpts.json) {
            console.log(chalk.dim(`  Output: ${result.primaryPath}`));
            if (result.intermediatePaths.length > 0) {
              console.log(chalk.dim(`  Intermediate outputs: ${result.intermediatePaths.length} files`));
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.yellow(`Warning: Failed to save output: ${message}`));
        }
      });

      const analysisProps = {
        ticker: tickerUpper,
        skill: skillName,
        model,
        budgetUsd,
        stages: stageNames,
        pipeline,
        outputDir,
        outputFormat,
        verbose: globalOpts.verbose,
      };

      try {
        if (globalOpts.json) {
          try {
            const result = await pipeline.run();
            console.log(JSON.stringify({
              command: 'analyze',
              ticker: tickerUpper,
              skill: skillName,
              stagesCompleted: result.stagesCompleted,
              totalCostUsd: result.totalCostUsd,
              totalDurationMs: result.totalDurationMs,
              primaryOutput: result.primaryOutput,
            }, null, 2));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(JSON.stringify({ error: message }));
            process.exitCode = 1;
          }
          return;
        }

        try {
          if (useTui) {
            await renderAnalysis(analysisProps);
          } else {
            await runHeadless(analysisProps);
          }
        } catch {
          process.exitCode = 1;
        }
      } finally {
        await mcpManager.disconnect();
      }
    });
}
