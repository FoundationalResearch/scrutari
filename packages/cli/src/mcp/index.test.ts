import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { addMcpServer, getMcpServers, getMcpServer, removeMcpServer } from '../config/index.js';

// These tests verify the CLI subcommand logic via the config layer functions,
// since the subcommand handlers are thin wrappers around them.

const testDir = resolve(homedir(), '.scrutari-mcp-test');
const testConfigPath = resolve(testDir, 'config.yaml');

describe('mcp subcommands (via config layer)', () => {
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('add stdio server', () => {
    it('adds a server with command and args', () => {
      addMcpServer(
        { name: 'test-stdio', command: 'npx', args: ['-y', '@some/mcp-server'] },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('test-stdio', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.command).toBe('npx');
      expect(server!.args).toEqual(['-y', '@some/mcp-server']);
    });

    it('adds a server with env vars', () => {
      addMcpServer(
        { name: 'env-stdio', command: 'node', args: ['server.js'], env: { API_KEY: 'secret123' } },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('env-stdio', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.env).toEqual({ API_KEY: 'secret123' });
    });
  });

  describe('add http server', () => {
    it('adds a server with url', () => {
      addMcpServer(
        { name: 'test-http', url: 'http://localhost:3001/mcp' },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('test-http', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.url).toBe('http://localhost:3001/mcp');
    });

    it('adds a server with headers', () => {
      addMcpServer(
        {
          name: 'auth-http',
          url: 'http://localhost:3001/mcp',
          headers: { Authorization: 'Bearer tok123', 'X-API-Key': 'my-key' },
        },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('auth-http', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.headers).toEqual({ Authorization: 'Bearer tok123', 'X-API-Key': 'my-key' });
    });
  });

  describe('add-json', () => {
    it('adds a server from parsed JSON fields', () => {
      const json = { command: 'npx', args: ['-y', '@bloomberg/mcp'] };
      addMcpServer(
        { name: 'json-server', ...json },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('json-server', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.command).toBe('npx');
      expect(server!.args).toEqual(['-y', '@bloomberg/mcp']);
    });
  });

  describe('list', () => {
    it('returns empty list when no servers', () => {
      const servers = getMcpServers({ configPath: testConfigPath });
      expect(servers).toEqual([]);
    });

    it('lists all servers after adding multiple', () => {
      addMcpServer({ name: 'server-a', command: 'echo' }, { configPath: testConfigPath });
      addMcpServer({ name: 'server-b', url: 'http://localhost:8000/mcp' }, { configPath: testConfigPath });

      const servers = getMcpServers({ configPath: testConfigPath });
      expect(servers).toHaveLength(2);
      expect(servers.map(s => s.name)).toEqual(['server-a', 'server-b']);
    });
  });

  describe('get', () => {
    it('returns server details', () => {
      addMcpServer(
        { name: 'detail-server', command: 'node', args: ['srv.js'] },
        { configPath: testConfigPath },
      );

      const server = getMcpServer('detail-server', { configPath: testConfigPath });
      expect(server).toBeDefined();
      expect(server!.name).toBe('detail-server');
      expect(server!.command).toBe('node');
      expect(server!.args).toEqual(['srv.js']);
    });

    it('returns undefined for unknown server', () => {
      addMcpServer({ name: 'exists', command: 'echo' }, { configPath: testConfigPath });

      const server = getMcpServer('does-not-exist', { configPath: testConfigPath });
      expect(server).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('removes an existing server', () => {
      addMcpServer({ name: 'removable', command: 'echo' }, { configPath: testConfigPath });
      expect(getMcpServers({ configPath: testConfigPath })).toHaveLength(1);

      const removed = removeMcpServer('removable', { configPath: testConfigPath });
      expect(removed).toBe(true);
      expect(getMcpServers({ configPath: testConfigPath })).toHaveLength(0);
    });

    it('returns false for unknown server', () => {
      addMcpServer({ name: 'keep', command: 'echo' }, { configPath: testConfigPath });

      const removed = removeMcpServer('unknown', { configPath: testConfigPath });
      expect(removed).toBe(false);
      expect(getMcpServers({ configPath: testConfigPath })).toHaveLength(1);
    });

    it('preserves other servers when removing one', () => {
      addMcpServer({ name: 'first', command: 'echo' }, { configPath: testConfigPath });
      addMcpServer({ name: 'second', command: 'node' }, { configPath: testConfigPath });
      addMcpServer({ name: 'third', url: 'http://localhost:3000/mcp' }, { configPath: testConfigPath });

      removeMcpServer('second', { configPath: testConfigPath });

      const servers = getMcpServers({ configPath: testConfigPath });
      expect(servers).toHaveLength(2);
      expect(servers.map(s => s.name)).toEqual(['first', 'third']);
    });
  });
});
