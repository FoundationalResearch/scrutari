import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ContextUsageBar } from './ContextUsageBar.js';

describe('ContextUsageBar', () => {
  it('renders token counts in K format', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={45_000} maxTokens={200_000} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('45K');
    expect(frame).toContain('200K');
  });

  it('renders token counts in M format', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={500_000} maxTokens={1_000_000} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('500K');
    expect(frame).toContain('1.0M');
  });

  it('renders small token counts as raw numbers', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={500} maxTokens={200_000} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('500');
  });

  it('shows correct percentage', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={44_000} maxTokens={200_000} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('22%');
  });

  it('shows compacting indicator when isCompacting is true', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={170_000} maxTokens={200_000} isCompacting />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Compacting...');
  });

  it('does not show compacting indicator when isCompacting is false', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={45_000} maxTokens={200_000} isCompacting={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).not.toContain('Compacting...');
  });

  it('renders progress bar', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={100_000} maxTokens={200_000} />,
    );
    const frame = lastFrame()!;
    // Should contain block characters for the progress bar
    expect(frame).toContain('\u2588');
    expect(frame).toContain('\u2591');
  });

  it('handles zero maxTokens without crashing', () => {
    const { lastFrame } = render(
      <ContextUsageBar currentTokens={0} maxTokens={0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('0%');
  });
});
