/**
 * Character-based token estimation.
 *
 * Uses a conservative ratio that slightly overestimates (safer — triggers
 * compaction early rather than late). Post-hoc calibration from actual
 * result.usage corrects drift at runtime.
 */
const CHARS_PER_TOKEN = 3.5;

/** Per-message overhead for role tags, separators, etc. */
const MESSAGE_OVERHEAD_TOKENS = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
): number {
  let total = 0;

  if (systemPrompt) {
    total += estimateTokens(systemPrompt) + MESSAGE_OVERHEAD_TOKENS;
  }

  for (const msg of messages) {
    total += estimateTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS;
  }

  return total;
}
