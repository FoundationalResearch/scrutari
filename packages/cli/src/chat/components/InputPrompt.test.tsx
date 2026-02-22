import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { InputPrompt } from './InputPrompt.js';
import { getCommandList } from '../commands.js';

const commands = getCommandList(['deep-dive', 'comp-analysis']);

describe('InputPrompt', () => {
  it('renders prompt symbol', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} commands={commands} />
    );
    expect(lastFrame()).toContain('\u276F');
  });

  it('shows waiting message when disabled', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} disabled commands={commands} />
    );
    expect(lastFrame()).toContain('Waiting for response');
  });

  it('shows [PLAN] prefix in plan mode', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} planMode commands={commands} />
    );
    expect(lastFrame()).toContain('[PLAN]');
  });

  it('shows [READ-ONLY] prefix in read-only mode', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} readOnly commands={commands} />
    );
    expect(lastFrame()).toContain('[READ-ONLY]');
  });

  it('shows [DRY-RUN] prefix in dry-run mode', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} dryRun commands={commands} />
    );
    expect(lastFrame()).toContain('[DRY-RUN]');
  });

  it('does not show [DRY-RUN] when plan mode takes precedence', () => {
    const { lastFrame } = render(
      <InputPrompt onSubmit={vi.fn()} planMode dryRun commands={commands} />
    );
    expect(lastFrame()).toContain('[PLAN]');
    expect(lastFrame()).not.toContain('[DRY-RUN]');
  });
});

describe('InputPrompt autocomplete', () => {
  it('shows autocomplete menu when typing /', async () => {
    const { lastFrame, stdin } = render(
      <InputPrompt onSubmit={vi.fn()} commands={commands} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('/plan');
    expect(frame).toContain('/proceed');
    // More than 8 commands so overflow indicator should show
    expect(frame).toContain('more');
  });

  it('filters suggestions as user types', async () => {
    const { lastFrame, stdin } = render(
      <InputPrompt onSubmit={vi.fn()} commands={commands} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('/pl');
    await new Promise(r => setTimeout(r, 50));
    const frame = lastFrame();
    expect(frame).toContain('/plan');
    expect(frame).not.toContain('/help');
  });

  it('hides menu when input does not start with /', async () => {
    const { lastFrame, stdin } = render(
      <InputPrompt onSubmit={vi.fn()} commands={commands} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('hello');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).not.toContain('/plan');
  });

  it('shows skill commands in suggestions', async () => {
    const { lastFrame, stdin } = render(
      <InputPrompt onSubmit={vi.fn()} commands={commands} />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('/deep');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('/deep-dive');
  });

  it('calls onEscapeMode when ESC pressed and no menu is open', async () => {
    const onEscapeMode = vi.fn();
    const { stdin } = render(
      <InputPrompt
        onSubmit={vi.fn()}
        planMode
        onEscapeMode={onEscapeMode}
        commands={commands}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    stdin.write('\x1b');
    await new Promise(r => setTimeout(r, 50));
    expect(onEscapeMode).toHaveBeenCalledTimes(1);
  });

  it('dismisses menu on first ESC instead of calling onEscapeMode', async () => {
    const onEscapeMode = vi.fn();
    const { lastFrame, stdin } = render(
      <InputPrompt
        onSubmit={vi.fn()}
        planMode
        onEscapeMode={onEscapeMode}
        commands={commands}
      />
    );
    await new Promise(r => setTimeout(r, 50));
    // Type / to open menu
    stdin.write('/');
    await new Promise(r => setTimeout(r, 50));
    expect(lastFrame()).toContain('/plan');
    // First ESC dismisses menu
    stdin.write('\x1b');
    await new Promise(r => setTimeout(r, 50));
    expect(onEscapeMode).not.toHaveBeenCalled();
  });
});
