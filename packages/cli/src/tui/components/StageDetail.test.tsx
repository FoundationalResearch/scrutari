import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StageDetail } from './StageDetail.js';
import type { StageState } from '../types.js';

function makeStage(overrides: Partial<StageState> = {}): StageState {
  return {
    name: 'gather',
    status: 'running',
    ...overrides,
  };
}

describe('StageDetail', () => {
  it('renders nothing when stage has no tool calls or stream lines', () => {
    const stage = makeStage();
    const { lastFrame } = render(<StageDetail stage={stage} />);
    expect(lastFrame()).toBe('');
  });

  describe('running stage', () => {
    it('shows running tool call with tool name', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'searchFilings', status: 'running' }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('searchFilings...');
    });

    it('shows completed tool call with checkmark and duration', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'done', durationMs: 1200 }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('\u2713');
      expect(output).toContain('getQuote');
      expect(output).toContain('1.2s');
    });

    it('shows error tool call with cross mark', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'error', error: 'timeout' }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('\u2717');
      expect(output).toContain('getQuote');
      expect(output).toContain('timeout');
    });

    it('shows multiple tool calls', () => {
      const stage = makeStage({
        toolCalls: [
          { callId: '1', toolName: 'searchFilings', status: 'done', durationMs: 800 },
          { callId: '2', toolName: 'getQuote', status: 'running' },
        ],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('searchFilings');
      expect(output).toContain('getQuote');
    });

    it('shows last 4 stream lines', () => {
      const stage = makeStage({
        streamLines: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6'],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('Line 3');
      expect(output).toContain('Line 4');
      expect(output).toContain('Line 5');
      expect(output).toContain('Line 6');
      expect(output).not.toContain('Line 1');
      expect(output).not.toContain('Line 2');
    });

    it('shows truncation count for stream lines', () => {
      const stage = makeStage({
        streamLines: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6'],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('2 earlier lines');
    });

    it('shows tool calls and stream lines together', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'searchFilings', status: 'done', durationMs: 500 }],
        streamLines: ['Analyzing data...'],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('searchFilings');
      expect(output).toContain('Analyzing data...');
    });
  });

  describe('done stage (collapsed)', () => {
    it('shows collapsed summary with tool count', () => {
      const stage = makeStage({
        status: 'done',
        toolCalls: [
          { callId: '1', toolName: 'searchFilings', status: 'done', durationMs: 500 },
          { callId: '2', toolName: 'getQuote', status: 'done', durationMs: 300 },
          { callId: '3', toolName: 'searchNews', status: 'done', durationMs: 400 },
        ],
        streamLines: Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`),
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('\u25B8');
      expect(output).toContain('3 tool calls');
      expect(output).toContain('12 lines');
    });

    it('shows singular for 1 tool call', () => {
      const stage = makeStage({
        status: 'done',
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'done', durationMs: 200 }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('1 tool call');
    });

    it('shows singular for 1 line', () => {
      const stage = makeStage({
        status: 'done',
        streamLines: ['Single line'],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('1 line');
    });

    it('does not show individual tool names when collapsed', () => {
      const stage = makeStage({
        status: 'done',
        toolCalls: [{ callId: '1', toolName: 'searchFilings', status: 'done', durationMs: 500 }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).not.toContain('searchFilings');
    });

    it('renders nothing when done with no detail data', () => {
      const stage = makeStage({ status: 'done' });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      expect(lastFrame()).toBe('');
    });
  });

  describe('error stage (collapsed)', () => {
    it('shows collapsed summary on error', () => {
      const stage = makeStage({
        status: 'error',
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'error', error: 'fail' }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('\u25B8');
      expect(output).toContain('1 tool call');
    });
  });

  describe('duration formatting', () => {
    it('shows milliseconds for sub-second durations', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'done', durationMs: 450 }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('450ms');
    });

    it('shows seconds for longer durations', () => {
      const stage = makeStage({
        toolCalls: [{ callId: '1', toolName: 'getQuote', status: 'done', durationMs: 2500 }],
      });
      const { lastFrame } = render(<StageDetail stage={stage} />);
      const output = lastFrame();
      expect(output).toContain('2.5s');
    });
  });
});
