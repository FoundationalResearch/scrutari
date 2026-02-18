import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPClientManager } from './client.js';

// ---------------------------------------------------------------------------
// Mock the MCP SDK modules
// ---------------------------------------------------------------------------

const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockGetServerVersion = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    listTools: mockListTools,
    callTool: mockCallTool,
    getServerVersion: mockGetServerVersion,
  })),
}));

const mockStdioStart = vi.fn();
const mockStdioClose = vi.fn();
const mockStdioSend = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: mockStdioStart,
    close: mockStdioClose,
    send: mockStdioSend,
  })),
}));

const mockHttpStart = vi.fn();
const mockHttpClose = vi.fn();
const mockHttpSend = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
    start: mockHttpStart,
    close: mockHttpClose,
    send: mockHttpSend,
  })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock returns
  mockConnect.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
  mockListTools.mockResolvedValue({
    tools: [
      {
        name: 'get_data',
        description: 'Get some data',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'summarize',
        description: 'Summarize text',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
      },
    ],
  });
  mockGetServerVersion.mockReturnValue({ name: 'test-server', version: '1.0.0' });
});

describe('MCPClientManager', () => {
  describe('connect', () => {
    it('connects to a stdio server', async () => {
      const manager = new MCPClientManager();
      const info = await manager.connect({
        name: 'test',
        command: 'node',
        args: ['server.js'],
      });

      expect(info.name).toBe('test');
      expect(info.transport).toBe('stdio');
      expect(info.tools).toHaveLength(2);
      expect(info.tools[0].qualifiedName).toBe('test/get_data');
      expect(info.tools[1].qualifiedName).toBe('test/summarize');
      expect(info.serverName).toBe('test-server');
      expect(info.serverVersion).toBe('1.0.0');
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('connects to an HTTP server', async () => {
      const manager = new MCPClientManager();
      const info = await manager.connect({
        name: 'remote',
        url: 'http://localhost:3001/mcp',
      });

      expect(info.name).toBe('remote');
      expect(info.transport).toBe('http');
      expect(info.tools).toHaveLength(2);
    });

    it('disconnects existing connection when reconnecting', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'test', command: 'node' });
      await manager.connect({ name: 'test', command: 'node2' });

      // close should have been called for the first connection
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(manager.size).toBe(1);
    });
  });

  describe('initialize', () => {
    it('connects to multiple servers', async () => {
      const manager = new MCPClientManager();
      await manager.initialize([
        { name: 'server-a', command: 'node', args: ['a.js'] },
        { name: 'server-b', url: 'http://localhost:3001/mcp' },
      ]);

      expect(manager.size).toBe(2);
      expect(manager.isConnected('server-a')).toBe(true);
      expect(manager.isConnected('server-b')).toBe(true);
    });

    it('calls onError for failed connections without throwing', async () => {
      mockConnect
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Connection refused'));

      const errors: Array<{ name: string; message: string }> = [];
      const manager = new MCPClientManager();
      await manager.initialize(
        [
          { name: 'good', command: 'node' },
          { name: 'bad', command: 'failing-server' },
        ],
        (serverName, error) => {
          errors.push({ name: serverName, message: error.message });
        },
      );

      expect(manager.size).toBe(1);
      expect(manager.isConnected('good')).toBe(true);
      expect(manager.isConnected('bad')).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0].name).toBe('bad');
      expect(errors[0].message).toContain('Connection refused');
    });
  });

  describe('listTools', () => {
    it('returns adapted tool definitions from all servers', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'bloomberg', command: 'node' });

      const tools = manager.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('bloomberg/get_data');
      expect(tools[0].description).toBe('Get some data');
      expect(typeof tools[0].execute).toBe('function');
    });

    it('returns tools from multiple servers', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'server-a', command: 'node' });
      await manager.connect({ name: 'server-b', url: 'http://localhost:3001/mcp' });

      const tools = manager.listTools();
      expect(tools).toHaveLength(4);

      const names = tools.map(t => t.name);
      expect(names).toContain('server-a/get_data');
      expect(names).toContain('server-a/summarize');
      expect(names).toContain('server-b/get_data');
      expect(names).toContain('server-b/summarize');
    });
  });

  describe('getServerInfos', () => {
    it('returns server info for all connected servers', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'test', command: 'node' });

      const infos = manager.getServerInfos();
      expect(infos).toHaveLength(1);
      expect(infos[0].name).toBe('test');
      expect(infos[0].serverName).toBe('test-server');
      expect(infos[0].tools).toHaveLength(2);
    });
  });

  describe('executeTool', () => {
    it('executes a tool by qualified name', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: '{"result": 42}' }],
        isError: false,
      });

      const manager = new MCPClientManager();
      await manager.connect({ name: 'test', command: 'node' });

      const result = await manager.executeTool('test/get_data', { query: 'AAPL' });
      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe('{"result": 42}');
      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'get_data',
        arguments: { query: 'AAPL' },
      });
    });

    it('throws for invalid qualified name', async () => {
      const manager = new MCPClientManager();
      await expect(manager.executeTool('no-slash', {})).rejects.toThrow('Invalid qualified tool name');
    });

    it('throws for unknown server', async () => {
      const manager = new MCPClientManager();
      await expect(manager.executeTool('unknown/tool', {})).rejects.toThrow('not connected');
    });

    it('handles MCP error responses', async () => {
      mockCallTool.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Error occurred' }],
        isError: true,
      });

      const manager = new MCPClientManager();
      await manager.connect({ name: 'test', command: 'node' });

      const result = await manager.executeTool('test/get_data', { query: 'AAPL' });
      expect(result.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('disconnects all servers', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'a', command: 'node' });
      await manager.connect({ name: 'b', url: 'http://localhost:3001/mcp' });

      expect(manager.size).toBe(2);
      await manager.disconnect();
      expect(manager.size).toBe(0);
    });

    it('disconnects a specific server', async () => {
      const manager = new MCPClientManager();
      await manager.connect({ name: 'a', command: 'node' });
      await manager.connect({ name: 'b', url: 'http://localhost:3001/mcp' });

      await manager.disconnectServer('a');
      expect(manager.size).toBe(1);
      expect(manager.isConnected('a')).toBe(false);
      expect(manager.isConnected('b')).toBe(true);
    });

    it('handles close errors gracefully', async () => {
      mockClose.mockRejectedValue(new Error('close failed'));

      const manager = new MCPClientManager();
      await manager.connect({ name: 'test', command: 'node' });

      // Should not throw
      await manager.disconnect();
      expect(manager.size).toBe(0);
    });
  });
});
