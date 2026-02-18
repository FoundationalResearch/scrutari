/**
 * MCP server configuration — matches CLI's ResolvedMcpServerConfig.
 */
export interface MCPServerConfig {
  name: string;
  /** Command to spawn (stdio transport) */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** URL for HTTP/SSE transport */
  url?: string;
}

/**
 * Information about a connected MCP server.
 */
export interface MCPServerInfo {
  name: string;
  transport: 'stdio' | 'http';
  tools: MCPToolInfo[];
  serverName?: string;
  serverVersion?: string;
}

/**
 * Information about a single MCP tool.
 */
export interface MCPToolInfo {
  /** Namespaced name: {server-name}/{tool-name} */
  qualifiedName: string;
  /** Original tool name from the MCP server */
  originalName: string;
  /** Server this tool belongs to */
  serverName: string;
  description?: string;
}

/**
 * Result of executing an MCP tool.
 */
export interface MCPToolResult {
  success: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError: boolean;
}
