import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  // Bundle workspace packages (@scrutari/*) into the output
  noExternal: [
    '@scrutari/core',
    '@scrutari/tools',
    '@scrutari/mcp',
  ],
  // Don't bundle npm dependencies — they'll be in node_modules
  external: [
    'ai',
    '@ai-sdk/anthropic',
    '@ai-sdk/openai',
    '@ai-sdk/google',
    '@modelcontextprotocol/sdk',
    'chalk',
    'docx',
    'eventemitter3',
    'ink',
    'ink-spinner',
    'ink-text-input',
    'marked',
    'marked-terminal',
    'react',
    'yaml',
    'zod',
  ],
  // Shebang is already in src/index.ts, tsup preserves it
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
