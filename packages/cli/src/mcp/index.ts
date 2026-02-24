import chalk from 'chalk';

export async function handleMcpCommand(subcommand: string, args: string[], rawArgv: string[]): Promise<void> {
  switch (subcommand) {
    case 'add': {
      const { mcpAddCommand } = await import('./add.js');
      await mcpAddCommand(args, rawArgv);
      break;
    }
    case 'add-json': {
      if (!args[0] || !args[1]) {
        console.error(chalk.red('Usage: scrutari mcp add-json <name> \'<json>\''));
        process.exit(1);
      }
      const { mcpAddJsonCommand } = await import('./add-json.js');
      await mcpAddJsonCommand(args[0], args[1]);
      break;
    }
    case 'list': {
      const { mcpListCommand } = await import('./list.js');
      await mcpListCommand();
      break;
    }
    case 'get': {
      if (!args[0]) {
        console.error(chalk.red('Usage: scrutari mcp get <name>'));
        process.exit(1);
      }
      const { mcpGetCommand } = await import('./get.js');
      await mcpGetCommand(args[0]);
      break;
    }
    case 'remove': {
      if (!args[0]) {
        console.error(chalk.red('Usage: scrutari mcp remove <name>'));
        process.exit(1);
      }
      const { mcpRemoveCommand } = await import('./remove.js');
      await mcpRemoveCommand(args[0]);
      break;
    }
    default:
      console.error(chalk.red(`Unknown mcp subcommand: "${subcommand}"`));
      console.error(chalk.white('\nAvailable subcommands:'));
      console.error(chalk.dim('  scrutari mcp add <name> -- <command> [args]     Add a stdio MCP server'));
      console.error(chalk.dim('  scrutari mcp add --transport http <name> <url>  Add an HTTP MCP server'));
      console.error(chalk.dim('  scrutari mcp add-json <name> \'<json>\'           Add from JSON blob'));
      console.error(chalk.dim('  scrutari mcp list                               List configured servers'));
      console.error(chalk.dim('  scrutari mcp get <name>                         Show server details'));
      console.error(chalk.dim('  scrutari mcp remove <name>                      Remove a server'));
      process.exit(1);
  }
}
