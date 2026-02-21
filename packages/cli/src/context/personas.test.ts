import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAllPersonas, findPersona, BUILT_IN_PERSONAS } from './personas.js';
import type { LoadedPersona } from './types.js';

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

import { readdirSync, readFileSync, existsSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BUILT_IN_PERSONAS', () => {
  it('includes equity-analyst', () => {
    const found = BUILT_IN_PERSONAS.find(p => p.name === 'equity-analyst');
    expect(found).toBeDefined();
    expect(found!.description).toBeTruthy();
    expect(found!.system_prompt).toBeTruthy();
  });

  it('includes pm-brief', () => {
    const found = BUILT_IN_PERSONAS.find(p => p.name === 'pm-brief');
    expect(found).toBeDefined();
  });

  it('includes quant-screen', () => {
    const found = BUILT_IN_PERSONAS.find(p => p.name === 'quant-screen');
    expect(found).toBeDefined();
  });

  it('includes thesis-builder', () => {
    const found = BUILT_IN_PERSONAS.find(p => p.name === 'thesis-builder');
    expect(found).toBeDefined();
  });

  it('has 4 built-in personas', () => {
    expect(BUILT_IN_PERSONAS).toHaveLength(4);
  });
});

describe('loadAllPersonas', () => {
  it('returns built-in personas when no user personas exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadAllPersonas();
    expect(result).toHaveLength(4);
    expect(result.every(p => p.source === 'built-in')).toBe(true);
  });

  it('loads user personas from ~/.scrutari/personas/', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['custom.yaml' as never]);
    mockReadFileSync.mockReturnValue(`
name: custom-analyst
description: A custom analysis persona
system_prompt: You are a custom analyst
`);

    const result = loadAllPersonas();
    expect(result).toHaveLength(5); // 4 built-in + 1 custom
    const custom = result.find(p => p.persona.name === 'custom-analyst');
    expect(custom).toBeDefined();
    expect(custom!.source).toBe('user');
  });

  it('user personas override built-in by name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['analyst.yaml' as never]);
    mockReadFileSync.mockReturnValue(`
name: equity-analyst
description: My custom analyst
system_prompt: Custom prompt
`);

    const result = loadAllPersonas();
    expect(result).toHaveLength(4); // Override, not add
    const analyst = result.find(p => p.persona.name === 'equity-analyst');
    expect(analyst!.source).toBe('user');
    expect(analyst!.persona.description).toBe('My custom analyst');
  });

  it('skips invalid persona files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['bad.yaml' as never]);
    mockReadFileSync.mockReturnValue('name: missing-required-fields');

    const result = loadAllPersonas();
    expect(result).toHaveLength(4); // Only built-in
  });

  it('skips unreadable files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['broken.yaml' as never]);
    mockReadFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    const result = loadAllPersonas();
    expect(result).toHaveLength(4);
  });
});

describe('findPersona', () => {
  const personas: LoadedPersona[] = [
    {
      persona: { name: 'test-persona', description: 'Test', system_prompt: 'Test prompt' },
      filePath: '<built-in>',
      source: 'built-in',
    },
    {
      persona: { name: 'other-persona', description: 'Other', system_prompt: 'Other prompt' },
      filePath: '/test.yaml',
      source: 'user',
    },
  ];

  it('finds persona by name', () => {
    const result = findPersona('test-persona', personas);
    expect(result).toBeDefined();
    expect(result!.persona.name).toBe('test-persona');
  });

  it('returns undefined for unknown name', () => {
    const result = findPersona('nonexistent', personas);
    expect(result).toBeUndefined();
  });
});
