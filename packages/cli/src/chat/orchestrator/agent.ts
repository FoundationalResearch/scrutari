import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from '../../config/index.js';
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
}

export async function runOrchestrator(
  messages: ChatMessage[],
  config: Config,
  orchestratorConfig: OrchestratorConfig,
  skillNames: string[],
): Promise<OrchestratorResult> {
  const systemPrompt = buildSystemPrompt(config, skillNames);
  const model = getModel(config);
  const tools = createOrchestratorTools(config, orchestratorConfig);
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

  return { content, thinking, toolCallCount };
}
