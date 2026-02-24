import chalk from 'chalk';
import { getMcpServers } from '../config/index.js';

export async function mcpListCommand(): Promise<void> {
  const servers = getMcpServers();

  if (servers.length === 0) {
    console.log(chalk.dim('\nNo MCP servers configured.\n'));
    console.log(chalk.dim('Add one with:'));
    console.log(chalk.dim('  scrutari mcp add <name> -- <command> [args...]'));
    console.log(chalk.dim('  scrutari mcp add --transport http <name> <url>\n'));
    return;
  }

  console.log(chalk.blue.bold('\nMCP Servers\n'));

  const maxNameLen = Math.max(...servers.map(s => s.name.length));

  for (const server of servers) {
    const name = chalk.bold(server.name.padEnd(maxNameLen));
    const transport = server.command ? 'stdio' : 'http';
    const detail = server.command
      ? `${server.command} ${(server.args ?? []).join(' ')}`.trim()
      : server.url ?? '';
    console.log(`  ${name}  ${chalk.dim(transport)}  ${detail}`);
  }

  console.log(chalk.dim(`\n  ${servers.length} server(s) configured.\n`));
}
