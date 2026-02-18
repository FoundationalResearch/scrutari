#!/usr/bin/env node

import { createProgram } from './program.js';
import { ConfigError } from './config/index.js';

async function main(): Promise<void> {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Config error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
