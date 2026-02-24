import chalk from 'chalk';
import { removeMcpServer, ConfigError } from '../config/index.js';

export async function mcpRemoveCommand(name: string): Promise<void> {
  try {
    const removed = removeMcpServer(name);
    if (removed) {
      console.log(chalk.green(`Removed MCP server "${name}".`));
    } else {
      console.error(chalk.red(`MCP server "${name}" not found.`));
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    throw err;
  }
}
