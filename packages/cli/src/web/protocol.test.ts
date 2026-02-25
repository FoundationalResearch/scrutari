import { describe, it, expect } from 'vitest';
import { parseClientMessage, ClientMessageSchema } from './protocol.js';

describe('protocol', () => {
  describe('parseClientMessage', () => {
    it('parses a valid send_message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'send_message', text: 'hello' }));
      expect(result).toEqual({ type: 'send_message', text: 'hello' });
    });

    it('parses a valid approval_response', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'approval_response', approved: true }));
      expect(result).toEqual({ type: 'approval_response', approved: true });
    });

    it('parses a valid abort message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'abort' }));
      expect(result).toEqual({ type: 'abort' });
    });

    it('parses a valid set_mode message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'set_mode', mode: 'plan', enabled: true }));
      expect(result).toEqual({ type: 'set_mode', mode: 'plan', enabled: true });
    });

    it('parses a valid get_sessions message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'get_sessions' }));
      expect(result).toEqual({ type: 'get_sessions' });
    });

    it('parses a valid resume_session message', () => {
      const result = parseClientMessage(JSON.stringify({ type: 'resume_session', sessionId: 'abc-123' }));
      expect(result).toEqual({ type: 'resume_session', sessionId: 'abc-123' });
    });

    it('returns null for invalid JSON', () => {
      expect(parseClientMessage('not json')).toBeNull();
    });

    it('returns null for unknown message type', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseClientMessage('')).toBeNull();
    });

    it('returns null for missing required fields', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'send_message' }))).toBeNull();
    });

    it('returns null for empty text in send_message', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'send_message', text: '' }))).toBeNull();
    });

    it('returns null for invalid mode in set_mode', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'set_mode', mode: 'invalid', enabled: true }))).toBeNull();
    });

    it('returns null for missing approved in approval_response', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'approval_response' }))).toBeNull();
    });

    it('returns null for empty sessionId in resume_session', () => {
      expect(parseClientMessage(JSON.stringify({ type: 'resume_session', sessionId: '' }))).toBeNull();
    });
  });

  describe('ClientMessageSchema', () => {
    it('accepts all valid set_mode modes', () => {
      for (const mode of ['plan', 'dry-run', 'read-only']) {
        const result = ClientMessageSchema.safeParse({ type: 'set_mode', mode, enabled: false });
        expect(result.success).toBe(true);
      }
    });

    it('rejects non-boolean enabled in set_mode', () => {
      const result = ClientMessageSchema.safeParse({ type: 'set_mode', mode: 'plan', enabled: 'yes' });
      expect(result.success).toBe(false);
    });

    it('rejects non-boolean approved in approval_response', () => {
      const result = ClientMessageSchema.safeParse({ type: 'approval_response', approved: 1 });
      expect(result.success).toBe(false);
    });
  });
});
