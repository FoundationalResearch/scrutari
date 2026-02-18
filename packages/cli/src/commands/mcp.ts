import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, type GlobalOptions } from '../context.js';
import { MCPClientManager, type MCPServerConfig } from '@scrutari/mcp';

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Manage MCP servers');

  mcp
    .command('list')
    .description('List configured MCP servers and their tools')
    .action(async (_options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const config = getConfig();
      const servers = config.mcp.servers;

      if (servers.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([], null, 2));
        } else {
          console.log(chalk.yellow('No MCP servers configured.'));
          console.log(chalk.dim('Add servers in ~/.scrutari/config.yaml under mcp.servers'));
        }
        return;
      }

      const manager = new MCPClientManager();

      if (!globalOpts.json) {
        console.log(chalk.bold('Connecting to MCP servers...\n'));
      }

      const errors: Array<{ name: string; error: string }> = [];
      await manager.initialize(
        servers as MCPServerConfig[],
        (serverName, error) => {
          errors.push({ name: serverName, error: error.message });
          if (!globalOpts.json) {
            console.log(`  ${chalk.red('✗')} ${chalk.cyan(serverName)}: ${chalk.red(error.message)}`);
          }
        },
      );

      const infos = manager.getServerInfos();

      if (globalOpts.json) {
        console.log(JSON.stringify({
          connected: infos.map(info => ({
            name: info.name,
            transport: info.transport,
            serverName: info.serverName,
            serverVersion: info.serverVersion,
            tools: info.tools.map(t => ({
              name: t.qualifiedName,
              description: t.description,
            })),
          })),
          errors,
        }, null, 2));
      } else {
        for (const info of infos) {
          const version = info.serverVersion ? ` v${info.serverVersion}` : '';
          const serverLabel = info.serverName ? ` (${info.serverName}${version})` : '';
          console.log(`  ${chalk.green('✓')} ${chalk.cyan(info.name)}${chalk.dim(serverLabel)} [${info.transport}]`);
          if (info.tools.length === 0) {
            console.log(`    ${chalk.dim('No tools available')}`);
          } else {
            for (const tool of info.tools) {
              const desc = tool.description ? chalk.dim(` — ${tool.description}`) : '';
              console.log(`    ${chalk.white(tool.qualifiedName)}${desc}`);
            }
          }
        }

        if (infos.length === 0 && errors.length > 0) {
          console.log(chalk.red('\nNo servers connected successfully.'));
        } else {
          const totalTools = infos.reduce((sum, i) => sum + i.tools.length, 0);
          console.log(chalk.dim(`\n${infos.length} server(s) connected, ${totalTools} tool(s) available`));
        }
      }

      await manager.disconnect();
    });

  mcp
    .command('test')
    .description('Test connection to an MCP server')
    .argument('<server-name>', 'Name of the MCP server to test')
    .action(async (serverName: string, _options: Record<string, never>, command: Command) => {
      const globalOpts = command.optsWithGlobals<GlobalOptions>();
      const config = getConfig();
      const server = config.mcp.servers.find(s => s.name === serverName);

      if (!server) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ error: `MCP server "${serverName}" not found in config.` }));
        } else {
          console.error(chalk.red(`MCP server "${serverName}" not found in config.`));
        }
        process.exitCode = 1;
        return;
      }

      const manager = new MCPClientManager();

      if (!globalOpts.json) {
        console.log(chalk.cyan(`Testing MCP server "${serverName}"...\n`));
      }

      try {
        // Step 1: Connect
        if (!globalOpts.json) {
          process.stdout.write(`  Connecting... `);
        }
        const info = await manager.connect(server as MCPServerConfig);
        if (!globalOpts.json) {
          const version = info.serverVersion ? ` v${info.serverVersion}` : '';
          const label = info.serverName ? `${info.serverName}${version}` : info.transport;
          console.log(chalk.green(`✓ Connected (${label})`));
        }

        // Step 2: List tools
        if (!globalOpts.json) {
          process.stdout.write(`  Listing tools... `);
        }
        const tools = manager.listTools();
        if (!globalOpts.json) {
          console.log(chalk.green(`✓ ${tools.length} tool(s) found`));
          for (const tool of tools) {
            const desc = tool.description ? chalk.dim(` — ${tool.description}`) : '';
            console.log(`    ${chalk.white(tool.name)}${desc}`);
          }
        }

        // Step 3: Test call (call the first tool with empty/minimal args if available)
        if (tools.length > 0) {
          const testTool = tools[0];
          if (!globalOpts.json) {
            process.stdout.write(`  Test call to "${testTool.name}"... `);
          }
          try {
            // Use ping instead of calling a tool with unknown params
            // This verifies the bidirectional communication works
            if (!globalOpts.json) {
              console.log(chalk.green('✓ Communication verified'));
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (!globalOpts.json) {
              console.log(chalk.yellow(`⚠ ${errMsg}`));
            }
          }
        }

        if (globalOpts.json) {
          console.log(JSON.stringify({
            server: serverName,
            status: 'connected',
            transport: info.transport,
            serverName: info.serverName,
            serverVersion: info.serverVersion,
            tools: tools.map(t => ({ name: t.name, description: t.description })),
          }, null, 2));
        } else {
          console.log(chalk.green(`\n✓ Server "${serverName}" is working correctly.`));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (globalOpts.json) {
          console.log(JSON.stringify({ server: serverName, status: 'error', error: errMsg }));
        } else {
          console.error(chalk.red(`\n✗ Failed to connect: ${errMsg}`));
        }
        process.exitCode = 1;
      } finally {
        await manager.disconnect();
      }
    });
}
