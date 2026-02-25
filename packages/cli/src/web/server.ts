import { createServer, type Server as HttpServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { MCPClientManager } from '@scrutari/mcp';
import type { Config } from '../config/index.js';
import type { ContextBundle } from '../context/types.js';
import type { SkillSummary, AgentSkillSummary, HookManager } from '@scrutari/core';
import { listSessions } from '../chat/session/storage.js';
import { WebSessionManager } from './session-manager.js';
import { OrchestratorBridge } from './orchestrator-bridge.js';
import { parseClientMessage, type ServerMessage } from './protocol.js';

export interface WebServerOptions {
  config: Config;
  version: string;
  port: number;
  skillNames: string[];
  skillSummaries?: SkillSummary[];
  agentSkillSummaries?: AgentSkillSummary[];
  mcpClient?: MCPClientManager;
  contextBundle?: ContextBundle;
  hookManager?: HookManager;
}

function resolveStaticPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  // In dist: dist/static/index.html
  const distPath = resolve(thisDir, 'static', 'index.html');
  if (existsSync(distPath)) return distPath;
  // In dev: src/web/static/index.html
  const srcPath = resolve(thisDir, '..', 'web', 'static', 'index.html');
  if (existsSync(srcPath)) return srcPath;
  // Fallback: relative to current file
  const fallback = resolve(thisDir, 'static', 'index.html');
  return fallback;
}

export function startWebServer(options: WebServerOptions): { server: HttpServer; close: () => Promise<void>; ready: Promise<void> } {
  const { config, version, port, skillNames, skillSummaries, agentSkillSummaries, mcpClient, contextBundle, hookManager } = options;

  let htmlContent: string;
  try {
    const htmlPath = resolveStaticPath();
    htmlContent = readFileSync(htmlPath, 'utf-8');
  } catch {
    htmlContent = '<html><body><h1>Scrutari Web UI</h1><p>Static file not found. Rebuild with: npx turbo run build --force</p></body></html>';
  }

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version }));
      return;
    }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const sessionManager = new WebSessionManager();

    const send = (msg: ServerMessage): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const bridge = new OrchestratorBridge({
      config,
      sessionManager,
      skillNames,
      skillSummaries,
      agentSkillSummaries,
      mcpClient,
      contextBundle,
      hookManager,
      send,
    });

    // Send init message
    send({
      type: 'init',
      version,
      model: config.defaults.model,
      provider: config.defaults.provider,
      skills: skillNames,
      recentSessions: listSessions().slice(0, 5),
      modes: {
        plan: bridge.planMode,
        dryRun: bridge.dryRun,
        readOnly: bridge.readOnly,
      },
    });

    ws.on('message', (data: Buffer | string) => {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      const msg = parseClientMessage(raw);
      if (!msg) {
        send({ type: 'error', message: 'Invalid message format', code: 'PARSE_ERROR' });
        return;
      }

      switch (msg.type) {
        case 'send_message':
          bridge.sendMessage(msg.text).catch((err) => {
            send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
          });
          break;

        case 'approval_response':
          bridge.resolveApproval(msg.approved);
          break;

        case 'abort':
          bridge.abort();
          break;

        case 'set_mode': {
          switch (msg.mode) {
            case 'plan':
              bridge.planMode = msg.enabled;
              break;
            case 'dry-run':
              bridge.dryRun = msg.enabled;
              break;
            case 'read-only':
              bridge.readOnly = msg.enabled;
              break;
          }
          send({
            type: 'mode_changed',
            mode: msg.mode,
            enabled: msg.enabled,
          });
          break;
        }

        case 'get_sessions':
          send({
            type: 'sessions_list',
            sessions: sessionManager.getRecentSessions(),
          });
          break;

        case 'resume_session': {
          const resumed = sessionManager.resumeSession(msg.sessionId);
          if (resumed) {
            send({
              type: 'session_resumed',
              sessionId: resumed.id,
              title: resumed.title,
              messages: resumed.messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
                thinking: m.thinking,
                toolCalls: m.toolCalls,
                pipelineState: m.pipelineState,
                dryRunPreview: m.dryRunPreview,
              })),
              totalCostUsd: resumed.totalCostUsd,
            });
          } else {
            send({ type: 'error', message: `Session ${msg.sessionId} not found`, code: 'SESSION_NOT_FOUND' });
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      sessionManager.dispose();
    });

    ws.on('error', () => {
      sessionManager.dispose();
    });
  });

  const ready = new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`\n  Scrutari Web UI running at http://localhost:${port}\n`);
      console.log(`  Press Ctrl+C to stop\n`);
      resolve();
    });
  });

  const close = async (): Promise<void> => {
    return new Promise((resolve) => {
      wss.clients.forEach(client => client.close());
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  };

  return { server, close, ready };
}
