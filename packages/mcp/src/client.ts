import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServerConfig, MCPServerInfo, MCPToolInfo, MCPToolResult } from './types.js';
import type { AdaptedToolDefinition, MCPTool } from './adapter.js';
import { adaptMCPTool } from './adapter.js';
import { createStdioTransport } from './stdio.js';
import { createHttpTransport } from './http.js';

interface ConnectedServer {
  config: MCPServerConfig;
  client: Client;
  transport: Transport;
  tools: MCPTool[];
}

/**
 * Manages connections to multiple MCP servers and provides
 * a unified interface for tool discovery and execution.
 */
export class MCPClientManager {
  private readonly clients = new Map<string, ConnectedServer>();

  /**
   * Initialize from an array of server configs — connects to each server.
   * Errors for individual servers are collected, not thrown.
   */
  async initialize(
    servers: MCPServerConfig[],
    onError?: (serverName: string, error: Error) => void,
  ): Promise<void> {
    const connectPromises = servers.map(async (server) => {
      try {
        await this.connect(server);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (onError) {
          onError(server.name, error);
        }
      }
    });

    await Promise.all(connectPromises);
  }

  /**
   * Connect to a single MCP server.
   * Creates the appropriate transport (stdio or HTTP) based on config.
   */
  async connect(config: MCPServerConfig): Promise<MCPServerInfo> {
    if (this.clients.has(config.name)) {
      await this.disconnectServer(config.name);
    }

    const transport = config.command
      ? createStdioTransport(config)
      : createHttpTransport(config);

    const client = new Client(
      { name: 'scrutari', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);

    // Fetch available tools
    const toolsResult = await client.listTools();
    const tools: MCPTool[] = (toolsResult.tools ?? []).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    const serverVersion = client.getServerVersion();

    this.clients.set(config.name, { config, client, transport, tools });

    const toolInfos: MCPToolInfo[] = tools.map(t => ({
      qualifiedName: `${config.name}/${t.name}`,
      originalName: t.name,
      serverName: config.name,
      description: t.description,
    }));

    return {
      name: config.name,
      transport: config.command ? 'stdio' : 'http',
      tools: toolInfos,
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
    };
  }

  /**
   * List all available tools across all connected servers.
   * Returns adapted ToolDefinitions compatible with scrutari's tool system.
   */
  listTools(): AdaptedToolDefinition[] {
    const allTools: AdaptedToolDefinition[] = [];

    for (const [serverName, server] of this.clients) {
      for (const tool of server.tools) {
        allTools.push(
          adaptMCPTool(serverName, tool, (toolName, args) =>
            this.executeToolRaw(serverName, toolName, args),
          server.config.injectedParams),
        );
      }
    }

    return allTools;
  }

  /**
   * Get tool info for all connected servers.
   */
  getServerInfos(): MCPServerInfo[] {
    const infos: MCPServerInfo[] = [];

    for (const [serverName, server] of this.clients) {
      const serverVersion = server.client.getServerVersion();
      infos.push({
        name: serverName,
        transport: server.config.command ? 'stdio' : 'http',
        tools: server.tools.map(t => ({
          qualifiedName: `${serverName}/${t.name}`,
          originalName: t.name,
          serverName,
          description: t.description,
        })),
        serverName: serverVersion?.name,
        serverVersion: serverVersion?.version,
      });
    }

    return infos;
  }

  /**
   * Check if a server is connected.
   */
  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  /**
   * Get the number of connected servers.
   */
  get size(): number {
    return this.clients.size;
  }

  /**
   * Execute a tool on a specific server by its original (non-namespaced) name.
   */
  private async executeToolRaw(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const server = this.clients.get(serverName);
    if (!server) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    const result = await server.client.callTool({
      name: toolName,
      arguments: args,
    });

    const content = (result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>) ?? [];
    const isError = Boolean(result.isError);

    return {
      success: !isError,
      content,
      isError,
    };
  }

  /**
   * Execute a tool by its qualified name ({server-name}/{tool-name}).
   */
  async executeTool(
    qualifiedName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const slashIndex = qualifiedName.indexOf('/');
    if (slashIndex === -1) {
      throw new Error(
        `Invalid qualified tool name "${qualifiedName}". Expected format: {server-name}/{tool-name}`,
      );
    }

    const serverName = qualifiedName.substring(0, slashIndex);
    const toolName = qualifiedName.substring(slashIndex + 1);
    return this.executeToolRaw(serverName, toolName, args);
  }

  /**
   * Disconnect from a specific server.
   */
  async disconnectServer(serverName: string): Promise<void> {
    const server = this.clients.get(serverName);
    if (!server) return;

    try {
      await server.client.close();
    } catch {
      // Ignore close errors
    }

    try {
      await server.transport.close();
    } catch {
      // Ignore close errors
    }

    this.clients.delete(serverName);
  }

  /**
   * Gracefully disconnect from all servers.
   */
  async disconnect(): Promise<void> {
    const names = [...this.clients.keys()];
    await Promise.all(names.map(name => this.disconnectServer(name)));
  }
}
