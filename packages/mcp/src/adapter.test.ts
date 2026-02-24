import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { jsonSchemaToZod, jsonSchemaPropertyToZod, adaptMCPTool } from './adapter.js';
import type { MCPToolResult } from './types.js';

// ---------------------------------------------------------------------------
// jsonSchemaPropertyToZod
// ---------------------------------------------------------------------------

describe('jsonSchemaPropertyToZod', () => {
  it('converts string type', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'string', description: 'A name' });
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(123)).toThrow();
  });

  it('converts string with constraints', () => {
    const schema = jsonSchemaPropertyToZod({
      type: 'string',
      minLength: 2,
      maxLength: 5,
    });
    expect(schema.parse('abc')).toBe('abc');
    expect(() => schema.parse('a')).toThrow();
    expect(() => schema.parse('toolong')).toThrow();
  });

  it('converts string with pattern', () => {
    const schema = jsonSchemaPropertyToZod({
      type: 'string',
      pattern: '^[A-Z]+$',
    });
    expect(schema.parse('AAPL')).toBe('AAPL');
    expect(() => schema.parse('aapl')).toThrow();
  });

  it('converts number type', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'number' });
    expect(schema.parse(42.5)).toBe(42.5);
    expect(() => schema.parse('hello')).toThrow();
  });

  it('converts integer type', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'integer' });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(42.5)).toThrow();
  });

  it('converts number with min/max', () => {
    const schema = jsonSchemaPropertyToZod({
      type: 'number',
      minimum: 0,
      maximum: 100,
    });
    expect(schema.parse(50)).toBe(50);
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(101)).toThrow();
  });

  it('converts boolean type', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'boolean' });
    expect(schema.parse(true)).toBe(true);
    expect(() => schema.parse('yes')).toThrow();
  });

  it('converts array type', () => {
    const schema = jsonSchemaPropertyToZod({
      type: 'array',
      items: { type: 'string' },
    });
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => schema.parse([1, 2])).toThrow();
  });

  it('converts array without items schema', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'array' });
    expect(schema.parse([1, 'two', true])).toEqual([1, 'two', true]);
  });

  it('converts enum', () => {
    const schema = jsonSchemaPropertyToZod({ enum: ['a', 'b', 'c'] });
    expect(schema.parse('a')).toBe('a');
    expect(() => schema.parse('d')).toThrow();
  });

  it('converts nested object', () => {
    const schema = jsonSchemaPropertyToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    });
    expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
    expect(schema.parse({ name: 'Bob' })).toEqual({ name: 'Bob' });
    expect(() => schema.parse({ age: 30 })).toThrow();
  });

  it('converts object without properties to record', () => {
    const schema = jsonSchemaPropertyToZod({ type: 'object' });
    expect(schema.parse({ any: 'thing' })).toEqual({ any: 'thing' });
  });

  it('falls back to unknown for complex schemas', () => {
    const schema = jsonSchemaPropertyToZod({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    // Should accept anything since it falls back to z.unknown()
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// jsonSchemaToZod
// ---------------------------------------------------------------------------

describe('jsonSchemaToZod', () => {
  it('converts empty object schema', () => {
    const schema = jsonSchemaToZod({ type: 'object' });
    expect(schema.parse({})).toEqual({});
  });

  it('converts object with required and optional fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker' },
        limit: { type: 'integer', description: 'Max results' },
      },
      required: ['ticker'],
    });

    expect(schema.parse({ ticker: 'AAPL' })).toEqual({ ticker: 'AAPL' });
    expect(schema.parse({ ticker: 'AAPL', limit: 10 })).toEqual({ ticker: 'AAPL', limit: 10 });
    expect(() => schema.parse({})).toThrow(); // ticker is required
    expect(() => schema.parse({ ticker: 123 })).toThrow(); // wrong type
  });

  it('converts schema with no required array', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    });
    // All fields optional when no required array
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ query: 'test' })).toEqual({ query: 'test' });
  });

  it('handles MCP tool inputSchema format', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'integer', minimum: 1, maximum: 100 },
        filters: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['query'],
    });

    const result = schema.parse({ query: 'NVDA', count: 10, filters: ['10-K'] });
    expect(result).toEqual({ query: 'NVDA', count: 10, filters: ['10-K'] });
  });
});

