import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Session, SessionSummary } from './types.js';

function getSessionsDir(): string {
  return join(homedir(), '.scrutari', 'sessions');
}

function ensureSessionsDir(): string {
  const dir = getSessionsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function saveSession(session: Session): void {
  const dir = ensureSessionsDir();
  const filePath = join(dir, `${session.id}.json`);
  writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export function loadSession(id: string): Session | null {
  const dir = getSessionsDir();
  const filePath = join(dir, `${id}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function listSessions(): SessionSummary[] {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const session = JSON.parse(raw) as Session;
      summaries.push({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        totalCostUsd: session.totalCostUsd,
      });
    } catch {
      // Skip corrupt session files
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLatestSession(): Session | null {
  const summaries = listSessions();
  if (summaries.length === 0) return null;
  return loadSession(summaries[0].id);
}

export function deleteSession(id: string): boolean {
  const dir = getSessionsDir();
  const filePath = join(dir, `${id}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}
