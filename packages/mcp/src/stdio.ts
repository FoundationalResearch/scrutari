import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServerConfig } from './types.js';

/**
 * Creates a stdio transport for a local MCP server.
 * Spawns the configured command as a child process and communicates
 * via stdin/stdout using JSON-RPC.
 */
export function createStdioTransport(config: MCPServerConfig): Transport {
  if (!config.command) {
    throw new Error(`MCP server "${config.name}" has no command configured for stdio transport`);
  }

  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env } as Record<string, string>,
  });
}
