import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { MCPClientManager } from '@scrutari/mcp';
import type { SkillSummary, AgentSkillSummary, AgentSkill, HookManager } from '@scrutari/core';
import type { Config } from '../../config/index.js';
import type { ContextBundle } from '../../context/types.js';
import type { OrchestratorConfig, ChatMessage } from '../types.js';
import { buildSystemPrompt } from './system-prompt.js';
import { createOrchestratorTools } from './tools.js';

function getModel(config: Config) {
  const provider = config.defaults.provider;
  const modelId = config.defaults.model;

  if (provider === 'openai') {
    const openai = createOpenAI({
      apiKey: config.providers.openai.api_key,
    });
    return openai(modelId);
  }

  if (provider === 'google') {
    const google = createGoogleGenerativeAI({
      apiKey: config.providers.google.api_key,
    });
    return google(modelId);
  }

  if (provider === 'minimax') {
    const minimax = createOpenAI({
      apiKey: config.providers.minimax.api_key,
      baseURL: 'https://api.minimax.io/v1',
    });
    return minimax.chat(modelId);
  }

  const anthropic = createAnthropic({
    apiKey: config.providers.anthropic.api_key,
  });
  return anthropic(modelId);
}

function toCoreMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
}

export interface OrchestratorResult {
  content: string;
  thinking: string;
  toolCallCount: number;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface RunOrchestratorOptions {
  planMode?: boolean;
  dryRun?: boolean;
  readOnly?: boolean;
  contextBundle?: ContextBundle;
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  activeAgentSkill?: AgentSkill;
  sessionSpentUsd?: number;
  sessionBudgetUsd?: number;
  permissions?: Record<string, import('../../config/schema.js').PermissionLevel>;
  hookManager?: HookManager;
}

export async function runOrchestrator(
  messages: ChatMessage[],
  config: Config,
  orchestratorConfig: OrchestratorConfig,
  skillNames: string[],
  mcpClient?: MCPClientManager,
  options: RunOrchestratorOptions = {},
): Promise<OrchestratorResult> {
  const mcpToolNames = mcpClient
    ? mcpClient.listTools().map(t => t.name)
    : [];
  const systemPrompt = buildSystemPrompt(config, skillNames, mcpToolNames, {
    planMode: options.planMode,
    readOnly: options.readOnly,
    contextBundle: options.contextBundle,
    skillSummaries: options.skillSummaries,
    agentSkillSummaries: options.agentSkillSummaries,
    activeAgentSkill: options.activeAgentSkill,
  });
  const model = getModel(config);
  const tools = createOrchestratorTools(config, orchestratorConfig, mcpClient, {
    dryRun: options.dryRun,
    readOnly: options.readOnly,
    approvalThreshold: config.defaults.approval_threshold_usd,
    agentSkillSummaries: options.agentSkillSummaries,
    activeAgentSkill: options.activeAgentSkill,
    sessionSpentUsd: options.sessionSpentUsd,
    sessionBudgetUsd: options.sessionBudgetUsd,
    permissions: options.permissions,
    hookManager: options.hookManager,
  });
  const coreMessages = toCoreMessages(messages);

  let content = '';
  let thinking = '';
  let toolCallCount = 0;

  // Build provider options for thinking (Anthropic only)
  const isAnthropic = config.defaults.provider === 'anthropic';
  const providerOptions = isAnthropic
    ? {
        anthropic: {
          thinking: { type: 'enabled' as const, budgetTokens: 4096 },
        },
      }
    : undefined;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(10),
    abortSignal: orchestratorConfig.abortSignal,
    providerOptions,
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        content += part.text;
        orchestratorConfig.onTextDelta(part.text);
        break;
      case 'reasoning-delta':
        thinking += part.text;
        orchestratorConfig.onReasoningDelta(part.text);
        break;
      case 'tool-call':
        toolCallCount++;
        orchestratorConfig.onToolCallStart({
          id: part.toolCallId,
          name: part.toolName,
          args: (part as Record<string, unknown>).input as Record<string, unknown> ?? {},
          status: 'running',
        });
        break;
      case 'tool-result':
        orchestratorConfig.onToolCallComplete(part.toolCallId, part.output);
        break;
      case 'error':
        content += `\n[Error: ${String(part.error)}]`;
        orchestratorConfig.onTextDelta(`\n[Error: ${String(part.error)}]`);
        break;
    }
  }

  const usage = await result.usage;

  return {
    content,
    thinking,
    toolCallCount,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  };
}
