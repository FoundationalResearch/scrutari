import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSessionManager } from './session-manager.js';

// Mock the storage module
vi.mock('../chat/session/storage.js', () => ({
  saveSession: vi.fn(),
  loadSession: vi.fn(),
  listSessions: vi.fn(() => []),
}));

import { saveSession, loadSession, listSessions } from '../chat/session/storage.js';

const mockSaveSession = vi.mocked(saveSession);
const mockLoadSession = vi.mocked(loadSession);
const mockListSessions = vi.mocked(listSessions);

describe('WebSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a new session with default values', () => {
    const manager = new WebSessionManager();
    expect(manager.id).toBeTruthy();
    expect(manager.title).toBe('New session');
    expect(manager.messages).toEqual([]);
    expect(manager.totalCostUsd).toBe(0);
    manager.dispose();
  });

  it('resumes an existing session when resumeId is provided', () => {
    const existingSession = {
      id: 'test-123',
      title: 'Test session',
      messages: [{ id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: 1000 }],
      createdAt: 1000,
      updatedAt: 2000,
      totalCostUsd: 0.5,
    };
    mockLoadSession.mockReturnValue(existingSession);

    const manager = new WebSessionManager('test-123');
    expect(manager.id).toBe('test-123');
    expect(manager.title).toBe('Test session');
    expect(manager.messages).toHaveLength(1);
    expect(manager.totalCostUsd).toBe(0.5);
    manager.dispose();
  });

  it('creates new session when resumeId points to non-existent session', () => {
    mockLoadSession.mockReturnValue(null);

    const manager = new WebSessionManager('nonexistent');
    expect(manager.id).not.toBe('nonexistent');
    expect(manager.title).toBe('New session');
    manager.dispose();
  });

  it('adds a message to the session', () => {
    const manager = new WebSessionManager();
    const msg = { id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: Date.now() };
    manager.addMessage(msg);

    expect(manager.messages).toHaveLength(1);
    expect(manager.messages[0]).toEqual(msg);
    manager.dispose();
  });

  it('sets title from first user message', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'analyze NVDA', timestamp: Date.now() });

    expect(manager.title).toBe('analyze NVDA');
    manager.dispose();
  });

  it('truncates long titles to 80 characters', () => {
    const manager = new WebSessionManager();
    const longText = 'a'.repeat(100);
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: longText, timestamp: Date.now() });

    expect(manager.title.length).toBe(80);
    manager.dispose();
  });

  it('does not override title with subsequent user messages', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'first message', timestamp: Date.now() });
    manager.addMessage({ id: 'msg-2', role: 'user' as const, content: 'second message', timestamp: Date.now() });

    expect(manager.title).toBe('first message');
    manager.dispose();
  });

  it('updates a message by id', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'assistant' as const, content: '', timestamp: Date.now() });
    manager.updateMessage('msg-1', { content: 'updated content' });

    expect(manager.messages[0].content).toBe('updated content');
    manager.dispose();
  });

  it('ignores update for non-existent message', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: Date.now() });
    manager.updateMessage('nonexistent', { content: 'updated' });

    expect(manager.messages[0].content).toBe('hello');
    manager.dispose();
  });

  it('adds cost to the session', () => {
    const manager = new WebSessionManager();
    manager.addCost(0.005);
    manager.addCost(0.003);

    expect(manager.totalCostUsd).toBeCloseTo(0.008);
    manager.dispose();
  });

  it('saves the session to disk', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'test', timestamp: Date.now() });
    manager.save();

    expect(mockSaveSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: manager.id,
      messages: manager.messages,
    }));
    manager.dispose();
  });

  it('auto-saves every 30 seconds when dirty', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'test', timestamp: Date.now() });

    // Auto-save interval is 30s
    vi.advanceTimersByTime(30_000);
    expect(mockSaveSession).toHaveBeenCalledTimes(1);

    // Another 30s without changes should not trigger save (already clean)
    vi.advanceTimersByTime(30_000);
    expect(mockSaveSession).toHaveBeenCalledTimes(1);

    // Make dirty and wait
    manager.addMessage({ id: 'msg-2', role: 'user' as const, content: 'test2', timestamp: Date.now() });
    vi.advanceTimersByTime(30_000);
    expect(mockSaveSession).toHaveBeenCalledTimes(2);

    manager.dispose();
  });

  it('saves on dispose if dirty', () => {
    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'test', timestamp: Date.now() });

    expect(mockSaveSession).not.toHaveBeenCalled();
    manager.dispose();
    expect(mockSaveSession).toHaveBeenCalledTimes(1);
  });

  it('does not save on dispose if clean', () => {
    const manager = new WebSessionManager();
    manager.save(); // Clean
    mockSaveSession.mockClear();
    manager.dispose();
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('resumes a different session', () => {
    const newSession = {
      id: 'other-session',
      title: 'Other session',
      messages: [],
      createdAt: 1000,
      updatedAt: 2000,
      totalCostUsd: 0,
    };
    mockLoadSession.mockReturnValue(newSession);

    const manager = new WebSessionManager();
    manager.addMessage({ id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: Date.now() });

    const resumed = manager.resumeSession('other-session');
    expect(resumed).not.toBeNull();
    expect(manager.id).toBe('other-session');
    // Should have saved the previous session
    expect(mockSaveSession).toHaveBeenCalled();
    manager.dispose();
  });

  it('returns null when resuming non-existent session', () => {
    mockLoadSession.mockReturnValue(null);

    const manager = new WebSessionManager();
    const original = manager.id;
    const result = manager.resumeSession('nonexistent');

    expect(result).toBeNull();
    expect(manager.id).toBe(original);
    manager.dispose();
  });

  it('lists recent sessions', () => {
    const sessions = [
      { id: '1', title: 'First', updatedAt: 2000, messageCount: 5, totalCostUsd: 0.1 },
      { id: '2', title: 'Second', updatedAt: 1000, messageCount: 3, totalCostUsd: 0.2 },
    ];
    mockListSessions.mockReturnValue(sessions);

    const manager = new WebSessionManager();
    const result = manager.getRecentSessions();

    expect(result).toEqual(sessions);
    manager.dispose();
  });
});
