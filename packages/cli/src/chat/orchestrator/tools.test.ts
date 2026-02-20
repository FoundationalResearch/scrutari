import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { Config } from '../../config/index.js';
import type { OrchestratorConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test
// ---------------------------------------------------------------------------

const mockScanSkillFiles = vi.fn();
const mockLoadSkillFile = vi.fn();

const mockPipelineRun = vi.fn();
const mockPipelineOn = vi.fn();

vi.mock('@scrutari/core', () => ({
  scanSkillFiles: (...args: unknown[]) => mockScanSkillFiles(...args),
  loadSkillFile: (...args: unknown[]) => mockLoadSkillFile(...args),
  PipelineEngine: vi.fn().mockImplementation(() => ({
    run: mockPipelineRun,
    on: mockPipelineOn,
  })),
}));

const mockRegisterGroup = vi.fn();

vi.mock('@scrutari/tools', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    resolveToolGroups: vi.fn().mockReturnValue([]),
    toAISDKToolSet: vi.fn().mockReturnValue({}),
    isAvailable: vi.fn().mockReturnValue(false),
    registerGroup: mockRegisterGroup,
  })),
}));

vi.mock('../session/storage.js', () => ({
  listSessions: vi.fn().mockReturnValue([]),
}));

vi.mock('../../config/index.js', () => ({
  setConfigValue: vi.fn(),
}));

// Stub existsSync so getBuiltInSkillsDir() resolves without the filesystem
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

import { createOrchestratorTools } from './tools.js';
import { PipelineEngine } from '@scrutari/core';
import type { MCPClientManager } from '@scrutari/mcp';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<Config>): Config {
  return {
    defaults: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      max_budget_usd: 5.0,
      output_format: 'markdown',
      output_dir: './output',
    },
    skills_dir: '~/.scrutari/skills',
    providers: {
      anthropic: { api_key: 'sk-test', default_model: 'claude-sonnet-4-20250514' },
      openai: { api_key: undefined, default_model: 'gpt-4o' },
      google: { api_key: undefined, default_model: 'gemini-2.5-flash' },
    },
    mcp: { servers: [] },
    ...overrides,
  } as Config;
}

function makeOrchestratorConfig(): OrchestratorConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxBudget: 5.0,
    onTextDelta: vi.fn(),
    onReasoningDelta: vi.fn(),
    onToolCallStart: vi.fn(),
    onToolCallComplete: vi.fn(),
    onPipelineEvent: vi.fn(),
  };
}

