import { describe, it, expect, vi } from 'vitest';
import { createStdioTransport } from './stdio.js';
import { createHttpTransport } from './http.js';

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  return {
    StreamableHTTPClientTransport: vi.fn().mockImplementation((_url, _opts) => ({
      start: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
    })),
  };
});

describe('createStdioTransport', () => {
  it('throws when no command is configured', () => {
    expect(() =>
      createStdioTransport({ name: 'test' }),
    ).toThrow('no command configured');
  });

  it('creates transport for valid config', () => {
    const transport = createStdioTransport({
      name: 'test',
      command: 'echo',
      args: ['hello'],
    });
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(typeof transport.send).toBe('function');
  });
});

describe('createHttpTransport', () => {
  it('throws when no URL is configured', () => {
    expect(() =>
      createHttpTransport({ name: 'test' }),
    ).toThrow('no URL configured');
  });

  it('creates transport for valid config', () => {
    const transport = createHttpTransport({
      name: 'test',
      url: 'http://localhost:3001/mcp',
    });
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(typeof transport.send).toBe('function');
  });

  it('passes headers via requestInit when provided', async () => {
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

    createHttpTransport({
      name: 'test',
      url: 'http://localhost:3001/mcp',
      headers: { 'X-API-Key': 'test-key', 'Authorization': 'Bearer token' },
    });

    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL('http://localhost:3001/mcp'),
      { requestInit: { headers: { 'X-API-Key': 'test-key', 'Authorization': 'Bearer token' } } },
    );
  });

  it('does not pass requestInit when no headers provided', async () => {
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

    createHttpTransport({
      name: 'test',
      url: 'http://localhost:3001/mcp',
    });

    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL('http://localhost:3001/mcp'),
      { requestInit: undefined },
    );
  });
});
