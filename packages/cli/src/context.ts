import type { Config } from './config/index.js';
import { ConfigError } from './config/index.js';

export interface GlobalOptions {
  verbose?: boolean;
  json?: boolean;
  tui?: boolean;
  config?: string;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    throw new ConfigError('Config not loaded. Run "scrutari config init" first.');
  }
  return _config;
}

export function setConfig(config: Config): void {
  _config = config;
}

export function resetConfig(): void {
  _config = null;
}
