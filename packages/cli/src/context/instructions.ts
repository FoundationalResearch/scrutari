import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Instructions } from './types.js';

const GLOBAL_PATH = resolve(homedir(), '.scrutari', 'SCRUTARI.md');
const PROJECT_FILENAMES = ['SCRUTARI.md', '.scrutari/SCRUTARI.md'];
const LOCAL_FILENAME = 'SCRUTARI.local.md';

function readFileSafe(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const content = readFileSync(filePath, 'utf-8').trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

export function loadInstructions(cwd: string): Instructions {
  const global = readFileSafe(GLOBAL_PATH);

  let project: string | undefined;
  for (const filename of PROJECT_FILENAMES) {
    project = readFileSafe(resolve(cwd, filename));
    if (project) break;
  }

  const local = readFileSafe(resolve(cwd, LOCAL_FILENAME));

  return { global, project, local };
}
