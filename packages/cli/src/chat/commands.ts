export type SlashCommandType = 'plan' | 'dry-run' | 'proceed' | 'read-only' | 'persona' | 'instruct' | 'context' | 'skills' | 'tools' | 'mcp' | 'compact' | 'activate' | 'help' | 'unknown';

export interface SlashCommand {
  type: SlashCommandType;
  args: string;
  raw: string;
}

export interface CommandInfo {
  name: string;
  aliases?: string[];
  description: string;
  type: SlashCommandType;
}

const BUILT_IN_COMMANDS: CommandInfo[] = [
  { name: 'plan', description: 'Toggle plan mode', type: 'plan' },
  { name: 'proceed', description: 'Execute the current plan', type: 'proceed' },
  { name: 'dry-run', aliases: ['dryrun'], description: 'Toggle dry-run mode', type: 'dry-run' },
  { name: 'read-only', aliases: ['readonly'], description: 'Toggle read-only mode', type: 'read-only' },
  { name: 'skills', description: 'Browse available skills', type: 'skills' },
  { name: 'tools', description: 'Show configured tools and MCP servers', type: 'tools' },
  { name: 'mcp', description: 'Show MCP server status', type: 'mcp' },
  { name: 'activate', description: 'Activate an agent skill', type: 'activate' },
  { name: 'persona', description: 'Switch persona', type: 'persona' },
  { name: 'instruct', description: 'Set session instructions', type: 'instruct' },
  { name: 'context', description: 'Show active context', type: 'context' },
  { name: 'compact', description: 'Compact context window', type: 'compact' },
  { name: 'help', description: 'Show available commands', type: 'help' },
];

/**
 * Build the full command list: built-in commands + skill names.
 */
export function getCommandList(skillNames: string[]): CommandInfo[] {
  const skillCommands: CommandInfo[] = skillNames.map(name => ({
    name,
    description: `Run ${name} skill`,
    type: 'unknown' as SlashCommandType,
  }));
  return [...BUILT_IN_COMMANDS, ...skillCommands];
}

/**
 * Filter commands by prefix match against the query string (without leading slash).
 */
export function filterCommands(commands: CommandInfo[], query: string): CommandInfo[] {
  const q = query.toLowerCase();
  if (!q) return commands;
  return commands.filter(cmd => {
    if (cmd.name.startsWith(q)) return true;
    return cmd.aliases?.some(alias => alias.startsWith(q)) ?? false;
  });
}

/**
 * Parse a slash command from user input.
 * Returns null if the input is not a slash command.
 */
export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  const command = spaceIndex === -1
    ? trimmed.slice(1).toLowerCase()
    : trimmed.slice(1, spaceIndex).toLowerCase();
  const args = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

  if (!command) return null;

  const knownCommands: Record<string, SlashCommandType> = {
    'plan': 'plan',
    'dry-run': 'dry-run',
    'dryrun': 'dry-run',
    'proceed': 'proceed',
    'read-only': 'read-only',
    'readonly': 'read-only',
    'persona': 'persona',
    'instruct': 'instruct',
    'context': 'context',
    'skills': 'skills',
    'tools': 'tools',
    'mcp': 'mcp',
    'compact': 'compact',
    'activate': 'activate',
    'help': 'help',
  };

  const type = knownCommands[command] ?? 'unknown';

  return { type, args, raw: trimmed };
}