function makeSkillEntry(overrides: {
  name: string;
  inputs?: Array<{
    name: string;
    type: 'string' | 'string[]' | 'number' | 'boolean';
    required: boolean;
    default?: string | number | boolean | string[];
    description?: string;
  }>;
}) {
  return {
    skill: {
      name: overrides.name,
      description: `Test skill: ${overrides.name}`,
      inputs: overrides.inputs ?? [],
      stages: [{ name: 'gather', prompt: 'test', description: 'test stage' }],
      output: { primary: 'gather', format: 'markdown' as const },
    },
    filePath: `/skills/${overrides.name}.yaml`,
    source: 'built-in' as const,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('run_pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineRun.mockResolvedValue({
      stagesCompleted: 1,
      totalCostUsd: 0.01,
      primaryOutput: 'Test report output',
    });
  });

  it('passes single required input to pipeline', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true, description: 'Stock ticker' }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('inputs');
    expect((result as { inputs: Record<string, unknown> }).inputs).toEqual({ ticker: 'NVDA' });
    expect(result).toHaveProperty('skill', 'deep-dive');
    expect(result).toHaveProperty('report', 'Test report output');
  });

  it('passes array inputs to pipeline', async () => {
    const entry = makeSkillEntry({
      name: 'comp-analysis',
      inputs: [{ name: 'tickers', type: 'string[]', required: true, description: 'Tickers to compare' }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'comp-analysis', filePath: '/skills/comp-analysis.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'comp-analysis',
      inputs: { tickers: ['AAPL', 'NVDA', 'MSFT'] },
    });

    expect(result).toHaveProperty('inputs');
    expect((result as { inputs: Record<string, unknown> }).inputs).toEqual({ tickers: ['AAPL', 'NVDA', 'MSFT'] });
  });

  it('applies default values for missing optional inputs', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [
        { name: 'ticker', type: 'string', required: true },
        { name: 'depth', type: 'string', required: false, default: 'standard' },
      ],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'AAPL' },
    });

    expect(result).toHaveProperty('inputs');
    const inputs = (result as { inputs: Record<string, unknown> }).inputs;
    expect(inputs).toEqual({ ticker: 'AAPL', depth: 'standard' });
  });

  it('returns error for missing required inputs', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [
        { name: 'ticker', type: 'string', required: true, description: 'Stock ticker' },
        { name: 'depth', type: 'string', required: false, default: 'standard' },
      ],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: {},
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Missing required input "ticker"');
    expect((result as { error: string }).error).toContain('deep-dive');
  });

  it('returns error when skill is not found', async () => {
    mockScanSkillFiles.mockReturnValue([]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'nonexistent',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toEqual({ error: 'Skill "nonexistent" not found.' });
  });

  it('passes multiple inputs including optional ones', async () => {
    const entry = makeSkillEntry({
      name: 'thesis-gen',
      inputs: [
        { name: 'ticker', type: 'string', required: true },
        { name: 'bias', type: 'string', required: false, default: 'neutral' },
      ],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'thesis-gen', filePath: '/skills/thesis-gen.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'thesis-gen',
      inputs: { ticker: 'TSLA', bias: 'bullish' },
    });

    expect(result).toHaveProperty('inputs');
    const inputs = (result as { inputs: Record<string, unknown> }).inputs;
    expect(inputs).toEqual({ ticker: 'TSLA', bias: 'bullish' });
  });

  it('omits optional inputs without defaults when not provided', async () => {
    const entry = makeSkillEntry({
      name: 'earnings-review',
      inputs: [
        { name: 'ticker', type: 'string', required: true },
        { name: 'quarter', type: 'string', required: false },
      ],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'earnings-review', filePath: '/skills/earnings-review.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.run_pipeline.execute({
      skill: 'earnings-review',
      inputs: { ticker: 'GOOG' },
    });

    expect(result).toHaveProperty('inputs');
    const inputs = (result as { inputs: Record<string, unknown> }).inputs;
    expect(inputs).toEqual({ ticker: 'GOOG' });
    expect(inputs).not.toHaveProperty('quarter');
  });

  it('does not set modelOverride when model is not provided', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    const ctorCall = vi.mocked(PipelineEngine).mock.calls[0][0];
    expect(ctorCall.modelOverride).toBeUndefined();
  });

  it('sets modelOverride when model is explicitly provided', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
      model: 'claude-haiku-3-5-20241022',
    });

    const ctorCall = vi.mocked(PipelineEngine).mock.calls[0][0];
    expect(ctorCall.modelOverride).toBe('claude-haiku-3-5-20241022');
  });
});

