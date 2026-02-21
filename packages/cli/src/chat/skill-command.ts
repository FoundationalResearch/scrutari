export interface SkillCommandResult {
  skillName: string;
  inputs: Record<string, string | string[]>;
}

/**
 * Try to match a slash command against known skill names.
 * Supports exact match and hyphen-stripped match (e.g., /deepdive → deep-dive).
 * Extracts positional arg (first non-flag token → first required input)
 * and --key value flag pairs. Comma-separated values become string[].
 *
 * Returns null if the command doesn't match any skill.
 */
export function parseSkillCommand(
  command: string,
  args: string,
  skillNames: string[],
): SkillCommandResult | null {
  const normalizedCmd = command.toLowerCase();

  // Try exact match first, then hyphen-stripped match
  const match = skillNames.find(
    name => name === normalizedCmd || name.replace(/-/g, '') === normalizedCmd,
  );

  if (!match) return null;

  const inputs: Record<string, string | string[]> = {};
  const tokens = tokenize(args);

  let positionalConsumed = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = tokens[i + 1];
      if (value && !value.startsWith('--')) {
        inputs[key] = parseValue(value);
        i++; // skip value token
      }
    } else if (!positionalConsumed) {
      // First positional argument — will be mapped to first required input by the LLM
      inputs['_positional'] = parseValue(token);
      positionalConsumed = true;
    }
  }

  return { skillName: match, inputs };
}

/**
 * Build a natural-language message that the LLM can interpret as a pipeline run request.
 */
export function buildSkillMessage(result: SkillCommandResult): string {
  const parts: string[] = [`Run the ${result.skillName} skill`];

  const entries = Object.entries(result.inputs);
  if (entries.length > 0) {
    const inputDescriptions = entries.map(([key, value]) => {
      if (key === '_positional') {
        return Array.isArray(value) ? value.join(', ') : String(value);
      }
      return `${key}=${Array.isArray(value) ? value.join(', ') : String(value)}`;
    });
    parts.push(`with inputs: ${inputDescriptions.join(', ')}`);
  }

  return parts.join(' ');
}

function tokenize(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseValue(value: string): string | string[] {
  if (value.includes(',')) {
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return value;
}
