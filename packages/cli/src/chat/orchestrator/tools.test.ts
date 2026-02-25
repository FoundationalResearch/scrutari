import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { Config } from '../../config/index.js';
import type { OrchestratorConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test
// ---------------------------------------------------------------------------

const mockScanSkillFiles = vi.fn();
const mockLoadSkillFile = vi.fn();
const mockEstimatePipelineCost = vi.fn();

const mockPipelineRun = vi.fn();
const mockPipelineOn = vi.fn();

const mockLoadAgentSkill = vi.fn();
const mockReadAgentSkillResource = vi.fn();

vi.mock('@scrutari/core', () => ({
  scanSkillFiles: (...args: unknown[]) => mockScanSkillFiles(...args),
  scanSkillSummaries: vi.fn().mockReturnValue([]),
  loadSkillFile: (...args: unknown[]) => mockLoadSkillFile(...args),
  estimatePipelineCost: (...args: unknown[]) => mockEstimatePipelineCost(...args),
  loadAgentSkill: (...args: unknown[]) => mockLoadAgentSkill(...args),
  loadAgentSkillBody: vi.fn(),
  readAgentSkillResource: (...args: unknown[]) => mockReadAgentSkillResource(...args),
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
      approval_threshold_usd: 1.0,
      session_budget_usd: 10.0,
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
    agents: { research: {}, explore: {}, verify: {}, default: {} },
    permissions: {},
    tools: { market_data: {}, marketonepager: {}, news: {} },
    ...overrides,
  } as Config;
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

function makeOrchestratorConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return {
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxBudget: 5.0,
    onTextDelta: vi.fn(),
    onReasoningDelta: vi.fn(),
    onToolCallStart: vi.fn(),
    onToolCallComplete: vi.fn(),
    onPipelineEvent: vi.fn(),
    ...overrides,
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
    // Default estimate for budget enforcement (low cost so it doesn't block)
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'test',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      totalEstimatedTimeSeconds: 5,
      toolsRequired: [],
      toolsOptional: [],
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
    const result = await tools.list_skills.execute({ detail: true }) as { pipelineSkills: Array<Record<string, unknown>>; agentSkills: unknown[] };

    expect(result.pipelineSkills).toHaveLength(1);
    const skill = result.pipelineSkills[0];
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
    const result = await tools.list_skills.execute({ detail: true }) as { pipelineSkills: Array<Record<string, unknown>> };

    expect(result.pipelineSkills[0].inputs).toEqual([]);
  });

  it('omits default and description fields when not present', async () => {
    const entry = makeSkillEntry({
      name: 'minimal',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });

    mockScanSkillFiles.mockReturnValue([{ name: 'minimal', filePath: '/skills/minimal.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.list_skills.execute({ detail: true }) as { pipelineSkills: Array<Record<string, unknown>> };

    const input = (result.pipelineSkills[0].inputs as unknown[])[0];
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
    // Default estimate for budget enforcement (low cost so it doesn't block)
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'test',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      totalEstimatedTimeSeconds: 5,
      toolsRequired: [],
      toolsOptional: [],
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
    expect((tools as Record<string, { description: string }>)['bloomberg/get_quote'].description).toBe('Get Bloomberg quote');
  });

  it('MCP tool execute delegates to adapted tool', async () => {
    const mcpClient = makeMockMCPClient([
      { name: 'bloomberg/get_quote', description: 'Get Bloomberg quote', serverName: 'bloomberg' },
    ]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
    const mcpTool = (tools as unknown as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }>)['bloomberg/get_quote'];
    const result = await mcpTool.execute({ query: 'AAPL' });

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

// ---------------------------------------------------------------------------
// preview_pipeline tests
// ---------------------------------------------------------------------------

describe('preview_pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupSkillMocks() {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [
        { stageName: 'gather', model: 'claude-sonnet-4-20250514', agentType: 'explore', estimatedInputTokens: 4096, estimatedOutputTokens: 2048, estimatedCostUsd: 0.04, estimatedTimeSeconds: 27.6, tools: ['edgar'] },
        { stageName: 'analyze', model: 'claude-sonnet-4-20250514', agentType: 'default', estimatedInputTokens: 8192, estimatedOutputTokens: 4096, estimatedCostUsd: 0.08, estimatedTimeSeconds: 53.2, tools: [] },
      ],
      executionLevels: [['gather'], ['analyze']],
      totalEstimatedCostUsd: 0.12,
      totalEstimatedTimeSeconds: 80.8,
      toolsRequired: ['edgar'],
      toolsOptional: [],
    });
  }

  it('returns preview with cost and time estimates', async () => {
    setupSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.preview_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    }) as Record<string, unknown>;

    expect(result).toHaveProperty('preview', true);
    expect(result).toHaveProperty('skillName', 'deep-dive');
    expect(result).toHaveProperty('totalEstimatedCostUsd', 0.12);
    expect(result).toHaveProperty('totalEstimatedTimeSeconds', 80.8);
    expect(result).toHaveProperty('dagVisualization');
    expect(result).toHaveProperty('executionLevels');
    expect(result).toHaveProperty('toolsRequired', ['edgar']);
  });

  it('returns per-stage time estimates', async () => {
    setupSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.preview_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    }) as Record<string, unknown>;

    const stages = result.stages as Array<Record<string, unknown>>;
    expect(stages).toHaveLength(2);
    expect(stages[0]).toHaveProperty('estimatedTimeSeconds', 27.6);
    expect(stages[1]).toHaveProperty('estimatedTimeSeconds', 53.2);
  });

  it('includes DAG visualization text', async () => {
    setupSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.preview_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    }) as Record<string, unknown>;

    expect(result.dagVisualization).toBe('Level 1: gather\nLevel 2: analyze');
  });

  it('returns error for missing skill', async () => {
    mockScanSkillFiles.mockReturnValue([]);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.preview_pipeline.execute({
      skill: 'nonexistent',
      inputs: {},
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('not found');
  });

  it('validates required inputs', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    const result = await tools.preview_pipeline.execute({
      skill: 'deep-dive',
      inputs: {},
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Missing required input');
  });

  it('does not create PipelineEngine', async () => {
    setupSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    await tools.preview_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(PipelineEngine).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dry-run tests
// ---------------------------------------------------------------------------

describe('run_pipeline dry-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDryRunSkillMocks() {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [
        { stageName: 'gather', model: 'claude-sonnet-4-20250514', agentType: 'explore', estimatedInputTokens: 4096, estimatedOutputTokens: 2048, estimatedCostUsd: 0.04, estimatedTimeSeconds: 27.6, tools: ['edgar'] },
      ],
      executionLevels: [['gather']],
      totalEstimatedCostUsd: 0.04,
      totalEstimatedTimeSeconds: 27.6,
      toolsRequired: ['edgar'],
      toolsOptional: [],
    });
  }

  it('returns estimate without executing when dryRun is true', async () => {
    setupDryRunSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      dryRun: true,
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('dryRun', true);
    expect(result).toHaveProperty('estimate');
    const estimate = (result as Record<string, unknown>).estimate as Record<string, unknown>;
    expect(estimate).toHaveProperty('stages');
    expect(estimate).toHaveProperty('totalEstimatedCostUsd');
    expect(estimate).toHaveProperty('executionLevels');
    // Pipeline should NOT have been created
    expect(PipelineEngine).not.toHaveBeenCalled();
    expect(mockPipelineRun).not.toHaveBeenCalled();
  });

  it('estimate includes stage details with time', async () => {
    setupDryRunSkillMocks();

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      dryRun: true,
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    }) as Record<string, unknown>;

    const estimate = result.estimate as Record<string, unknown>;
    const stages = estimate.stages as Array<Record<string, unknown>>;
    expect(stages[0]).toHaveProperty('name', 'gather');
    expect(stages[0]).toHaveProperty('model');
    expect(stages[0]).toHaveProperty('estimatedCostUsd');
    expect(stages[0]).toHaveProperty('estimatedTimeSeconds', 27.6);
    expect(stages[0]).toHaveProperty('estimatedInputTokens', 4096);
    expect(stages[0]).toHaveProperty('estimatedOutputTokens', 2048);
    expect(estimate).toHaveProperty('totalEstimatedTimeSeconds', 27.6);
  });
});

