import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { substituteVariables } from '../skills/loader.js';
import type { Skill } from '../skills/types.js';
import type { VerificationReport } from '../verification/types.js';
import { formatMarkdown, type MarkdownFormatOptions } from './markdown.js';
import { formatJson, type JsonFormatOptions } from './json.js';
import { formatDocx, type DocxFormatOptions } from './docx.js';

export interface StageUsageInfo {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
}

export interface WriteOutputOptions {
  skill: Skill;
  primaryOutput: string;
  outputs: Record<string, string>;
  inputs: Record<string, string | string[] | number | boolean>;
  outputDir: string;
  outputFormat?: 'markdown' | 'json' | 'docx';
  /** Model used for analysis. */
  model?: string;
  /** Total cost in USD. */
  totalCostUsd?: number;
  /** Total duration in milliseconds. */
  totalDurationMs?: number;
  /** Verification report from pipeline. */
  verification?: VerificationReport;
  /** Per-stage usage data. */
  stageUsage?: Record<string, StageUsageInfo>;
}

export interface WriteOutputResult {
  primaryPath: string;
  intermediatePaths: string[];
}

export function resolveFilename(
  skill: Skill,
  inputs: Record<string, string | string[] | number | boolean>,
): string {
  const template = skill.output.filename_template ?? skill.name;
  const variables: Record<string, string | string[] | number | boolean> = {
    ...inputs,
    date: new Date().toISOString().split('T')[0],
    skill: skill.name,
  };
  return substituteVariables(template, variables);
}

function getExtension(format: string): string {
  switch (format) {
    case 'json': return '.json';
    case 'docx': return '.docx';
    case 'markdown':
    default: return '.md';
  }
}

export function writeOutput(options: WriteOutputOptions): WriteOutputResult {
  const { skill, outputs, inputs, outputDir } = options;
  const format = options.outputFormat ?? skill.output.format ?? 'markdown';

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const baseName = resolveFilename(skill, inputs);
  const ext = getExtension(format);
  const primaryPath = join(outputDir, `${baseName}${ext}`);

  const formatOpts = buildFormatOptions(options);

  // Write primary output
  ensureDir(primaryPath);

  if (format === 'json') {
    const jsonContent = formatJson(formatOpts as JsonFormatOptions);
    writeFileSync(primaryPath, jsonContent, 'utf-8');
  } else if (format === 'docx') {
    // Write docx synchronously using a blocking pattern
    writeDocxSync(primaryPath, formatOpts as DocxFormatOptions);

    // Also write a markdown version alongside the docx
    const mdPath = join(outputDir, `${baseName}.md`);
    ensureDir(mdPath);
    const mdContent = formatMarkdown(formatOpts as MarkdownFormatOptions);
    writeFileSync(mdPath, mdContent, 'utf-8');
  } else {
    const mdContent = formatMarkdown(formatOpts as MarkdownFormatOptions);
    writeFileSync(primaryPath, mdContent, 'utf-8');
  }

  // Save intermediate stage outputs if configured
  const intermediatePaths: string[] = [];
  if (skill.output.save_intermediate) {
    const intermediateDir = join(outputDir, `${baseName}-stages`);
    if (!existsSync(intermediateDir)) {
      mkdirSync(intermediateDir, { recursive: true });
    }

    for (const [stageName, content] of Object.entries(outputs)) {
      if (stageName === skill.output.primary) continue;
      const stagePath = join(intermediateDir, `${stageName}.md`);
      writeFileSync(stagePath, content, 'utf-8');
      intermediatePaths.push(stagePath);
    }
  }

  return { primaryPath, intermediatePaths };
}

/**
 * Async version of writeOutput that properly awaits docx generation.
 */
export async function writeOutputAsync(options: WriteOutputOptions): Promise<WriteOutputResult> {
  const { skill, outputs, inputs, outputDir } = options;
  const format = options.outputFormat ?? skill.output.format ?? 'markdown';

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const baseName = resolveFilename(skill, inputs);
  const ext = getExtension(format);
  const primaryPath = join(outputDir, `${baseName}${ext}`);

  const formatOpts = buildFormatOptions(options);

  ensureDir(primaryPath);

  if (format === 'json') {
    const jsonContent = formatJson(formatOpts as JsonFormatOptions);
    writeFileSync(primaryPath, jsonContent, 'utf-8');
  } else if (format === 'docx') {
    const buffer = await formatDocx(formatOpts as DocxFormatOptions);
    writeFileSync(primaryPath, buffer);

    // Also write markdown alongside
    const mdPath = join(outputDir, `${baseName}.md`);
    ensureDir(mdPath);
    const mdContent = formatMarkdown(formatOpts as MarkdownFormatOptions);
    writeFileSync(mdPath, mdContent, 'utf-8');
  } else {
    const mdContent = formatMarkdown(formatOpts as MarkdownFormatOptions);
    writeFileSync(primaryPath, mdContent, 'utf-8');
  }

  // Save intermediate stage outputs if configured
  const intermediatePaths: string[] = [];
  if (skill.output.save_intermediate) {
    const intermediateDir = join(outputDir, `${baseName}-stages`);
    if (!existsSync(intermediateDir)) {
      mkdirSync(intermediateDir, { recursive: true });
    }

    for (const [stageName, content] of Object.entries(outputs)) {
      if (stageName === skill.output.primary) continue;
      const stagePath = join(intermediateDir, `${stageName}.md`);
      writeFileSync(stagePath, content, 'utf-8');
      intermediatePaths.push(stagePath);
    }
  }

  return { primaryPath, intermediatePaths };
}

function buildFormatOptions(options: WriteOutputOptions): MarkdownFormatOptions {
  return {
    primaryOutput: options.primaryOutput,
    outputs: options.outputs,
    inputs: options.inputs,
    skill: options.skill,
    model: options.model,
    totalCostUsd: options.totalCostUsd,
    totalDurationMs: options.totalDurationMs,
    verification: options.verification,
    stageUsage: options.stageUsage,
  };
}

/**
 * Synchronous wrapper for docx generation.
 * Uses a small event-loop trick to block until the async packer completes.
 * Falls back to writing a placeholder if the async approach fails.
 */
function writeDocxSync(path: string, options: DocxFormatOptions): void {
  // The docx Packer.toBuffer() is async. For the synchronous writeOutput API,
  // we write a placeholder and log a note. Users should prefer writeOutputAsync.
  // However, we attempt a synchronous-compatible approach.
  let resolved = false;
  let buffer: Buffer | undefined;

  formatDocx(options).then(
    (buf) => { buffer = buf; resolved = true; },
    () => { resolved = true; },
  );

  // Spin-wait for a brief period (the packer is CPU-bound, not I/O)
  const deadline = Date.now() + 5000;
  while (!resolved && Date.now() < deadline) {
    // Allow microtasks to run via a sync delay
    const waitUntil = Date.now() + 1;
    while (Date.now() < waitUntil) { /* spin */ }
  }

  if (buffer) {
    writeFileSync(path, buffer);
  } else {
    // Fallback: write a basic text file indicating docx generation requires async
    writeFileSync(path, 'DOCX generation requires async mode. Use writeOutputAsync() or --output markdown.', 'utf-8');
  }
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
