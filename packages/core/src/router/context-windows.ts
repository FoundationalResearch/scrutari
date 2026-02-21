// Context window sizes (max input tokens) for supported models
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  'claude-opus-4-20250514':         200_000,
  'claude-sonnet-4-20250514':       200_000,
  'claude-haiku-3-5-20241022':      200_000,
  // OpenAI
  'gpt-4o':                         128_000,
  'gpt-4o-mini':                    128_000,
  'o1':                             200_000,
  'o1-mini':                        128_000,
  // Google Gemini
  'gemini-2.5-pro':               1_000_000,
  'gemini-2.5-flash':             1_000_000,
  'gemini-2.0-flash':             1_000_000,
  // MiniMax
  'MiniMax-M2':                   1_000_000,
  'MiniMax-M2-Stable':            1_000_000,
};

const FALLBACK_CONTEXT_WINDOW = 128_000;

export function getContextWindowSize(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? FALLBACK_CONTEXT_WINDOW;
}