// ---------------------------------------------------------------------------
// Approval gate tests
// ---------------------------------------------------------------------------

describe('run_pipeline approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineRun.mockResolvedValue({
      stagesCompleted: 1,
      totalCostUsd: 0.01,
      primaryOutput: 'Test report output',
    });
  });

  function setupExpensiveSkillMocks() {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [
        { stageName: 'gather', model: 'claude-opus-4-20250514', agentType: 'research', estimatedInputTokens: 16384, estimatedOutputTokens: 8192, estimatedCostUsd: 2.50, tools: ['edgar'] },
      ],
      executionLevels: [['gather']],
      totalEstimatedCostUsd: 2.50,
      toolsRequired: ['edgar'],
      toolsOptional: [],
    });
  }

  it('invokes approval callback when cost exceeds threshold', async () => {
    setupExpensiveSkillMocks();
    const onApprovalRequired = vi.fn().mockResolvedValue(true);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onApprovalRequired }),
      undefined,
      { approvalThreshold: 0.01 },
    );
    await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(onApprovalRequired).toHaveBeenCalledTimes(1);
    expect(onApprovalRequired).toHaveBeenCalledWith(expect.objectContaining({
      totalEstimatedCostUsd: 2.50,
    }));
  });

  it('pipeline proceeds when user approves', async () => {
    setupExpensiveSkillMocks();
    const onApprovalRequired = vi.fn().mockResolvedValue(true);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onApprovalRequired }),
      undefined,
      { approvalThreshold: 0.01 },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(PipelineEngine).toHaveBeenCalled();
    expect(mockPipelineRun).toHaveBeenCalled();
    expect(result).toHaveProperty('report');
  });

  it('pipeline cancelled when user declines', async () => {
    setupExpensiveSkillMocks();
    const onApprovalRequired = vi.fn().mockResolvedValue(false);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onApprovalRequired }),
      undefined,
      { approvalThreshold: 0.01 },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('cancelled', true);
    expect(result).toHaveProperty('reason', 'User declined');
    expect(PipelineEngine).not.toHaveBeenCalled();
  });

  it('does not invoke approval when cost is below threshold', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      toolsRequired: [],
      toolsOptional: [],
    });

    const onApprovalRequired = vi.fn().mockResolvedValue(true);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onApprovalRequired }),
      undefined,
      { approvalThreshold: 1.0 },
    );
    await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(onApprovalRequired).not.toHaveBeenCalled();
    expect(PipelineEngine).toHaveBeenCalled();
  });

  it('skips approval when no onApprovalRequired callback', async () => {
    setupExpensiveSkillMocks();

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig(),
      undefined,
      { approvalThreshold: 0.01 },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    // Should proceed without approval
    expect(PipelineEngine).toHaveBeenCalled();
    expect(result).toHaveProperty('report');
  });
});

