import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from './types.js';
import { edgarTools } from './edgar/index.js';
import { marketDataTools } from './market-data/index.js';
import { newsTools } from './news/index.js';

// Mapping from skill YAML tool group names to individual tool definitions
const TOOL_GROUP_MAP: Record<string, ToolDefinition[]> = {
  'edgar': edgarTools,
  'sec-edgar': edgarTools,
  'market-data': marketDataTools,
  'news': newsTools,
};

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly dynamicGroups = new Map<string, ToolDefinition[]>();

  constructor() {
    // Register all built-in tools
    for (const toolDefs of Object.values(TOOL_GROUP_MAP)) {
      for (const tool of toolDefs) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register a group of tools under a group name (e.g., MCP server name).
   * The tools are also registered individually by name.
   */
  registerGroup(groupName: string, tools: ToolDefinition[]): void {
    this.dynamicGroups.set(groupName, tools);
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  get size(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool name (group, dynamic group, or individual tool) is available.
   * Used by the pipeline engine for pre-execution validation.
   */
  isAvailable(name: string): boolean {
    // Built-in group
    if (TOOL_GROUP_MAP[name]) return true;
    // Dynamic group (MCP server, etc.)
    if (this.dynamicGroups.has(name)) return true;
    // Individual tool
    if (this.tools.has(name)) return true;
    return false;
  }

  /**
   * Get all available tool group/tool names that can be used in skill YAML.
   */
  getAvailableToolNames(): string[] {
    const names = new Set<string>();
    // Built-in group names
    for (const groupName of Object.keys(TOOL_GROUP_MAP)) {
      names.add(groupName);
    }
    // Dynamic group names (MCP servers)
    for (const groupName of this.dynamicGroups.keys()) {
      names.add(groupName);
    }
    // Individual tool names
    for (const toolName of this.tools.keys()) {
      names.add(toolName);
    }
    return [...names];
  }

  /**
   * Resolve tool group names from skill YAML (e.g., 'edgar', 'market-data')
   * into individual ToolDefinition arrays. Also supports:
   * - Dynamic groups registered via registerGroup (e.g., MCP server names)
   * - Individual tool names (e.g., 'bloomberg/get_quote')
   */
  resolveToolGroups(groupNames: string[]): ToolDefinition[] {
    const resolved: ToolDefinition[] = [];
    const seen = new Set<string>();

    for (const groupName of groupNames) {
      // Check built-in group map first
      const builtInGroup = TOOL_GROUP_MAP[groupName];
      if (builtInGroup) {
        for (const tool of builtInGroup) {
          if (!seen.has(tool.name)) {
            resolved.push(tool);
            seen.add(tool.name);
          }
        }
        continue;
      }

      // Check dynamic groups (MCP servers, etc.)
      const dynamicGroup = this.dynamicGroups.get(groupName);
      if (dynamicGroup) {
        for (const tool of dynamicGroup) {
          if (!seen.has(tool.name)) {
            resolved.push(tool);
            seen.add(tool.name);
          }
        }
        continue;
      }

      // Check individual tool by name (e.g., 'bloomberg/get_quote')
      const individual = this.tools.get(groupName);
      if (individual && !seen.has(individual.name)) {
        resolved.push(individual);
        seen.add(individual.name);
      }
    }

    return resolved;
  }

  /**
   * Convert ToolDefinitions into the AI SDK ToolSet format for LLM calls.
   * Each tool is wrapped so that execute() calls the ToolDefinition's execute method.
   */
  toAISDKToolSet(
    toolDefs: ToolDefinition[],
    context: ToolContext,
  ): Record<string, { description: string; parameters: z.ZodSchema; execute: (params: unknown) => Promise<unknown> }> {
    const toolSet: Record<string, {
      description: string;
      parameters: z.ZodSchema;
      execute: (params: unknown) => Promise<unknown>;
    }> = {};

    for (const tool of toolDefs) {
      toolSet[tool.name] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (params: unknown): Promise<unknown> => {
          const result = await tool.execute(params, context);
          if (!result.success) {
            return { error: result.error ?? 'Tool execution failed' };
          }
          return result.data;
        },
      };
    }

    return toolSet;
  }

  /**
   * Execute a tool by name with given parameters.
   */
  async executeTool(
    name: string,
    params: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Unknown tool: ${name}`,
      };
    }

    return tool.execute(params, context);
  }
}

/** Singleton for convenience */
let defaultRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();
  }
  return defaultRegistry;
}

export function resetToolRegistry(): void {
  defaultRegistry = null;
}
