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
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

/**
 * Resolves a JSON Schema `$ref` string (e.g. `#/$defs/MyType`) against a defs map.
 * Returns `undefined` if the ref format is unsupported or the key is missing.
 *
 * Note: Circular `$ref` is not handled — extremely rare in tool schemas.
 */
function resolveRef(ref: string, defs: Record<string, JsonSchema>): JsonSchema | undefined {
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  if (!match) return undefined;
  return defs[match[1]];
}

/**
 * Converts a JSON Schema `anyOf` array to a Zod schema.
 *
 * Priority-based conversion:
 * - `[SomeType, { type: "null" }]` → `SomeType.nullable()`
 * - All string branches → `z.string()` (formats are irrelevant to Zod)
 * - 2+ distinct types → `z.union([...])`
 * - 1 branch → unwrap directly
 */
function anyOfToZod(
  branches: JsonSchema[],
  defs: Record<string, JsonSchema>,
  description?: string,
): z.ZodTypeAny {
  if (branches.length === 0) {
    let u: z.ZodTypeAny = z.unknown();
    if (description) u = u.describe(description);
    return u;
  }

  // Resolve any $ref branches first
  const resolved = branches.map(b => b.$ref ? resolveRef(b.$ref, defs) ?? b : b);

  // Check for nullable pattern: [SomeType, { type: "null" }]
  const nullIndex = resolved.findIndex(b => b.type === 'null');
  if (nullIndex !== -1 && resolved.length === 2) {
    const nonNull = resolved[1 - nullIndex];
    let inner = jsonSchemaPropertyToZod(nonNull, defs);
    let result: z.ZodTypeAny = inner.nullable();
    if (description) result = result.describe(description);
    return result;
  }

  // All string branches (e.g. different string formats) → z.string()
  if (resolved.every(b => b.type === 'string')) {
    let s: z.ZodTypeAny = z.string();
    if (description) s = s.describe(description);
    return s;
  }

  // Single branch → unwrap
  if (resolved.length === 1) {
    let result = jsonSchemaPropertyToZod(resolved[0], defs);
    if (description) result = result.describe(description);
    return result;
  }

  // Multiple distinct types → z.union()
  const zodBranches = resolved.map(b => jsonSchemaPropertyToZod(b, defs));
  if (zodBranches.length >= 2) {
    let result: z.ZodTypeAny = z.union(
      zodBranches as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
    );
    if (description) result = result.describe(description);
    return result;
  }

  let u: z.ZodTypeAny = z.unknown();
  if (description) u = u.describe(description);
  return u;
}

/**
 * Converts a JSON Schema property to a Zod schema.
 * Handles common types including `$ref` and `anyOf`; falls back to z.unknown() for unsupported schemas.
 */
export function jsonSchemaPropertyToZod(
  schema: JsonSchema,
  defs: Record<string, JsonSchema> = {},
): z.ZodTypeAny {
  // $ref takes priority (per JSON Schema spec)
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, defs);
    if (!resolved) {
      let u: z.ZodTypeAny = z.unknown();
      if (schema.description) u = u.describe(schema.description);
      return u;
    }
    // Use the referring property's description if the definition lacks one
    const merged = resolved.description ? resolved : { ...resolved, description: schema.description };
    return jsonSchemaPropertyToZod(merged, defs);
  }

  // anyOf handling
  if (schema.anyOf && schema.anyOf.length > 0) {
    return anyOfToZod(schema.anyOf, defs, schema.description);
  }

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
        ? jsonSchemaPropertyToZod(schema.items, defs)
        : z.unknown();
      let a: z.ZodTypeAny = z.array(itemSchema);
      if (schema.description) a = a.describe(schema.description);
      return a;
    }

    case 'object': {
      if (schema.properties) {
        return jsonSchemaToZod(schema, defs);
      }
      let o: z.ZodTypeAny = z.record(z.unknown());
      if (schema.description) o = o.describe(schema.description);
      return o;
    }

    default: {
      let u: z.ZodTypeAny = z.unknown();
      if (schema.description) u = u.describe(schema.description);
      return u;
    }
  }
}

/**
 * Converts a JSON Schema object type to a Zod object schema.
 * This is the main entry point for converting MCP tool inputSchema.
 *
 * @param schema - The JSON Schema object to convert
 * @param defs - Optional inherited `$defs` lookup table for `$ref` resolution
 */
export function jsonSchemaToZod(
  schema: JsonSchema,
  defs?: Record<string, JsonSchema>,
): z.ZodObject<z.ZodRawShape> {
  // Merge schema-level $defs with any inherited defs (schema-level wins)
  const mergedDefs: Record<string, JsonSchema> = { ...defs, ...schema.$defs };

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const shape: z.ZodRawShape = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    let zodProp = jsonSchemaPropertyToZod(propSchema, mergedDefs);
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

  const baseDescription = tool.description ?? `MCP tool: ${tool.name} (from ${serverName})`;
  const description = injectedKeys.length > 0
    ? `${baseDescription} (Note: ${injectedKeys.join(', ')} provided automatically — do not include.)`
    : baseDescription;

  return {
    name: qualifiedName,
    description,
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

          // Guard against empty results that confuse the LLM
          if (data === '' || data === null || data === undefined) {
            data = result.content.length === 0
              ? `Tool "${tool.name}" executed successfully but returned no content.`
              : `Tool "${tool.name}" executed successfully but returned empty text.`;
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
