import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, getToolRegistry, resetToolRegistry } from './registry.js';
import type { ToolDefinition, ToolContext, ToolResult } from './types.js';

const mockContext: ToolContext = {
  config: {},
};

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers built-in tools on construction', () => {
    expect(registry.size).toBeGreaterThan(0);
    // Should have edgar, market-data, and news tools
    expect(registry.has('edgar_search_filings')).toBe(true);
    expect(registry.has('edgar_get_filing')).toBe(true);
    expect(registry.has('edgar_get_financials')).toBe(true);
    expect(registry.has('market_data_get_quote')).toBe(true);
    expect(registry.has('market_data_get_history')).toBe(true);
    expect(registry.has('market_data_get_financials')).toBe(true);
    expect(registry.has('news_search')).toBe(true);
  });

  it('get returns tool by name', () => {
    const tool = registry.get('edgar_search_filings');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('edgar_search_filings');
    expect(tool!.description).toContain('SEC EDGAR');
  });

  it('get returns undefined for unknown tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('has returns false for unknown tool', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('list returns all registered tools', () => {
    const tools = registry.list();
    expect(tools.length).toBe(registry.size);
    expect(tools.every(t => t.name && t.description && t.execute)).toBe(true);
  });

  it('names returns all tool names', () => {
    const names = registry.names();
    expect(names.length).toBe(registry.size);
    expect(names).toContain('edgar_search_filings');
    expect(names).toContain('market_data_get_quote');
    expect(names).toContain('news_search');
  });

  it('register adds a custom tool', () => {
    const customTool: ToolDefinition = {
      name: 'custom_tool',
      description: 'A test tool',
      parameters: z.object({ input: z.string() }),
      execute: async () => ({ success: true, data: 'ok' }),
    };

    registry.register(customTool);
    expect(registry.has('custom_tool')).toBe(true);
    expect(registry.get('custom_tool')!.description).toBe('A test tool');
  });

  it('register overwrites existing tool with same name', () => {
    const originalSize = registry.size;
    const replacement: ToolDefinition = {
      name: 'edgar_search_filings',
      description: 'Replaced tool',
      parameters: z.object({}),
      execute: async () => ({ success: true, data: null }),
    };

    registry.register(replacement);
    expect(registry.size).toBe(originalSize); // same size
    expect(registry.get('edgar_search_filings')!.description).toBe('Replaced tool');
  });

  describe('resolveToolGroups', () => {
    it('resolves edgar group', () => {
      const tools = registry.resolveToolGroups(['edgar']);
      expect(tools).toHaveLength(3);
      const names = tools.map(t => t.name);
      expect(names).toContain('edgar_search_filings');
      expect(names).toContain('edgar_get_filing');
      expect(names).toContain('edgar_get_financials');
    });

    it('resolves sec-edgar alias', () => {
      const tools = registry.resolveToolGroups(['sec-edgar']);
      expect(tools).toHaveLength(3);
    });

    it('resolves market-data group', () => {
      const tools = registry.resolveToolGroups(['market-data']);
      expect(tools).toHaveLength(3);
      const names = tools.map(t => t.name);
      expect(names).toContain('market_data_get_quote');
    });

    it('resolves news group', () => {
      const tools = registry.resolveToolGroups(['news']);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('news_search');
    });

    it('resolves multiple groups without duplicates', () => {
      const tools = registry.resolveToolGroups(['edgar', 'sec-edgar', 'market-data']);
      // edgar and sec-edgar point to same tools, so no duplicates
      const names = tools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
      expect(tools).toHaveLength(6); // 3 edgar + 3 market-data
    });

    it('returns empty array for unknown group', () => {
      const tools = registry.resolveToolGroups(['nonexistent']);
      expect(tools).toHaveLength(0);
    });

    it('ignores unknown groups among valid ones', () => {
      const tools = registry.resolveToolGroups(['edgar', 'nonexistent']);
      expect(tools).toHaveLength(3);
    });
  });

  describe('toAISDKToolSet', () => {
    it('converts tool definitions to AI SDK format', () => {
      const tools = registry.resolveToolGroups(['news']);
      const toolSet = registry.toAISDKToolSet(tools, mockContext);

      expect(Object.keys(toolSet)).toEqual(['news_search']);
      const newsTool = toolSet['news_search'];
      expect(newsTool.description).toContain('news articles');
      expect(newsTool.parameters).toBeDefined();
      expect(typeof newsTool.execute).toBe('function');
    });

    it('execute wraps tool result data on success', async () => {
      const customTool: ToolDefinition = {
        name: 'test_tool',
        description: 'Test',
        parameters: z.object({ x: z.number() }),
        execute: async (): Promise<ToolResult> => ({
          success: true,
          data: { value: 42 },
        }),
      };

      const toolSet = registry.toAISDKToolSet([customTool], mockContext);
      const result = await toolSet['test_tool'].execute({ x: 1 });
      expect(result).toEqual({ value: 42 });
    });

    it('execute returns error object on failure', async () => {
      const failingTool: ToolDefinition = {
        name: 'fail_tool',
        description: 'Fails',
        parameters: z.object({}),
        execute: async (): Promise<ToolResult> => ({
          success: false,
          data: null,
          error: 'Something went wrong',
        }),
      };

      const toolSet = registry.toAISDKToolSet([failingTool], mockContext);
      const result = await toolSet['fail_tool'].execute({});
      expect(result).toEqual({ error: 'Something went wrong' });
    });
  });

  describe('isAvailable', () => {
    it('returns true for built-in groups', () => {
      expect(registry.isAvailable('edgar')).toBe(true);
      expect(registry.isAvailable('sec-edgar')).toBe(true);
      expect(registry.isAvailable('market-data')).toBe(true);
      expect(registry.isAvailable('news')).toBe(true);
    });

    it('returns true for registered individual tools', () => {
      expect(registry.isAvailable('edgar_search_filings')).toBe(true);
      expect(registry.isAvailable('news_search')).toBe(true);
    });

    it('returns false for unknown names', () => {
      expect(registry.isAvailable('nonexistent')).toBe(false);
      expect(registry.isAvailable('bloomberg/get_quote')).toBe(false);
    });

    it('returns true for dynamic groups', () => {
      const mcpTool: ToolDefinition = {
        name: 'bloomberg/get_quote',
        description: 'Get quote from Bloomberg',
        parameters: z.object({ ticker: z.string() }),
        execute: async () => ({ success: true, data: null }),
      };
      registry.registerGroup('bloomberg', [mcpTool]);
      expect(registry.isAvailable('bloomberg')).toBe(true);
      expect(registry.isAvailable('bloomberg/get_quote')).toBe(true);
    });
  });

  describe('getAvailableToolNames', () => {
    it('includes built-in group names and individual tool names', () => {
      const names = registry.getAvailableToolNames();
      expect(names).toContain('edgar');
      expect(names).toContain('sec-edgar');
      expect(names).toContain('market-data');
      expect(names).toContain('news');
      expect(names).toContain('edgar_search_filings');
      expect(names).toContain('news_search');
    });

    it('includes dynamic groups after registration', () => {
      const mcpTool: ToolDefinition = {
        name: 'custom/tool',
        description: 'Custom',
        parameters: z.object({}),
        execute: async () => ({ success: true, data: null }),
      };
      registry.registerGroup('custom', [mcpTool]);
      const names = registry.getAvailableToolNames();
      expect(names).toContain('custom');
      expect(names).toContain('custom/tool');
    });
  });

  describe('registerGroup', () => {
    it('registers tools under a group name', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'mcp-server/tool1',
          description: 'Tool 1',
          parameters: z.object({}),
          execute: async () => ({ success: true, data: 'result1' }),
        },
        {
          name: 'mcp-server/tool2',
          description: 'Tool 2',
          parameters: z.object({}),
          execute: async () => ({ success: true, data: 'result2' }),
        },
      ];

      registry.registerGroup('mcp-server', tools);
      expect(registry.has('mcp-server/tool1')).toBe(true);
      expect(registry.has('mcp-server/tool2')).toBe(true);
    });

    it('resolves dynamic group by name', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'bloomberg/get_quote',
          description: 'Get quote',
          parameters: z.object({ ticker: z.string() }),
          execute: async () => ({ success: true, data: { price: 100 } }),
        },
      ];

      registry.registerGroup('bloomberg', tools);
      const resolved = registry.resolveToolGroups(['bloomberg']);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].name).toBe('bloomberg/get_quote');
    });

    it('resolves individual MCP tool by name', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'bloomberg/get_quote',
          description: 'Get quote',
          parameters: z.object({ ticker: z.string() }),
          execute: async () => ({ success: true, data: { price: 100 } }),
        },
        {
          name: 'bloomberg/get_history',
          description: 'Get history',
          parameters: z.object({ ticker: z.string() }),
          execute: async () => ({ success: true, data: [] }),
        },
      ];

      registry.registerGroup('bloomberg', tools);
      // Resolve specific tool, not the whole group
      const resolved = registry.resolveToolGroups(['bloomberg/get_quote']);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].name).toBe('bloomberg/get_quote');
    });

    it('resolves mixed built-in and MCP groups', () => {
      const mcpTools: ToolDefinition[] = [
        {
          name: 'bloomberg/get_quote',
          description: 'Get quote',
          parameters: z.object({}),
          execute: async () => ({ success: true, data: null }),
        },
      ];

      registry.registerGroup('bloomberg', mcpTools);
      const resolved = registry.resolveToolGroups(['edgar', 'bloomberg']);
      expect(resolved).toHaveLength(4); // 3 edgar + 1 bloomberg
      const names = resolved.map(t => t.name);
      expect(names).toContain('edgar_search_filings');
      expect(names).toContain('bloomberg/get_quote');
    });
  });

  describe('executeTool', () => {
    it('executes a registered tool', async () => {
      const customTool: ToolDefinition = {
        name: 'exec_test',
        description: 'Test',
        parameters: z.object({ msg: z.string() }),
        execute: async (params: unknown): Promise<ToolResult> => {
          const p = params as { msg: string };
          return { success: true, data: `echo: ${p.msg}` };
        },
      };

      registry.register(customTool);
      const result = await registry.executeTool('exec_test', { msg: 'hello' }, mockContext);
      expect(result.success).toBe(true);
      expect(result.data).toBe('echo: hello');
    });

    it('returns error for unknown tool', async () => {
      const result = await registry.executeTool('nonexistent', {}, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});

describe('singleton', () => {
  beforeEach(() => {
    resetToolRegistry();
  });

  it('getToolRegistry returns same instance', () => {
    const r1 = getToolRegistry();
    const r2 = getToolRegistry();
    expect(r1).toBe(r2);
  });

  it('resetToolRegistry creates new instance', () => {
    const r1 = getToolRegistry();
    resetToolRegistry();
    const r2 = getToolRegistry();
    expect(r1).not.toBe(r2);
  });
});
