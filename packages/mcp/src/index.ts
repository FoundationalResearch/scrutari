export { MCPClientManager } from './client.js';

export {
  type MCPServerConfig,
  type MCPServerInfo,
  type MCPToolInfo,
  type MCPToolResult,
} from './types.js';

export {
  type AdaptedToolDefinition,
  type MCPTool,
  adaptMCPTool,
  jsonSchemaToZod,
  jsonSchemaPropertyToZod,
} from './adapter.js';

export { createStdioTransport } from './stdio.js';
export { createHttpTransport } from './http.js';