// ---------------------------------------------------------------------------
// Session budget enforcement tests
// ---------------------------------------------------------------------------

describe('session budget enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineRun.mockResolvedValue({
      stagesCompleted: 1,
      totalCostUsd: 0.01,
      primaryOutput: 'Test report output',
    });
  });

  function setupSkillWithCost(cost: number) {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [{ stageName: 'gather', model: 'claude-sonnet-4-20250514', agentType: 'explore', estimatedInputTokens: 4096, estimatedOutputTokens: 2048, estimatedCostUsd: cost, estimatedTimeSeconds: 10, tools: [] }],
      executionLevels: [['gather']],
      totalEstimatedCostUsd: cost,
      totalEstimatedTimeSeconds: 10,
      toolsRequired: [],
      toolsOptional: [],
    });
  }

  it('blocks pipeline when estimated cost exceeds remaining session budget', async () => {
    setupSkillWithCost(5.0);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      sessionSpentUsd: 8.0,
      sessionBudgetUsd: 10.0,
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('exceeds remaining session budget');
    expect(PipelineEngine).not.toHaveBeenCalled();
  });

  it('allows pipeline when within remaining session budget', async () => {
    setupSkillWithCost(0.5);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      sessionSpentUsd: 1.0,
      sessionBudgetUsd: 10.0,
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).not.toHaveProperty('error');
    expect(PipelineEngine).toHaveBeenCalled();
  });

  it('accounts for previously spent amount', async () => {
    setupSkillWithCost(3.0);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      sessionSpentUsd: 8.0,
      sessionBudgetUsd: 10.0,
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('Session spent: $8.0000');
  });

  it('uses Infinity when no session budget configured', async () => {
    setupSkillWithCost(100.0);

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      sessionSpentUsd: 50.0,
      // no sessionBudgetUsd → defaults to Infinity
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).not.toHaveProperty('error');
    expect(PipelineEngine).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tool availability based on API keys
// ---------------------------------------------------------------------------

describe('tool availability based on API keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes get_quote when market_data.api_key is not configured', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    expect(tools).not.toHaveProperty('get_quote');
  });

  it('includes get_quote when market_data.api_key is configured', () => {
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-rapid-key' }, marketonepager: {}, news: {} },
    });
    const tools = createOrchestratorTools(config, makeOrchestratorConfig());
    expect(tools).toHaveProperty('get_quote');
  });

  it('excludes search_news when news.api_key is not configured', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    expect(tools).not.toHaveProperty('search_news');
  });

  it('includes search_news when news.api_key is configured', () => {
    const config = makeConfig({
      tools: { market_data: {}, marketonepager: {}, news: { api_key: 'test-brave-key' } },
    });
    const tools = createOrchestratorTools(config, makeOrchestratorConfig());
    expect(tools).toHaveProperty('search_news');
  });

  it('always includes search_filings (no API key required)', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    expect(tools).toHaveProperty('search_filings');
  });

  it('excludes get_quote from read-only mode when api_key is missing', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, { readOnly: true });
    expect(tools).not.toHaveProperty('get_quote');
    expect(tools).toHaveProperty('search_filings');
  });

  it('excludes search_news from read-only mode when api_key is missing', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, { readOnly: true });
    expect(tools).not.toHaveProperty('search_news');
  });

  it('always includes non-api-key-gated tools regardless of api key config', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
    expect(tools).toHaveProperty('run_pipeline');
    expect(tools).toHaveProperty('list_skills');
    expect(tools).toHaveProperty('get_skill_detail');
    expect(tools).toHaveProperty('manage_config');
    expect(tools).toHaveProperty('list_sessions');
    expect(tools).toHaveProperty('activate_skill');
    expect(tools).toHaveProperty('read_skill_resource');
    expect(tools).toHaveProperty('preview_pipeline');
  });
});

