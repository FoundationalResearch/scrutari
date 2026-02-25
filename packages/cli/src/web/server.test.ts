import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';

// Mock dependencies before importing server
vi.mock('ws', () => {
  const mockWsOn = vi.fn();
  const mockWsSend = vi.fn();
  const mockWsClose = vi.fn();

  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    on = mockWsOn;
    send = mockWsSend;
    close = mockWsClose;
  }

  class MockWebSocketServer {
    clients = new Set();
    on = vi.fn();
    close = vi.fn((cb: () => void) => cb());
  }

  return {
    WebSocketServer: MockWebSocketServer,
    WebSocket: MockWebSocket,
  };
});

vi.mock('../chat/session/storage.js', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn(),
  listSessions: vi.fn(() => []),
}));

vi.mock('./session-manager.js', () => ({
  WebSessionManager: vi.fn().mockImplementation(() => ({
    id: 'test-session',
    title: 'Test',
    messages: [],
    totalCostUsd: 0,
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    addCost: vi.fn(),
    save: vi.fn(),
    dispose: vi.fn(),
    resumeSession: vi.fn(),
    getRecentSessions: vi.fn(() => []),
  })),
}));

vi.mock('./orchestrator-bridge.js', () => ({
  OrchestratorBridge: vi.fn().mockImplementation(() => ({
    planMode: false,
    dryRun: false,
    readOnly: false,
    sendMessage: vi.fn(),
    resolveApproval: vi.fn(),
    resolvePermission: vi.fn(),
    abort: vi.fn(),
  })),
}));

vi.mock('./protocol.js', () => ({
  parseClientMessage: vi.fn(),
}));

import { startWebServer, type WebServerOptions } from './server.js';

function createTestOptions(overrides: Partial<WebServerOptions> = {}): WebServerOptions {
  return {
    config: {
      providers: {
        anthropic: { api_key: 'test-key', default_model: 'claude-sonnet-4-20250514' },
        openai: { api_key: undefined, default_model: 'gpt-4o' },
        google: { api_key: undefined, default_model: 'gemini-2.0-flash' },
        minimax: { api_key: undefined, default_model: 'MiniMax-M1' },
      },
      defaults: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-20250514',
        max_budget_usd: 5,
        approval_threshold_usd: 1,
        session_budget_usd: 5,
        output_format: 'markdown' as const,
        output_dir: '~/scrutari-output',
      },
      mcp: { servers: [] },
      skills_dir: '~/.scrutari/skills',
      agents: {
        research: { model: undefined, provider: undefined },
        explore: { model: undefined, provider: undefined },
        verify: { model: undefined, provider: undefined },
        default: { model: undefined, provider: undefined },
      },
      compaction: { strategy: 'auto' as const, preserveRecent: 4 },
      permissions: {},
      tools: { market_data: {}, marketonepager: {}, news: {} },
    } as any,
    version: '0.3.1',
    port: 0, // Let OS pick a free port
    skillNames: ['deep-dive', 'comp-analysis'],
    ...overrides,
  };
}

describe('startWebServer', () => {
  let server: ReturnType<typeof startWebServer> | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('starts the HTTP server', async () => {
    const options = createTestOptions();
    server = startWebServer(options);
    await server.ready;

    expect(server.server).toBeInstanceOf(http.Server);
    expect(server.server.listening).toBe(true);
  });

  it('serves health endpoint', async () => {
    const options = createTestOptions();
    server = startWebServer(options);
    await server.ready;

    const address = server.server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json() as { status: string; version: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.3.1');
  });

  it('serves index.html on /', async () => {
    const options = createTestOptions();
    server = startWebServer(options);
    await server.ready;

    const address = server.server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('returns 404 for unknown paths', async () => {
    const options = createTestOptions();
    server = startWebServer(options);
    await server.ready;

    const address = server.server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/unknown`);

    expect(response.status).toBe(404);
  });

  it('close() shuts down server', async () => {
    const options = createTestOptions();
    server = startWebServer(options);
    await server.ready;

    expect(server.server.listening).toBe(true);
    await server.close();
    expect(server.server.listening).toBe(false);
    server = null; // Prevent double-close in afterEach
  });
});
