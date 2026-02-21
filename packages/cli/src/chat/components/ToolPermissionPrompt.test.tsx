import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ToolPermissionPrompt } from './ToolPermissionPrompt.js';

describe('ToolPermissionPrompt', () => {
  it('renders tool name', () => {
    const { lastFrame } = render(
      <ToolPermissionPrompt
        toolName="run_pipeline"
        args={{ skill: 'deep-dive', inputs: { ticker: 'NVDA' } }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Tool Permission Required');
    expect(output).toContain('run_pipeline');
  });

  it('renders args summary', () => {
    const { lastFrame } = render(
      <ToolPermissionPrompt
        toolName="run_pipeline"
        args={{ skill: 'deep-dive' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('skill');
    expect(output).toContain('deep-dive');
  });

  it('shows approve and deny buttons', () => {
    const { lastFrame } = render(
      <ToolPermissionPrompt
        toolName="get_quote"
        args={{ ticker: 'AAPL' }}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Allow');
    expect(output).toContain('Deny');
  });

  it('calls onApprove when Y is pressed', async () => {
    const onApprove = vi.fn();
    const { stdin } = render(
      <ToolPermissionPrompt
        toolName="run_pipeline"
        args={{}}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('y');
    await new Promise(r => setTimeout(r, 50));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onDeny when N is pressed', async () => {
    const onDeny = vi.fn();
    const { stdin } = render(
      <ToolPermissionPrompt
        toolName="run_pipeline"
        args={{}}
        onApprove={vi.fn()}
        onDeny={onDeny}
      />,
    );

    await new Promise(r => setTimeout(r, 50));
    stdin.write('n');
    await new Promise(r => setTimeout(r, 50));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });
});