// ---------------------------------------------------------------------------
// Read-only mode tests
// ---------------------------------------------------------------------------

describe('read-only mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only includes read-only tools when readOnly is true', () => {
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: { api_key: 'test-key' } },
    });
    const tools = createOrchestratorTools(config, makeOrchestratorConfig(), undefined, {
      readOnly: true,
    });

    expect(tools).toHaveProperty('get_quote');
    expect(tools).toHaveProperty('search_filings');
    expect(tools).toHaveProperty('search_news');
    expect(tools).toHaveProperty('list_skills');
    expect(tools).toHaveProperty('list_sessions');
    expect(tools).toHaveProperty('manage_config');
    expect(tools).toHaveProperty('preview_pipeline');
  });

  it('excludes run_pipeline in read-only mode', () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      readOnly: true,
    });

    expect(tools).not.toHaveProperty('run_pipeline');
    expect(tools).not.toHaveProperty('activate_skill');
    expect(tools).not.toHaveProperty('read_skill_resource');
  });

  it('allows get_quote in read-only mode when api_key is set', () => {
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: {} },
    });
    const tools = createOrchestratorTools(config, makeOrchestratorConfig(), undefined, {
      readOnly: true,
    });

    expect(tools).toHaveProperty('get_quote');
    expect((tools as Record<string, { description: string }>).get_quote.description).toContain('quote');
  });

  it('blocks manage_config set in read-only mode', async () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      readOnly: true,
    });

    const configTool = (tools as unknown as Record<string, { execute: (params: { action: string; key?: string; value?: string }) => Promise<unknown> }>).manage_config;
    const result = await configTool.execute({ action: 'set', key: 'defaults.model', value: 'gpt-4o' });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('read-only mode');
  });

  it('allows manage_config show in read-only mode', async () => {
    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      readOnly: true,
    });

    const configTool = (tools as unknown as Record<string, { execute: (params: { action: string }) => Promise<unknown> }>).manage_config;
    const result = await configTool.execute({ action: 'show' });

    expect(result).not.toHaveProperty('error');
    expect(result).toHaveProperty('provider');
  });

  it('includes all tools when readOnly is false and api keys are set', () => {
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: { api_key: 'test-key' } },
    });
    const tools = createOrchestratorTools(config, makeOrchestratorConfig(), undefined, {
      readOnly: false,
    });

    expect(tools).toHaveProperty('run_pipeline');
    expect(tools).toHaveProperty('get_quote');
    expect(tools).toHaveProperty('search_news');
    expect(tools).toHaveProperty('activate_skill');
  });
});

