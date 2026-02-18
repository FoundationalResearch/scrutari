import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServerConfig } from './types.js';

/**
 * Creates an HTTP/SSE transport for a remote MCP server.
 * Connects to the specified URL using Streamable HTTP protocol
 * (HTTP POST for sending, Server-Sent Events for receiving).
 */
export function createHttpTransport(config: MCPServerConfig): Transport {
  if (!config.url) {
    throw new Error(`MCP server "${config.name}" has no URL configured for HTTP transport`);
  }

  return new StreamableHTTPClientTransport(new URL(config.url));
}
