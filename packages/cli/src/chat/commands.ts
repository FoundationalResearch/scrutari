export type SlashCommandType = 'plan' | 'dry-run' | 'proceed' | 'read-only' | 'persona' | 'instruct' | 'context' | 'skills' | 'compact' | 'activate' | 'help' | 'unknown';

export interface SlashCommand {
  type: SlashCommandType;
  args: string;
  raw: string;
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
    'compact': 'compact',
    'activate': 'activate',
    'help': 'help',
  };

  const type = knownCommands[command] ?? 'unknown';

  return { type, args, raw: trimmed };
}
