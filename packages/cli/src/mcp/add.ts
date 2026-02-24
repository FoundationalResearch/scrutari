import chalk from 'chalk';
import { addMcpServer, ConfigError } from '../config/index.js';

export async function mcpAddCommand(_positionalArgs: string[], rawArgv: string[]): Promise<void> {
  // Find "add" in rawArgv to get the segment after "mcp add"
  const mcpIndex = rawArgv.indexOf('mcp');
  const addIndex = rawArgv.indexOf('add', mcpIndex);
  const afterAdd = rawArgv.slice(addIndex + 1);

  // Split at -- separator
  const dashDashIndex = afterAdd.indexOf('--');
  const beforeDashDash = dashDashIndex === -1 ? afterAdd : afterAdd.slice(0, dashDashIndex);
  const afterDashDash = dashDashIndex === -1 ? [] : afterAdd.slice(dashDashIndex + 1);

  // Parse flags and positional names from the segment before --
  let transport: 'stdio' | 'http' = 'stdio';
  const envVars: Record<string, string> = {};
  const headers: Record<string, string> = {};
  const names: string[] = [];

  for (let i = 0; i < beforeDashDash.length; i++) {
    const arg = beforeDashDash[i];
    if (arg === '--transport' && beforeDashDash[i + 1]) {
      const val = beforeDashDash[++i];
      if (val !== 'stdio' && val !== 'http') {
        console.error(chalk.red(`Invalid transport "${val}". Must be "stdio" or "http".`));
        process.exit(1);
      }
      transport = val;
    } else if (arg === '--env' && beforeDashDash[i + 1]) {
      const pair = beforeDashDash[++i];
      const eqIndex = pair.indexOf('=');
      if (eqIndex <= 0) {
        console.error(chalk.red(`Invalid --env format "${pair}". Expected KEY=VALUE.`));
        process.exit(1);
      }
      envVars[pair.slice(0, eqIndex)] = pair.slice(eqIndex + 1);
    } else if (arg === '--header' && beforeDashDash[i + 1]) {
      const val = beforeDashDash[++i];
      const colonIndex = val.indexOf(':');
      if (colonIndex <= 0) {
        console.error(chalk.red(`Invalid --header format "${val}". Expected "Key: Value".`));
        process.exit(1);
      }
      headers[val.slice(0, colonIndex).trim()] = val.slice(colonIndex + 1).trim();
    } else if (!arg.startsWith('-')) {
      names.push(arg);
    }
  }

  try {
    if (transport === 'http') {
      const name = names[0];
      const url = names[1];
      if (!name || !url) {
        console.error(chalk.red('Usage: scrutari mcp add --transport http <name> <url>'));
        console.error(chalk.dim('  Options: --header "Key: Value" (repeatable)'));
        process.exit(1);
      }
      addMcpServer({
        name,
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      console.log(chalk.green(`Added MCP server "${name}" (http: ${url})`));
    } else {
      const name = names[0];
      const command = afterDashDash[0];
      const args = afterDashDash.slice(1);
      if (!name || !command) {
        console.error(chalk.red('Usage: scrutari mcp add <name> -- <command> [args...]'));
        console.error(chalk.dim('  Options: --env KEY=VALUE (repeatable)'));
        process.exit(1);
      }
      addMcpServer({
        name,
        command,
        args: args.length > 0 ? args : undefined,
        env: Object.keys(envVars).length > 0 ? envVars : undefined,
      });
      const cmdStr = [command, ...args].join(' ');
      console.log(chalk.green(`Added MCP server "${name}" (stdio: ${cmdStr})`));
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
    throw err;
  }
}
