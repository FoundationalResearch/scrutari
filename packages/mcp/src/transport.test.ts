import { describe, it, expect } from 'vitest';
import { createStdioTransport } from './stdio.js';
import { createHttpTransport } from './http.js';

describe('createStdioTransport', () => {
  it('throws when no command is configured', () => {
    expect(() =>
      createStdioTransport({ name: 'test' }),
    ).toThrow('no command configured');
  });

  it('creates transport for valid config', () => {
    const transport = createStdioTransport({
      name: 'test',
      command: 'echo',
      args: ['hello'],
    });
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(typeof transport.send).toBe('function');
  });
});

describe('createHttpTransport', () => {
  it('throws when no URL is configured', () => {
    expect(() =>
      createHttpTransport({ name: 'test' }),
    ).toThrow('no URL configured');
  });

  it('creates transport for valid config', () => {
    const transport = createHttpTransport({
      name: 'test',
      url: 'http://localhost:3001/mcp',
    });
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
    expect(typeof transport.send).toBe('function');
  });
});
