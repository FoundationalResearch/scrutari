declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';

  interface MarkedTerminalOptions {
    width?: number;
    reflowText?: boolean;
    showSectionPrefix?: boolean;
    tab?: number;
    emoji?: boolean;
    tableOptions?: Record<string, unknown>;
  }

  export function markedTerminal(
    options?: MarkedTerminalOptions,
    highlightOptions?: Record<string, unknown>,
  ): MarkedExtension;
}
