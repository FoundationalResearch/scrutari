import chalk from 'chalk';
import { getMcpServer } from '../config/index.js';

export async function mcpGetCommand(name: string): Promise<void> {
  const server = getMcpServer(name);

  if (!server) {
    console.error(chalk.red(`MCP server "${name}" not found.`));
    process.exit(1);
  }

  const transport = server.command ? 'stdio' : 'http';

  console.log(chalk.blue.bold(`\n${server.name}\n`));
  console.log(`  Transport:  ${transport}`);

  if (server.command) {
    console.log(`  Command:    ${server.command}`);
    if (server.args && server.args.length > 0) {
      console.log(`  Args:       ${JSON.stringify(server.args)}`);
    }
  }

  if (server.url) {
    console.log(`  URL:        ${server.url}`);
  }

  if (server.headers && Object.keys(server.headers).length > 0) {
    console.log(`  Headers:`);
    for (const [key, value] of Object.entries(server.headers)) {
      const masked = value.length > 8 ? value.slice(0, 4) + '...' + value.slice(-4) : '****';
      console.log(`    ${key}: ${masked}`);
    }
  }

  if (server.env && Object.keys(server.env).length > 0) {
    console.log(`  Env:`);
    for (const [key, value] of Object.entries(server.env)) {
      const masked = value.length > 8 ? value.slice(0, 4) + '...' + value.slice(-4) : '****';
      console.log(`    ${key}=${masked}`);
    }
  }

  console.log('');
}
