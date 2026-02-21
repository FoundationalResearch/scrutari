import type { PermissionLevel } from '../../config/schema.js';

/**
 * Resolve the permission level for a tool.
 * Checks exact match first, then glob patterns (e.g., "mcp.*" matches "mcp/..." and "mcp_...").
 * Returns 'auto' if no matching permission is found.
 */
export function resolvePermission(
  toolName: string,
  permissions: Record<string, PermissionLevel>,
): PermissionLevel {
  // Exact match first
  if (permissions[toolName] !== undefined) return permissions[toolName];

  // Glob: "prefix.*" matches "prefix/..." and "prefix_..."
  for (const [pattern, level] of Object.entries(permissions)) {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (toolName.startsWith(prefix + '/') || toolName.startsWith(prefix + '_')) {
        return level;
      }
    }
  }

  return 'auto';
}
