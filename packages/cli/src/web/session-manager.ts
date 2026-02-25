import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../chat/types.js';
import type { Session, SessionSummary } from '../chat/session/types.js';
import { saveSession, loadSession, listSessions } from '../chat/session/storage.js';

const AUTO_SAVE_INTERVAL_MS = 30_000;

export class WebSessionManager {
  private session: Session;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor(resumeId?: string) {
    if (resumeId) {
      const existing = loadSession(resumeId);
      if (existing) {
        this.session = existing;
      } else {
        this.session = this.createNewSession();
      }
    } else {
      this.session = this.createNewSession();
    }

    this.startAutoSave();
  }

  private createNewSession(): Session {
    return {
      id: randomUUID(),
      title: 'New session',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalCostUsd: 0,
    };
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  get id(): string {
    return this.session.id;
  }

  get title(): string {
    return this.session.title;
  }

  get messages(): ChatMessage[] {
    return this.session.messages;
  }

  get totalCostUsd(): number {
    return this.session.totalCostUsd;
  }

  addMessage(message: ChatMessage): void {
    this.session.messages.push(message);
    this.session.updatedAt = Date.now();
    this.dirty = true;

    // Set title from first user message
    if (message.role === 'user' && this.session.title === 'New session') {
      this.session.title = message.content.slice(0, 80);
    }
  }

  updateMessage(id: string, update: Partial<ChatMessage>): void {
    const idx = this.session.messages.findIndex(m => m.id === id);
    if (idx >= 0) {
      this.session.messages[idx] = { ...this.session.messages[idx], ...update };
      this.session.updatedAt = Date.now();
      this.dirty = true;
    }
  }

  addCost(cost: number): void {
    this.session.totalCostUsd += cost;
    this.session.updatedAt = Date.now();
    this.dirty = true;
  }

  save(): void {
    saveSession(this.session);
    this.dirty = false;
  }

  dispose(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.dirty) {
      this.save();
    }
  }

  resumeSession(sessionId: string): Session | null {
    const existing = loadSession(sessionId);
    if (!existing) return null;

    // Save current session before switching
    this.save();

    this.session = existing;
    this.dirty = false;
    return existing;
  }

  getRecentSessions(): SessionSummary[] {
    return listSessions();
  }
}
