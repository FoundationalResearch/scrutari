import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initCommand } from './init.js';

describe('initCommand', () => {
  let testHomeDir = '';

  beforeEach(() => {
    testHomeDir = mkdtempSync(resolve(tmpdir(), 'scrutari-init-'));
  });

  afterEach(() => {
    if (testHomeDir && existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  it('uses the provided config path override', async () => {
    const customConfigPath = resolve(testHomeDir, 'custom', 'config.yaml');

    await initCommand({
      homeDir: testHomeDir,
      configPath: customConfigPath,
      logger: () => undefined,
    });

    expect(existsSync(customConfigPath)).toBe(true);
    expect(existsSync(resolve(testHomeDir, '.scrutari', 'skills'))).toBe(true);
  });

  it('creates skills directory even when config already exists', async () => {
    const configDir = resolve(testHomeDir, '.scrutari');
    const configPath = resolve(configDir, 'config.yaml');

    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, 'defaults:\n  provider: anthropic\n', 'utf-8');
    const originalConfig = readFileSync(configPath, 'utf-8');

    await initCommand({
      homeDir: testHomeDir,
      logger: () => undefined,
    });

    expect(existsSync(resolve(testHomeDir, '.scrutari', 'skills'))).toBe(true);
    expect(readFileSync(configPath, 'utf-8')).toBe(originalConfig);
  });
});