// ---------------------------------------------------------------------------
// adaptMCPTool
// ---------------------------------------------------------------------------

describe('adaptMCPTool', () => {
  const mockCallTool = vi.fn<(toolName: string, args: Record<string, unknown>) => Promise<MCPToolResult>>();

  it('creates a tool with namespaced name', () => {
    const tool = adaptMCPTool(
      'bloomberg',
      {
        name: 'get_quote',
        description: 'Get a stock quote',
        inputSchema: {
          type: 'object',
          properties: { ticker: { type: 'string' } },
          required: ['ticker'],
        },
      },
      mockCallTool,
    );

    expect(tool.name).toBe('bloomberg/get_quote');
    expect(tool.description).toBe('Get a stock quote');
    expect(tool.parameters).toBeInstanceOf(z.ZodObject);
  });

  it('uses default description when none provided', () => {
    const tool = adaptMCPTool(
      'my-server',
      {
        name: 'some_tool',
        inputSchema: { type: 'object' },
      },
      mockCallTool,
    );

    expect(tool.description).toContain('MCP tool');
    expect(tool.description).toContain('my-server');
  });

  it('execute calls the MCP server and returns text content', async () => {
    mockCallTool.mockResolvedValueOnce({
      success: true,
      content: [{ type: 'text', text: '{"price": 178.72}' }],
      isError: false,
    });

    const tool = adaptMCPTool(
      'bloomberg',
      {
        name: 'get_quote',
        description: 'Get quote',
        inputSchema: {
          type: 'object',
          properties: { ticker: { type: 'string' } },
          required: ['ticker'],
        },
      },
      mockCallTool,
    );

    const result = await tool.execute({ ticker: 'AAPL' }, {});
    expect(result.success).toBe(true);
    // JSON content should be parsed
    expect(result.data).toEqual({ price: 178.72 });
    expect(result.source?.document).toBe('mcp://bloomberg/get_quote');
  });

  it('execute returns plain text when not JSON', async () => {
    mockCallTool.mockResolvedValueOnce({
      success: true,
      content: [{ type: 'text', text: 'The stock is doing well.' }],
      isError: false,
    });

    const tool = adaptMCPTool(
      'analyst',
      {
        name: 'summarize',
        description: 'Summarize',
        inputSchema: { type: 'object' },
      },
      mockCallTool,
    );

    const result = await tool.execute({}, {});
    expect(result.success).toBe(true);
    expect(result.data).toBe('The stock is doing well.');
  });

  it('execute handles MCP error responses', async () => {
    mockCallTool.mockResolvedValueOnce({
      success: false,
      content: [{ type: 'text', text: 'Rate limit exceeded' }],
      isError: true,
    });

    const tool = adaptMCPTool(
      'bloomberg',
      {
        name: 'get_quote',
        description: 'Get quote',
        inputSchema: {
          type: 'object',
          properties: { ticker: { type: 'string' } },
          required: ['ticker'],
        },
      },
      mockCallTool,
    );

    const result = await tool.execute({ ticker: 'AAPL' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });

  it('execute handles invalid params', async () => {
    const tool = adaptMCPTool(
      'bloomberg',
      {
        name: 'get_quote',
        description: 'Get quote',
        inputSchema: {
          type: 'object',
          properties: { ticker: { type: 'string' } },
          required: ['ticker'],
        },
      },
      mockCallTool,
    );

    // Missing required ticker
    const result = await tool.execute({}, {});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('execute handles callTool throwing', async () => {
    mockCallTool.mockRejectedValueOnce(new Error('Connection lost'));

    const tool = adaptMCPTool(
      'bloomberg',
      {
        name: 'get_quote',
        description: 'Get quote',
        inputSchema: {
          type: 'object',
          properties: { ticker: { type: 'string' } },
          required: ['ticker'],
        },
      },
      mockCallTool,
    );

    const result = await tool.execute({ ticker: 'AAPL' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection lost');
  });

  describe('injectedParams', () => {
    it('strips injected keys from the schema', () => {
      const tool = adaptMCPTool(
        'market',
        {
          name: 'get_bars',
          description: 'Get bars',
          inputSchema: {
            type: 'object',
            properties: {
              api_key: { type: 'string' },
              ticker: { type: 'string' },
            },
            required: ['api_key', 'ticker'],
          },
        },
        mockCallTool,
        { api_key: 'secret-key' },
      );

      const schema = tool.parameters as z.ZodObject<z.ZodRawShape>;
      const keys = Object.keys(schema.shape);
      expect(keys).toContain('ticker');
      expect(keys).not.toContain('api_key');
    });

    it('injects params into the tool call args', async () => {
      mockCallTool.mockResolvedValueOnce({
        success: true,
        content: [{ type: 'text', text: '{"price": 100}' }],
        isError: false,
      });

      const tool = adaptMCPTool(
        'market',
        {
          name: 'get_bars',
          description: 'Get bars',
          inputSchema: {
            type: 'object',
            properties: {
              api_key: { type: 'string' },
              ticker: { type: 'string' },
            },
            required: ['api_key', 'ticker'],
          },
        },
        mockCallTool,
        { api_key: 'secret-key' },
      );

      // Call without api_key — it should be injected
      await tool.execute({ ticker: 'AAPL' }, {});

      expect(mockCallTool).toHaveBeenCalledWith('get_bars', {
        ticker: 'AAPL',
        api_key: 'secret-key',
      });
    });

    it('does not require injected keys during validation', async () => {
      mockCallTool.mockResolvedValueOnce({
        success: true,
        content: [{ type: 'text', text: '{}' }],
        isError: false,
      });

      const tool = adaptMCPTool(
        'market',
        {
          name: 'get_status',
          description: 'Get status',
          inputSchema: {
            type: 'object',
            properties: {
              api_key: { type: 'string' },
            },
            required: ['api_key'],
          },
        },
        mockCallTool,
        { api_key: 'my-key' },
      );

      // Call with empty params — should succeed because api_key is stripped from schema
      const result = await tool.execute({}, {});
      expect(result.success).toBe(true);
    });

    it('appends auto-injection note to description when injectedParams provided', () => {
      const tool = adaptMCPTool(
        'market',
        {
          name: 'get_bars',
          description: 'Get OHLCV bars for a ticker',
          inputSchema: {
            type: 'object',
            properties: {
              api_key: { type: 'string' },
              ticker: { type: 'string' },
            },
            required: ['api_key', 'ticker'],
          },
        },
        mockCallTool,
        { api_key: 'secret-key' },
      );

      expect(tool.description).toContain('Get OHLCV bars for a ticker');
      expect(tool.description).toContain('api_key');
      expect(tool.description).toContain('provided automatically');
    });

    it('does not append injection note when no injectedParams', () => {
      const tool = adaptMCPTool(
        'server',
        {
          name: 'ping',
          description: 'Ping the server',
          inputSchema: { type: 'object' },
        },
        mockCallTool,
      );

      expect(tool.description).toBe('Ping the server');
      expect(tool.description).not.toContain('provided automatically');
    });

    it('works with no injectedParams (backward compat)', async () => {
      mockCallTool.mockResolvedValueOnce({
        success: true,
        content: [{ type: 'text', text: '"ok"' }],
        isError: false,
      });

      const tool = adaptMCPTool(
        'server',
        {
          name: 'ping',
          description: 'Ping',
          inputSchema: { type: 'object' },
        },
        mockCallTool,
      );

      const result = await tool.execute({}, {});
      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// $ref / $defs resolution
// ---------------------------------------------------------------------------

describe('$ref/$defs resolution', () => {
  it('resolves $ref to $defs definition in root schema', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        status: { $ref: '#/$defs/Status' },
      },
      required: ['status'],
      $defs: {
        Status: { type: 'string', enum: ['active', 'inactive'] },
      },
    });

    expect(schema.parse({ status: 'active' })).toEqual({ status: 'active' });
    expect(() => schema.parse({ status: 'unknown' })).toThrow();
  });

  it('resolves $ref to nested object definition (real MCP pattern)', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        request: { $ref: '#/$defs/SnapshotRequest' },
      },
      required: ['request'],
      $defs: {
        SnapshotRequest: {
          type: 'object',
          properties: {
            market_type: { type: 'string', enum: ['stocks', 'options', 'crypto'] },
            ticker: { type: 'string' },
          },
          required: ['market_type', 'ticker'],
        },
      },
    });

    const valid = { request: { market_type: 'stocks', ticker: 'NVDA' } };
    expect(schema.parse(valid)).toEqual(valid);

    // Flat params should fail — the LLM must nest them in `request`
    expect(() => schema.parse({ market_type: 'stocks', ticker: 'NVDA' })).toThrow();
  });

  it('inherits description from referring property when definition lacks one', () => {
    const schema = jsonSchemaPropertyToZod(
      { $ref: '#/$defs/Ticker', description: 'The stock ticker symbol' },
      { Ticker: { type: 'string' } },
    );

    expect(schema.description).toBe('The stock ticker symbol');
    expect(schema.parse('AAPL')).toBe('AAPL');
  });

  it('preserves definition description when it has one', () => {
    const schema = jsonSchemaPropertyToZod(
      { $ref: '#/$defs/Ticker', description: 'Prop description' },
      { Ticker: { type: 'string', description: 'Def description' } },
    );

    expect(schema.description).toBe('Def description');
  });

  it('falls back to z.unknown() for unresolvable $ref', () => {
    const schema = jsonSchemaPropertyToZod(
      { $ref: '#/$defs/NonExistent' },
      {},
    );

    // Should accept anything (z.unknown())
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(42)).toBe(42);
  });

  it('falls back to z.unknown() for unsupported $ref format', () => {
    const schema = jsonSchemaPropertyToZod(
      { $ref: 'http://example.com/schema.json#/Foo' },
      { Foo: { type: 'string' } },
    );

    expect(schema.parse(123)).toBe(123);
  });

  it('handles $ref in array items', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        tickers: {
          type: 'array',
          items: { $ref: '#/$defs/Ticker' },
        },
      },
      required: ['tickers'],
      $defs: {
        Ticker: { type: 'string', minLength: 1 },
      },
    });

    expect(schema.parse({ tickers: ['AAPL', 'NVDA'] })).toEqual({ tickers: ['AAPL', 'NVDA'] });
    expect(() => schema.parse({ tickers: [123] })).toThrow();
    expect(() => schema.parse({ tickers: [''] })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// anyOf handling
// ---------------------------------------------------------------------------

describe('anyOf handling', () => {
  it('converts multiple string formats to z.string()', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [
        { type: 'string', format: 'date' },
        { type: 'string', format: 'date-time' },
      ],
    });

    expect(schema.parse('2024-01-01')).toBe('2024-01-01');
    expect(schema.parse('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
    expect(() => schema.parse(42)).toThrow();
  });

  it('converts nullable pattern (boolean|null) to .nullable()', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [
        { type: 'boolean' },
        { type: 'null' },
      ],
    });

    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(null)).toBe(null);
    expect(() => schema.parse('yes')).toThrow();
  });

  it('converts nullable pattern (string|null) to .nullable()', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [
        { type: 'string' },
        { type: 'null' },
      ],
    });

    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(null)).toBe(null);
    expect(() => schema.parse(42)).toThrow();
  });

  it('converts string + string enum to z.string()', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [
        { type: 'string' },
        { type: 'string', enum: ['asc', 'desc'] },
      ],
    });

    expect(schema.parse('asc')).toBe('asc');
    expect(schema.parse('any-string')).toBe('any-string');
    expect(() => schema.parse(42)).toThrow();
  });

  it('converts different types to z.union()', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [
        { type: 'string' },
        { type: 'number' },
      ],
    });

    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(true)).toThrow();
  });

  it('unwraps single branch', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [{ type: 'integer' }],
    });

    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(42.5)).toThrow();
  });

  it('preserves description', () => {
    const schema = jsonSchemaPropertyToZod({
      anyOf: [{ type: 'string' }],
      description: 'A flexible field',
    });

    expect(schema.description).toBe('A flexible field');
  });

  it('returns z.unknown() for empty anyOf', () => {
    const schema = jsonSchemaPropertyToZod({ anyOf: [] });
    expect(schema.parse('anything')).toBe('anything');
    expect(schema.parse(42)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Integration: real MCP server schema patterns
// ---------------------------------------------------------------------------

describe('integration: real MCP schema patterns', () => {
  it('full schema with $ref + anyOf validates correctly', () => {
    // Modeled after massive_get_snapshot_ticker from Polygon MCP
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        request: { $ref: '#/$defs/GetSnapshotTickerRequest' },
      },
      required: ['request'],
      $defs: {
        GetSnapshotTickerRequest: {
          type: 'object',
          properties: {
            market_type: {
              type: 'string',
              enum: ['stocks', 'options', 'indices', 'crypto', 'fx'],
              description: 'Market type',
            },
            ticker: { type: 'string', description: 'Ticker symbol' },
            include_otc: {
              anyOf: [{ type: 'boolean' }, { type: 'null' }],
              description: 'Include OTC securities',
            },
          },
          required: ['market_type', 'ticker'],
        },
      },
    });

    // Valid nested call
    const valid = {
      request: {
        market_type: 'stocks',
        ticker: 'NVDA',
        include_otc: false,
      },
    };
    expect(schema.parse(valid)).toEqual(valid);

    // Null is allowed for include_otc
    const withNull = {
      request: {
        market_type: 'stocks',
        ticker: 'NVDA',
        include_otc: null,
      },
    };
    expect(schema.parse(withNull)).toEqual(withNull);

    // include_otc is optional
    const minimal = {
      request: { market_type: 'stocks', ticker: 'NVDA' },
    };
    expect(schema.parse(minimal)).toEqual(minimal);

    // Flat params fail
    expect(() => schema.parse({ market_type: 'stocks', ticker: 'NVDA' })).toThrow();
  });

  it('adaptMCPTool with $ref/$defs schema + injected params', async () => {
    const mockCallTool = vi.fn<(toolName: string, args: Record<string, unknown>) => Promise<MCPToolResult>>();
    mockCallTool.mockResolvedValueOnce({
      success: true,
      content: [{ type: 'text', text: '{"price": 950.5}' }],
      isError: false,
    });

    const tool = adaptMCPTool(
      'polygon',
      {
        name: 'get_snapshot',
        description: 'Get a snapshot for a ticker',
        inputSchema: {
          type: 'object',
          properties: {
            api_key: { type: 'string' },
            request: { $ref: '#/$defs/SnapshotReq' },
          },
          required: ['api_key', 'request'],
          $defs: {
            SnapshotReq: {
              type: 'object',
              properties: {
                market_type: { type: 'string', enum: ['stocks', 'crypto'] },
                ticker: { type: 'string' },
              },
              required: ['market_type', 'ticker'],
            },
          },
        } as { type: 'object'; properties?: Record<string, object>; required?: string[] },
      },
      mockCallTool,
      { api_key: 'my-secret-key' },
    );

    // api_key should be stripped from schema
    const paramSchema = tool.parameters as z.ZodObject<z.ZodRawShape>;
    expect(Object.keys(paramSchema.shape)).toEqual(['request']);

    // Execute with nested request — api_key auto-injected
    const result = await tool.execute(
      { request: { market_type: 'stocks', ticker: 'NVDA' } },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ price: 950.5 });

    expect(mockCallTool).toHaveBeenCalledWith('get_snapshot', {
      request: { market_type: 'stocks', ticker: 'NVDA' },
      api_key: 'my-secret-key',
    });
  });
});