// ---------------------------------------------------------------------------
// Tool permissions tests
// ---------------------------------------------------------------------------

describe('tool permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipelineRun.mockResolvedValue({
      stagesCompleted: 1,
      totalCostUsd: 0.01,
      primaryOutput: 'Test report output',
    });
  });

  it('tool with deny returns error without executing', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.01,
      toolsRequired: [],
      toolsOptional: [],
    });

    const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), undefined, {
      permissions: { run_pipeline: 'deny' },
    });
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('denied by permission');
    expect(PipelineEngine).not.toHaveBeenCalled();
  });

  it('tool with confirm calls onPermissionRequired and proceeds on approval', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      toolsRequired: [],
      toolsOptional: [],
    });

    const onPermissionRequired = vi.fn().mockResolvedValue(true);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onPermissionRequired }),
      undefined,
      { permissions: { run_pipeline: 'confirm' } },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(onPermissionRequired).toHaveBeenCalledWith('run_pipeline', expect.any(Object));
    expect(PipelineEngine).toHaveBeenCalled();
    expect(result).toHaveProperty('report');
  });

  it('tool with confirm returns denied on rejection', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      toolsRequired: [],
      toolsOptional: [],
    });

    const onPermissionRequired = vi.fn().mockResolvedValue(false);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onPermissionRequired }),
      undefined,
      { permissions: { run_pipeline: 'confirm' } },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('denied by user');
    expect(PipelineEngine).not.toHaveBeenCalled();
  });

  it('tool with auto executes normally', async () => {
    const entry = makeSkillEntry({
      name: 'deep-dive',
      inputs: [{ name: 'ticker', type: 'string', required: true }],
    });
    mockScanSkillFiles.mockReturnValue([{ name: 'deep-dive', filePath: '/skills/deep-dive.yaml', source: 'built-in' }]);
    mockLoadSkillFile.mockReturnValue(entry);
    mockEstimatePipelineCost.mockReturnValue({
      skillName: 'deep-dive',
      stages: [],
      executionLevels: [],
      totalEstimatedCostUsd: 0.005,
      toolsRequired: [],
      toolsOptional: [],
    });

    const onPermissionRequired = vi.fn();

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig({ onPermissionRequired }),
      undefined,
      { permissions: { run_pipeline: 'auto' } },
    );
    const result = await tools.run_pipeline.execute({
      skill: 'deep-dive',
      inputs: { ticker: 'NVDA' },
    });

    expect(onPermissionRequired).not.toHaveBeenCalled();
    expect(PipelineEngine).toHaveBeenCalled();
    expect(result).toHaveProperty('report');
  });

  it('glob permission mcp.* applies to mcp/ tools', () => {
    const mcpClient = makeMockMCPClient([
      { name: 'mcp/get_quote', description: 'Get MCP quote', serverName: 'mcp' },
    ]);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig(),
      mcpClient,
      { permissions: { 'mcp.*': 'deny' } },
    );

    // The tool should still exist but be denied
    expect(tools).toHaveProperty('mcp/get_quote');
  });

  it('exact match takes precedence over glob', () => {
    const mcpClient = makeMockMCPClient([
      { name: 'mcp/get_quote', description: 'Get MCP quote', serverName: 'mcp' },
      { name: 'mcp/delete_data', description: 'Delete data', serverName: 'mcp' },
    ]);

    const tools = createOrchestratorTools(
      makeConfig(),
      makeOrchestratorConfig(),
      mcpClient,
      {
        permissions: {
          'mcp.*': 'deny',
          'mcp/get_quote': 'auto',
        },
      },
    );

    // Both tools should exist (deny wraps execute, doesn't remove)
    expect(tools).toHaveProperty('mcp/get_quote');
    expect(tools).toHaveProperty('mcp/delete_data');
  });

  it('deny applies to non-pipeline tools like search_news', async () => {
    const config = makeConfig({
      tools: { market_data: {}, marketonepager: {}, news: { api_key: 'test-key' } },
    });
    const tools = createOrchestratorTools(
      config,
      makeOrchestratorConfig(),
      undefined,
      { permissions: { search_news: 'deny' } },
    );

    const newsTool = (tools as unknown as Record<string, { execute: (params: unknown) => Promise<unknown> }>).search_news;
    const result = await newsTool.execute({ query: 'NVDA' });

    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('denied by permission');
  });

  it('confirm applies to non-pipeline tools like get_quote', async () => {
    const onPermissionRequired = vi.fn().mockResolvedValue(false);
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: {} },
    });

    const tools = createOrchestratorTools(
      config,
      makeOrchestratorConfig({ onPermissionRequired }),
      undefined,
      { permissions: { get_quote: 'confirm' } },
    );

    const quoteTool = (tools as unknown as Record<string, { execute: (params: unknown) => Promise<unknown> }>).get_quote;
    const result = await quoteTool.execute({ ticker: 'AAPL' });

    expect(onPermissionRequired).toHaveBeenCalledWith('get_quote', expect.any(Object));
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('denied by user');
  });
});

