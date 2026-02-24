import { z } from 'zod';
import type { MCPToolResult } from './types.js';

// ---------------------------------------------------------------------------
// JSON Schema → Zod conversion
// ---------------------------------------------------------------------------

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  [key: string]: unknown;
}

/**
 * Converts a JSON Schema property to a Zod schema.
 * Handles common types; falls back to z.unknown() for complex schemas.
 */
export function jsonSchemaPropertyToZod(schema: JsonSchema): z.ZodTypeAny {
  if (schema.enum && Array.isArray(schema.enum)) {
    const values = schema.enum as [string, ...string[]];
    if (values.length > 0 && values.every(v => typeof v === 'string')) {
      return z.enum(values as [string, ...string[]]);
    }
    return z.unknown();
  }

  switch (schema.type) {
    case 'string': {
      let s = z.string();
      if (schema.minLength != null) s = s.min(schema.minLength);
      if (schema.maxLength != null) s = s.max(schema.maxLength);
      if (schema.pattern) s = s.regex(new RegExp(schema.pattern));
      if (schema.description) s = s.describe(schema.description);
      return s;
    }

    case 'number':
    case 'integer': {
      let n = schema.type === 'integer' ? z.number().int() : z.number();
      if (schema.minimum != null) n = n.min(schema.minimum);
      if (schema.maximum != null) n = n.max(schema.maximum);
      if (schema.description) n = n.describe(schema.description);
      return n;
    }

    case 'boolean': {
      let b: z.ZodTypeAny = z.boolean();
      if (schema.description) b = b.describe(schema.description);
      return b;
    }

    case 'array': {
      const itemSchema = schema.items
        ? jsonSchemaPropertyToZod(schema.items)
        : z.unknown();
      let a: z.ZodTypeAny = z.array(itemSchema);
      if (schema.description) a = a.describe(schema.description);
      return a;
    }

    case 'object': {
      if (schema.properties) {
        return jsonSchemaToZod(schema);
      }
      let o: z.ZodTypeAny = z.record(z.unknown());
      if (schema.description) o = o.describe(schema.description);
      return o;
    }

    default: {
      // oneOf/anyOf — treat as unknown
      let u: z.ZodTypeAny = z.unknown();
      if (schema.description) u = u.describe(schema.description);
      return u;
    }
  }
}

/**
 * Converts a JSON Schema object type to a Zod object schema.
 * This is the main entry point for converting MCP tool inputSchema.
 */
export function jsonSchemaToZod(schema: JsonSchema): z.ZodObject<z.ZodRawShape> {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const shape: z.ZodRawShape = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    let zodProp = jsonSchemaPropertyToZod(propSchema);
    if (!required.has(key)) {
      zodProp = zodProp.optional();
    }
    shape[key] = zodProp;
  }

  return z.object(shape);
}

// ---------------------------------------------------------------------------
// MCP Tool → ToolDefinition adapter
// ---------------------------------------------------------------------------

/**
 * MCP tool description from the SDK.
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
  };
}

/**
 * A scrutari-compatible tool definition created from an MCP tool.
 * This interface mirrors @scrutari/tools ToolDefinition without importing it,
 * keeping @scrutari/mcp decoupled from @scrutari/tools.
 */
export interface AdaptedToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: unknown, context: unknown) => Promise<{
    success: boolean;
    data: unknown;
    error?: string;
    source?: { url?: string; document?: string; accessedAt: string };
  }>;
}

/** Default timeout for MCP tool calls (30 seconds). */
const MCP_TOOL_TIMEOUT_MS = 30_000;

/** Maximum retries for MCP tool calls. */
const MCP_MAX_RETRIES = 1;

/** Check if an MCP error is retryable (timeout, server error). */
function isMCPRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('server error') ||
    /\b(500|502|503)\b/.test(message);
}

/** Execute a function with a timeout. */
async function withMCPTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MCP tool call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn().then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Build a Zod schema that omits keys present in `injectedParams`.
 * Returns the original schema unchanged when no keys overlap.
 */
function stripInjectedKeys(
  schema: z.ZodObject<z.ZodRawShape>,
  keysToStrip: string[],
): z.ZodObject<z.ZodRawShape> {
  if (keysToStrip.length === 0) return schema;
  const shape = schema.shape;
  const stripped: z.ZodRawShape = {};
  for (const [key, value] of Object.entries(shape)) {
    if (!keysToStrip.includes(key)) {
      stripped[key] = value;
    }
  }
  return z.object(stripped);
}

/**
 * Adapts an MCP tool into a scrutari-compatible tool definition.
 * Includes a 30-second timeout and one retry on transient errors.
 *
 * @param serverName - The MCP server name (used for namespacing)
 * @param tool - The MCP tool definition
 * @param callTool - Function to call the tool on the MCP server
 * @param injectedParams - Parameters to auto-inject into every call (stripped from the schema the LLM sees)
 */
export function adaptMCPTool(
  serverName: string,
  tool: MCPTool,
  callTool: (toolName: string, args: Record<string, unknown>) => Promise<MCPToolResult>,
  injectedParams?: Record<string, string>,
): AdaptedToolDefinition {
  const qualifiedName = `${serverName}/${tool.name}`;
  const fullSchema = jsonSchemaToZod(tool.inputSchema as JsonSchema);
  const injectedKeys = injectedParams ? Object.keys(injectedParams) : [];
  const parameters = injectedKeys.length > 0
    ? stripInjectedKeys(fullSchema, injectedKeys)
    : fullSchema;

  return {
    name: qualifiedName,
    description: tool.description ?? `MCP tool: ${tool.name} (from ${serverName})`,
    parameters,
    execute: async (params: unknown): Promise<{
      success: boolean;
      data: unknown;
      error?: string;
      source?: { url?: string; document?: string; accessedAt: string };
    }> => {
      let validated: Record<string, unknown>;
      try {
        validated = parameters.parse(params) as Record<string, unknown>;
      } catch (err) {
        return {
          success: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      // Merge injected params into the validated args before calling the tool
      if (injectedParams) {
        validated = { ...validated, ...injectedParams };
      }
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= MCP_MAX_RETRIES; attempt++) {
        try {
          const result = await withMCPTimeout(
            () => callTool(tool.name, validated as Record<string, unknown>),
            MCP_TOOL_TIMEOUT_MS,
          );

          if (result.isError) {
            const errorText = result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');

            // Retry on server-side errors from MCP
            if (attempt < MCP_MAX_RETRIES && isMCPRetryable(errorText)) {
              lastError = new Error(errorText || 'MCP tool execution failed');
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }

            return {
              success: false,
              data: null,
              error: errorText || 'MCP tool execution failed',
            };
          }

          // Extract text content from MCP response
          const textContent = result.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');

          // Try to parse as JSON if it looks like JSON
          let data: unknown = textContent;
          if (textContent.startsWith('{') || textContent.startsWith('[')) {
            try {
              data = JSON.parse(textContent);
            } catch {
              // Keep as text
            }
          }

          return {
            success: true,
            data,
            source: {
              document: `mcp://${serverName}/${tool.name}`,
              accessedAt: new Date().toISOString(),
            },
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Retry on transient errors
          if (attempt < MCP_MAX_RETRIES && isMCPRetryable(err)) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }

          return {
            success: false,
            data: null,
            error: lastError.message,
          };
        }
      }

      return {
        success: false,
        data: null,
        error: lastError?.message ?? 'MCP tool execution failed after retries',
      };
    },
  };
}
