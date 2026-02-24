import chalk from 'chalk';
import { addMcpServer, ConfigError } from '../config/index.js';

export async function mcpAddJsonCommand(name: string, jsonString: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    console.error(chalk.red('Invalid JSON.'));
    console.error(chalk.dim('Usage: scrutari mcp add-json <name> \'{"command":"npx","args":[...]}\''));
    process.exit(1);
  }

  try {
    addMcpServer({
      name,
      command: parsed.command as string | undefined,
      args: parsed.args as string[] | undefined,
      url: parsed.url as string | undefined,
      headers: parsed.headers as Record<string, string> | undefined,
      env: parsed.env as Record<string, string> | undefined,
    });

    const transport = parsed.command ? 'stdio' : 'http';
    console.log(chalk.green(`Added MCP server "${name}" (${transport})`));
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    throw err;
  }
}
