import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServerEntry } from '../config/index.js';

// Mock the config functions to capture what addMcpServer is called with
const mockAddMcpServer = vi.fn();
vi.mock('../config/index.js', () => ({
  addMcpServer: (...args: unknown[]) => mockAddMcpServer(...args),
  ConfigError: class ConfigError extends Error { name = 'ConfigError'; },
}));

describe('mcpAddCommand', () => {
  beforeEach(() => {
    mockAddMcpServer.mockReset();
  });

  it('adds a stdio server from -- separated args', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', 'my-server', '--', 'npx', '-y', '@some/mcp'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'my-server',
      command: 'npx',
      args: ['-y', '@some/mcp'],
      env: undefined,
    });
  });

  it('adds an HTTP server with --transport http', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', '--transport', 'http', 'api-srv', 'http://localhost:3000/mcp'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'api-srv',
      url: 'http://localhost:3000/mcp',
      headers: undefined,
    });
  });

  it('adds an HTTP server with --header flag', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', '--transport', 'http', '--header', 'Authorization: Bearer tok', 'auth-srv', 'http://localhost:3000/mcp'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'auth-srv',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('adds a stdio server with --env flag', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', '--env', 'API_KEY=secret', 'env-srv', '--', 'node', 'server.js'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'env-srv',
      command: 'node',
      args: ['server.js'],
      env: { API_KEY: 'secret' },
    });
  });

  it('handles multiple --env flags', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', '--env', 'KEY1=val1', '--env', 'KEY2=val2', 'multi-env', '--', 'node', 'srv.js'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'multi-env',
      command: 'node',
      args: ['srv.js'],
      env: { KEY1: 'val1', KEY2: 'val2' },
    });
  });

  it('handles multiple --header flags', async () => {
    const { mcpAddCommand } = await import('./add.js');

    const rawArgv = ['node', 'scrutari', 'mcp', 'add', '--transport', 'http', '--header', 'Authorization: Bearer tok', '--header', 'X-API-Key: my-key', 'multi-hdr', 'http://localhost:3000/mcp'];
    await mcpAddCommand([], rawArgv);

    expect(mockAddMcpServer).toHaveBeenCalledWith({
      name: 'multi-hdr',
      url: 'http://localhost:3000/mcp',
      headers: { Authorization: 'Bearer tok', 'X-API-Key': 'my-key' },
    });
  });
});
