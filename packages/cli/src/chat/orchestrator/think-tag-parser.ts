/**
 * Streaming parser that extracts `<think>...</think>` tags from text-delta
 * chunks and routes content to separate callbacks.
 *
 * Models like DeepSeek and Qwen embed reasoning in `<think>` tags within
 * the regular text stream, rather than using a dedicated reasoning channel.
 * This parser detects those tags in real-time (handling tags split across
 * chunks) and routes the content appropriately.
 */
export class ThinkTagParser {
  private insideThink = false;
  private buffer = '';

  constructor(
    private onText: (text: string) => void,
    private onThinking: (text: string) => void,
  ) {}

  push(chunk: string): void {
    this.buffer += chunk;
    this.process();
  }

  /** Flush any remaining buffered content. Call when the stream ends. */
  end(): void {
    if (this.buffer) {
      if (this.insideThink) {
        this.onThinking(this.buffer);
      } else {
        this.onText(this.buffer);
      }
      this.buffer = '';
    }
  }

  private process(): void {
    while (this.buffer.length > 0) {
      if (this.insideThink) {
        this.processInsideThink();
      } else {
        this.processOutsideThink();
      }
    }
  }

  private processInsideThink(): void {
    const closeIdx = this.buffer.indexOf('</think>');
    if (closeIdx !== -1) {
      if (closeIdx > 0) {
        this.onThinking(this.buffer.slice(0, closeIdx));
      }
      this.buffer = this.buffer.slice(closeIdx + 8); // '</think>'.length
      this.insideThink = false;
      // Skip leading newlines after </think> to avoid blank lines in content
      const match = this.buffer.match(/^\n{1,2}/);
      if (match) {
        this.buffer = this.buffer.slice(match[0].length);
      }
      return;
    }

    // Check for potential partial </think> at end of buffer
    const partialLen = this.findPartialSuffix(this.buffer, '</think>');
    if (partialLen > 0) {
      const safeEnd = this.buffer.length - partialLen;
      if (safeEnd > 0) {
        this.onThinking(this.buffer.slice(0, safeEnd));
      }
      this.buffer = this.buffer.slice(safeEnd);
      return; // Wait for more data
    }

    // No close tag, no partial — emit all as thinking
    this.onThinking(this.buffer);
    this.buffer = '';
  }

  private processOutsideThink(): void {
    const openIdx = this.buffer.indexOf('<think>');
    if (openIdx !== -1) {
      if (openIdx > 0) {
        this.onText(this.buffer.slice(0, openIdx));
      }
      this.buffer = this.buffer.slice(openIdx + 7); // '<think>'.length
      this.insideThink = true;
      // Skip leading newline after <think>
      if (this.buffer.startsWith('\n')) {
        this.buffer = this.buffer.slice(1);
      }
      return;
    }

    // Check for potential partial <think> at end of buffer
    const partialLen = this.findPartialSuffix(this.buffer, '<think>');
    if (partialLen > 0) {
      const safeEnd = this.buffer.length - partialLen;
      if (safeEnd > 0) {
        this.onText(this.buffer.slice(0, safeEnd));
      }
      this.buffer = this.buffer.slice(safeEnd);
      return; // Wait for more data
    }

    // No open tag, no partial — emit all as text
    this.onText(this.buffer);
    this.buffer = '';
  }

  /**
   * Find the longest suffix of `text` that is a prefix of `tag`.
   * Returns the length of that suffix, or 0 if none.
   */
  private findPartialSuffix(text: string, tag: string): number {
    const maxLen = Math.min(text.length, tag.length - 1);
    for (let len = maxLen; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }
}
