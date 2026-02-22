import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

let cachedWidth = 80;
let cachedMarked: Marked | null = null;

function getMarked(width: number): Marked {
  if (cachedMarked && cachedWidth === width) return cachedMarked;
  cachedWidth = width;
  cachedMarked = new Marked();
  cachedMarked.use(
    markedTerminal({
      width,
      reflowText: false,
      showSectionPrefix: false,
      tab: 2,
    }),
  );
  return cachedMarked;
}

export function renderMarkdown(content: string, width = 80): string {
  if (!content) return '';
  try {
    const result = getMarked(width).parse(content) as string;
    return result.replace(/\n+$/, '');
  } catch {
    return content;
  }
}
