import chalk from 'chalk';

export async function handleSkillCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list': {
      const { listSkillsCommand } = await import('./list.js');
      await listSkillsCommand();
      break;
    }
    case 'create': {
      const { runSkillWizard } = await import('./wizard.js');
      await runSkillWizard();
      break;
    }
    case 'validate': {
      if (!args[0]) {
        console.error(chalk.red('Usage: scrutari skill validate <file.yaml|directory>'));
        process.exit(1);
      }
      const { validateSkillCommand } = await import('./validate.js');
      await validateSkillCommand(args[0]);
      break;
    }
    case 'install': {
      if (!args[0]) {
        console.error(chalk.red('Usage: scrutari skill install <url-or-shorthand>'));
        process.exit(1);
      }
      const { installSkillCommand } = await import('./install.js');
      await installSkillCommand(args[0]);
      break;
    }
    default:
      console.error(chalk.red(`Unknown skill subcommand: "${subcommand}"`));
      console.error(chalk.white('\nAvailable subcommands:'));
      console.error(chalk.dim('  scrutari skill list       List all available skills (pipeline + agent)'));
      console.error(chalk.dim('  scrutari skill create     Interactive skill creation wizard'));
      console.error(chalk.dim('  scrutari skill validate   Validate a skill YAML file or agent skill directory'));
      console.error(chalk.dim('  scrutari skill install    Install a skill from a URL or GitHub'));
      process.exit(1);
  }
}