describe('list_skills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes skill inputs in list_skills response', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [
        { name: 'ticker', type: 'string', required: true, description: 'Stock ticker' },
        { name: 'depth', type: 'string', required: false, default: 'standard', description: 'Analysis depth' },
      ],
    });

    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.list_skills.execute();

    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.name).toBe('deep-dive');
    expect(skill).toHaveProperty('inputs');
    expect(skill.inputs).toEqual([
      { name: 'ticker', type: 'string', required: true, description: 'Stock ticker' },
      { name: 'depth', type: 'string', required: false, default: 'standard', description: 'Analysis depth' },
    ]);
  });

  it('returns empty inputs array when skill has no declared inputs', async () => {
    const entry = makeSkillEntry({ name: 'no-inputs' });

    mockScanSkillFiles.mockReturnValue([{ name: 'no-inputs', filePath: '/skills/no-inputs.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.list_skills.execute();

    expect(result.skills[0].inputs).toEqual([]);
  });

  it('omits default and description fields when not present', async () => {
    const entry = makeSkillEntry({
      name: 'minimal',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });

    mockScanSkillFiles.mockReturnValue([{ name: 'minimal', filePath: '/skills/minimal.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.list_skills.execute();

    const input = result.skills[0].inputs[0];
    expect(input).toEqual({ name: 'ticker', type: 'string', required: true });
    expect(input).not.toHaveProperty('default');
    expect(input).not.toHaveProperty('description');
  });
});

// ---------------------------------------------------------------------------
// MCP integration tests
// ---------------------------------------------------------------------------

function makeMockMCPClient(tools: Array<{ name: string; description: string; serverName: string }>): MCPClientManager {
  const adaptedTools = tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: z.object({ query: z.string() }),
    execute: vi.fn().mockResolvedValue({ success: true, data: { result: 'mocked' } }),
  }));

  const serverGroups = new Map<string, typeof adaptedTools>();
  for (const t of tools) {
    if (!serverGroups.has(t.serverName)) serverGroups.set(t.serverName, []);
    serverGroups.get(t.serverName)!.push(adaptedTools.find(a => a.name === t.name)!);
  }

  const serverInfos = [...serverGroups.entries()].map(([name, sTools]) => ({
    name,
    transport: 'stdio' as const,
    tools: sTools.map(st => ({
      qualifiedName: st.name,
      originalName: st.name.split('/')[1],
      serverName: name,
      description: st.description,
    })),
  }));

  return {
    listTools: vi.fn().mockReturnValue(adaptedTools),
    getServerInfos: vi.fn().mockReturnValue(serverInfos),
    size: serverGroups.size,
  } as unknown as MCPClientManager;
}

describe('MCP integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineRun.mockResolvedValue({
      stagesCompleted: 1,
      totalCostUsd: 0.01,
      primaryOutput: 'Test report output',
    });
  });

  it('exposes MCP tools as direct orchestrator tools', () => {
    const mcpClient = makeMockMCPClient([
      { name: 'bloomberg/get_quote', description: 'Get Bloomberg quote', serverName: 'bloomberg' },
      { name: 'bloomberg/get_news', description: 'Get Bloomberg news', serverName: 'bloomberg' },
    ]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);

    expect(tools).toHaveProperty('bloomberg/get_quote');
    expect(tools).toHaveProperty('bloomberg/get_news');
    expect(tools['bloomberg/get_quote'].description).toBe('Get Bloomberg quote');
  });

  it('MCP tool execute delegates to adapted tool', async () => {
    const mcpClient = makeMockMCPClient([
      { name: 'bloomberg/get_quote', description: 'Get Bloomberg quote', serverName: 'bloomberg' },
    ]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
    const result = await tools['bloomberg/get_quote'].execute({ query: 'AAPL' });

    expect(result).toEqual({ result: 'mocked' });
  });

  it('registers MCP tool groups into pipeline ToolRegistry', async () => {
    const mcpClient = makeMockMCPClient([
      { name: 'bloomberg/get_quote', description: 'Get Bloomberg quote', serverName: 'bloomberg' },
    ]);

    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
    await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(mockRegisterGroup).toHaveBeenCalledWith('bloomberg', expect.arrayContaining([
      expect.objectContaining({ name: 'bloomberg/get_quote' }),
    ]));
  });

  it('works without MCP client (undefined)', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());

    // Should have built-in tools only, no MCP tools
    expect(tools).toHaveProperty('run_pipeline');
    expect(tools).toHaveProperty('list_skills');
    expect(tools).not.toHaveProperty('bloomberg/get_quote');
  });

  it('works with MCP client that has no tools', () => {
    const mcpClient = makeMockMCPClient([]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);

    expect(tools).toHaveProperty('run_pipeline');
    expect(tools).toHaveProperty('list_skills');
  });
});
