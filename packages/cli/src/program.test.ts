import { describe, it, expect } from 'vitest';
import { createProgram } from './program.js';

describe('CLI command structure', () => {
  it('creates a program with correct name and version', () => {
    const program = createProgram();
    expect(program.name()).toBe('scrutari');
  });

  it('registers all top-level commands', () => {
    const program = createProgram();
    const names = program.commands.map(c => c.name());
    expect(names).toContain('analyze');
    expect(names).toContain('compare');
    expect(names).toContain('skills');
    expect(names).toContain('config');
    expect(names).toContain('mcp');
  });

  it('has all global options', () => {
    const program = createProgram();
    const optLongs = program.options.map(o => o.long);
    expect(optLongs).toContain('--verbose');
    expect(optLongs).toContain('--json');
    expect(optLongs).toContain('--no-tui');
    expect(optLongs).toContain('--config');
  });

  describe('analyze command', () => {
    it('has a required ticker argument', () => {
      const program = createProgram();
      const cmd = program.commands.find(c => c.name() === 'analyze')!;
      expect(cmd).toBeDefined();
      expect(cmd.registeredArguments).toHaveLength(1);
      expect(cmd.registeredArguments[0].name()).toBe('ticker');
      expect(cmd.registeredArguments[0].required).toBe(true);
    });

    it('has all options', () => {
      const program = createProgram();
      const cmd = program.commands.find(c => c.name() === 'analyze')!;
      const optLongs = cmd.options.map(o => o.long);
      expect(optLongs).toContain('--skill');
      expect(optLongs).toContain('--model');
      expect(optLongs).toContain('--output');
      expect(optLongs).toContain('--deep');
      expect(optLongs).toContain('--budget');
    });

    it('generates help text', () => {
      const program = createProgram();
      const cmd = program.commands.find(c => c.name() === 'analyze')!;
      const help = cmd.helpInformation();
      expect(help).toContain('analyze');
      expect(help).toContain('ticker');
      expect(help).toContain('--skill');
      expect(help).toContain('--deep');
    });
  });

  describe('compare command', () => {
    it('has a variadic tickers argument', () => {
      const program = createProgram();
      const cmd = program.commands.find(c => c.name() === 'compare')!;
      expect(cmd).toBeDefined();
      expect(cmd.registeredArguments).toHaveLength(1);
      expect(cmd.registeredArguments[0].variadic).toBe(true);
    });

    it('generates help text', () => {
      const program = createProgram();
      const cmd = program.commands.find(c => c.name() === 'compare')!;
      const help = cmd.helpInformation();
      expect(help).toContain('compare');
      expect(help).toContain('tickers');
      expect(help).toContain('--skill');
    });
  });

  describe('skills subcommands', () => {
    it('has list, show, and create subcommands', () => {
      const program = createProgram();
      const skills = program.commands.find(c => c.name() === 'skills')!;
      const names = skills.commands.map(c => c.name());
      expect(names).toContain('list');
      expect(names).toContain('show');
      expect(names).toContain('create');
    });

    it('show requires a name argument', () => {
      const program = createProgram();
      const skills = program.commands.find(c => c.name() === 'skills')!;
      const show = skills.commands.find(c => c.name() === 'show')!;
      expect(show.registeredArguments).toHaveLength(1);
      expect(show.registeredArguments[0].name()).toBe('name');
    });

    it('create requires a name argument', () => {
      const program = createProgram();
      const skills = program.commands.find(c => c.name() === 'skills')!;
      const create = skills.commands.find(c => c.name() === 'create')!;
      expect(create.registeredArguments).toHaveLength(1);
      expect(create.registeredArguments[0].name()).toBe('name');
    });

    it('generates help text listing subcommands', () => {
      const program = createProgram();
      const skills = program.commands.find(c => c.name() === 'skills')!;
      const help = skills.helpInformation();
      expect(help).toContain('list');
      expect(help).toContain('show');
      expect(help).toContain('create');
    });
  });

  describe('config subcommands', () => {
    it('has init, show, and set subcommands', () => {
      const program = createProgram();
      const config = program.commands.find(c => c.name() === 'config')!;
      const names = config.commands.map(c => c.name());
      expect(names).toContain('init');
      expect(names).toContain('show');
      expect(names).toContain('set');
    });

    it('set requires key and value arguments', () => {
      const program = createProgram();
      const config = program.commands.find(c => c.name() === 'config')!;
      const set = config.commands.find(c => c.name() === 'set')!;
      expect(set.registeredArguments).toHaveLength(2);
      expect(set.registeredArguments[0].name()).toBe('key');
      expect(set.registeredArguments[1].name()).toBe('value');
    });

    it('generates help text listing subcommands', () => {
      const program = createProgram();
      const config = program.commands.find(c => c.name() === 'config')!;
      const help = config.helpInformation();
      expect(help).toContain('init');
      expect(help).toContain('show');
      expect(help).toContain('set');
    });
  });

  describe('mcp subcommands', () => {
    it('has list and test subcommands', () => {
      const program = createProgram();
      const mcp = program.commands.find(c => c.name() === 'mcp')!;
      const names = mcp.commands.map(c => c.name());
      expect(names).toContain('list');
      expect(names).toContain('test');
    });

    it('test requires a server-name argument', () => {
      const program = createProgram();
      const mcp = program.commands.find(c => c.name() === 'mcp')!;
      const test = mcp.commands.find(c => c.name() === 'test')!;
      expect(test.registeredArguments).toHaveLength(1);
      expect(test.registeredArguments[0].name()).toBe('server-name');
    });

    it('generates help text listing subcommands', () => {
      const program = createProgram();
      const mcp = program.commands.find(c => c.name() === 'mcp')!;
      const help = mcp.helpInformation();
      expect(help).toContain('list');
      expect(help).toContain('test');
    });
  });

  it('generates main help text listing all commands', () => {
    const program = createProgram();
    const help = program.helpInformation();
    expect(help).toContain('scrutari');
    expect(help).toContain('analyze');
    expect(help).toContain('compare');
    expect(help).toContain('skills');
    expect(help).toContain('config');
    expect(help).toContain('mcp');
    expect(help).toContain('--verbose');
    expect(help).toContain('--json');
    expect(help).toContain('--no-tui');
    expect(help).toContain('--config');
  });
});