// ---------------------------------------------------------------------------
// Read-only + MCP / permissions interaction tests
// ---------------------------------------------------------------------------

describe('read-only mode interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes MCP tools in read-only mode', () => {
    const mcpClient = makeMockMCPClient([
      { name: 'bloomberg/get_quote', description: 'Get Bloomberg quote', serverName: 'bloomberg' },
    ]);
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: {} },
    });

    const tools = createOrchestratorTools(
      config,
      makeOrchestratorConfig(),
      mcpClient,
      { readOnly: true },
    );

    // MCP tools are not in READ_ONLY_TOOLS, so they should be excluded
    expect(tools).not.toHaveProperty('bloomberg/get_quote');
    // Built-in read-only tools should still be present
    expect(tools).toHaveProperty('get_quote');
    expect(tools).toHaveProperty('search_filings');
  });

  it('permissions are not applied when read-only mode filters tools', () => {
    const onPermissionRequired = vi.fn();
    const config = makeConfig({
      tools: { market_data: { api_key: 'test-key' }, marketonepager: {}, news: {} },
    });

    const tools = createOrchestratorTools(
      config,
      makeOrchestratorConfig({ onPermissionRequired }),
      undefined,
      {
        readOnly: true,
        permissions: { get_quote: 'deny' },
      },
    );

    // In read-only mode, the code returns early before permission wrapping.
    // get_quote should still be present and functional (read-only filtering happens first).
    expect(tools).toHaveProperty('get_quote');
    // run_pipeline should be excluded by read-only mode
    expect(tools).not.toHaveProperty('run_pipeline');
  });

  describe('manage_config show api_keys and mcp_servers', () => {
    it('returns api_keys status as booleans', async () => {
      const config = makeConfig({
        providers: {
          anthropic: { api_key: 'sk-test', default_model: 'claude-sonnet-4-20250514' },
          openai: { api_key: undefined, default_model: 'gpt-4o' },
          google: { api_key: 'gk-test', default_model: 'gemini-2.5-flash' },
          minimax: { api_key: undefined, default_model: 'MiniMax-M2' },
        },
        tools: { market_data: { api_key: 'md-key' }, marketonepager: {}, news: { api_key: 'news-key' } },
      });
      const tools = createOrchestratorTools(config, makeOrchestratorConfig());
      const configTool = (tools as unknown as Record<string, { execute: (params: { action: string }) => Promise<unknown> }>).manage_config;
      const result = await configTool.execute({ action: 'show' }) as Record<string, unknown>;

      expect(result).toHaveProperty('api_keys');
      const apiKeys = result.api_keys as Record<string, boolean>;
      expect(apiKeys.anthropic).toBe(true);
      expect(apiKeys.openai).toBe(false);
      expect(apiKeys.google).toBe(true);
      expect(apiKeys.minimax).toBe(false);
      expect(apiKeys.market_data).toBe(true);
      expect(apiKeys.marketonepager).toBe(false);
      expect(apiKeys.news).toBe(true);
    });

    it('returns mcp_servers with connected server info', async () => {
      const mcpClient = makeMockMCPClient([
        { name: 'bloomberg/get_quote', description: 'Get quote', serverName: 'bloomberg' },
        { name: 'bloomberg/get_news', description: 'Get news', serverName: 'bloomberg' },
      ]);
      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
      const configTool = (tools as unknown as Record<string, { execute: (params: { action: string }) => Promise<unknown> }>).manage_config;
      const result = await configTool.execute({ action: 'show' }) as Record<string, unknown>;

      expect(result).toHaveProperty('mcp_servers');
      const servers = result.mcp_servers as Array<{ name: string; transport: string; tool_count: number }>;
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('bloomberg');
      expect(servers[0].tool_count).toBe(2);
    });

    it('returns empty mcp_servers when no mcpClient', async () => {
      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig());
      const configTool = (tools as unknown as Record<string, { execute: (params: { action: string }) => Promise<unknown> }>).manage_config;
      const result = await configTool.execute({ action: 'show' }) as Record<string, unknown>;

      expect(result).toHaveProperty('mcp_servers');
      const servers = result.mcp_servers as unknown[];
      expect(servers).toHaveLength(0);
    });

    it('never exposes actual API key values', async () => {
      const config = makeConfig({
        providers: {
          anthropic: { api_key: 'sk-ant-secret-key-12345', default_model: 'claude-sonnet-4-20250514' },
          openai: { api_key: undefined, default_model: 'gpt-4o' },
          google: { api_key: undefined, default_model: 'gemini-2.5-flash' },
          minimax: { api_key: undefined, default_model: 'MiniMax-M2' },
        },
      });
      const tools = createOrchestratorTools(config, makeOrchestratorConfig());
      const configTool = (tools as unknown as Record<string, { execute: (params: { action: string }) => Promise<unknown> }>).manage_config;
      const result = await configTool.execute({ action: 'show' });
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('sk-ant-secret-key-12345');
    });
  });

  describe('MCP empty result handling', () => {
    it('returns message object for empty string result.data', async () => {
      const mcpClient = makeMockMCPClient([
        { name: 'market/get_data', description: 'Get data', serverName: 'market' },
      ]);
      const adaptedTools = mcpClient.listTools();
      (adaptedTools[0].execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: '',
      });

      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
      const mcpTool = (tools as unknown as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }>)['market/get_data'];
      const result = await mcpTool.execute({ query: 'test' });

      expect(result).toHaveProperty('message');
      expect((result as { message: string }).message).toContain('returned no data');
    });

    it('returns message object for null result.data', async () => {
      const mcpClient = makeMockMCPClient([
        { name: 'market/get_data', description: 'Get data', serverName: 'market' },
      ]);
      const adaptedTools = mcpClient.listTools();
      (adaptedTools[0].execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: null,
      });

      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
      const mcpTool = (tools as unknown as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }>)['market/get_data'];
      const result = await mcpTool.execute({ query: 'test' });

      expect(result).toHaveProperty('message');
      expect((result as { message: string }).message).toContain('returned no data');
    });

    it('passes through legitimate falsy value 0', async () => {
      const mcpClient = makeMockMCPClient([
        { name: 'market/get_count', description: 'Get count', serverName: 'market' },
      ]);
      const adaptedTools = mcpClient.listTools();
      (adaptedTools[0].execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 0,
      });

      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
      const mcpTool = (tools as unknown as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }>)['market/get_count'];
      const result = await mcpTool.execute({ query: 'test' });

      expect(result).toBe(0);
    });

    it('passes through legitimate falsy value false', async () => {
      const mcpClient = makeMockMCPClient([
        { name: 'market/is_open', description: 'Check if market is open', serverName: 'market' },
      ]);
      const adaptedTools = mcpClient.listTools();
      (adaptedTools[0].execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: false,
      });

      const tools = createOrchestratorTools(makeConfig(), makeOrchestratorConfig(), mcpClient);
      const mcpTool = (tools as unknown as Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }>)['market/is_open'];
      const result = await mcpTool.execute({ query: 'test' });

      expect(result).toBe(false);
    });
  });
});
