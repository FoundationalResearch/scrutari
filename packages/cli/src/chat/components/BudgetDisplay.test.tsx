import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { BudgetDisplay } from './BudgetDisplay.js';

describe('BudgetDisplay', () => {
  it('returns null when spentUsd is 0', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={0} budgetUsd={10.0} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('shows formatted dollar amounts', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={1.2345} budgetUsd={10.0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$1.2345');
    expect(frame).toContain('$10.00');
  });

  it('shows dim text with no warning when under 80%', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={5.0} budgetUsd={10.0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$5.0000');
    expect(frame).toContain('$10.00');
    expect(frame).not.toContain('[Approaching limit]');
    expect(frame).not.toContain('[Budget exceeded]');
  });

  it('shows approaching limit warning at 80%', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={8.0} budgetUsd={10.0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$8.0000');
    expect(frame).toContain('[Approaching limit]');
    expect(frame).not.toContain('[Budget exceeded]');
  });

  it('shows budget exceeded warning at 100%+', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={10.5} budgetUsd={10.0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$10.5000');
    expect(frame).toContain('[Budget exceeded]');
    expect(frame).not.toContain('[Approaching limit]');
  });

  it('handles budgetUsd of 0 without crashing', () => {
    const { lastFrame } = render(
      <BudgetDisplay spentUsd={0.5} budgetUsd={0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$0.5000');
    expect(frame).toContain('$0.00');
  });
});
