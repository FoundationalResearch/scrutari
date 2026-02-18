/**
 * Word document (DOCX) output formatter.
 *
 * Uses the `docx` package to produce a professionally formatted document with:
 * - Cover page with ticker, date, and skill name
 * - Table of contents
 * - Headers and footers with page numbers
 * - Verification summary table
 * - Financial data in formatted tables
 * - Source citations as footnotes
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  BorderStyle,
  ShadingType,
  TableOfContents,
} from 'docx';
import type { VerificationReport } from '../verification/types.js';
import type { Skill } from '../skills/types.js';

export interface DocxFormatOptions {
  /** The primary analysis output text. */
  primaryOutput: string;
  /** All stage outputs keyed by stage name. */
  outputs: Record<string, string>;
  /** Pipeline inputs (ticker, etc.). */
  inputs: Record<string, string | string[] | number | boolean>;
  /** The skill definition. */
  skill: Skill;
  /** Model used for the analysis. */
  model?: string;
  /** Total cost in USD. */
  totalCostUsd?: number;
  /** Total duration in milliseconds. */
  totalDurationMs?: number;
  /** Verification report (if verification ran). */
  verification?: VerificationReport;
}

/**
 * Generate a DOCX buffer from analysis results.
 */
export async function formatDocx(options: DocxFormatOptions): Promise<Buffer> {
  const { primaryOutput, inputs, skill, model, totalCostUsd, totalDurationMs, verification } = options;
  const ticker = typeof inputs.ticker === 'string' ? inputs.ticker : 'Analysis';
  const date = new Date().toISOString().split('T')[0];

  const doc = new Document({
    creator: 'scrutari',
    title: `${ticker} — ${skill.name}`,
    description: skill.description,
    sections: [
      // Cover page
      buildCoverSection(ticker, date, skill, model, totalCostUsd),
      // Table of contents
      buildTocSection(),
      // Main content
      buildContentSection(primaryOutput, verification),
      // Verification section (if present)
      ...(verification && verification.claims.length > 0
        ? [buildVerificationSection(verification)]
        : []),
      // Metadata section
      buildMetadataSection(skill, model, totalCostUsd, totalDurationMs),
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function buildCoverSection(
  ticker: string,
  date: string,
  skill: Skill,
  model?: string,
  totalCostUsd?: number,
) {
  return {
    properties: {},
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'scrutari', italics: true, color: '888888', size: 18 }),
            ],
          }),
        ],
      }),
    },
    children: [
      // Spacer
      new Paragraph({ spacing: { before: 4000 }, children: [] }),
      // Ticker as large title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: ticker, bold: true, size: 72, font: 'Calibri' }),
        ],
      }),
      // Skill name
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({ text: skill.name.replace(/-/g, ' ').toUpperCase(), size: 28, color: '555555', font: 'Calibri' }),
        ],
      }),
      // Description
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({ text: skill.description, size: 22, italics: true, color: '777777' }),
        ],
      }),
      // Divider line
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { after: 400 },
        children: [],
      }),
      // Date
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `Date: ${date}`, size: 22, color: '666666' }),
        ],
      }),
      // Model
      ...(model ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: `Model: ${model}`, size: 22, color: '666666' }),
          ],
        }),
      ] : []),
      // Cost
      ...(totalCostUsd !== undefined ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: `Cost: $${totalCostUsd.toFixed(2)}`, size: 22, color: '666666' }),
          ],
        }),
      ] : []),
      // Page break
      new Paragraph({ children: [new PageBreak()] }),
    ],
  };
}

function buildTocSection() {
  return {
    properties: {},
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'scrutari', italics: true, color: '888888', size: 18 }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
            ],
          }),
        ],
      }),
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Table of Contents' })],
      }),
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-3',
      }),
      new Paragraph({ children: [new PageBreak()] }),
    ],
  };
}

function buildContentSection(primaryOutput: string, _verification?: VerificationReport) {
  const children: Paragraph[] = [];

  // Parse the markdown-ish primary output into docx paragraphs
  const lines = primaryOutput.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === '---') {
      children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
      continue;
    }

    // Headers
    const h1Match = trimmed.match(/^#\s+(.*)/);
    if (h1Match) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
        children: [new TextRun({ text: h1Match[1] })],
      }));
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.*)/);
    if (h2Match) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 250, after: 150 },
        children: [new TextRun({ text: h2Match[1] })],
      }));
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.*)/);
    if (h3Match) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: h3Match[1] })],
      }));
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 50 },
        children: parseInlineFormatting(trimmed.substring(2)),
      }));
      continue;
    }

    // Regular paragraph
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: parseInlineFormatting(trimmed),
    }));
  }

  return {
    properties: {},
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'scrutari', italics: true, color: '888888', size: 18 }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
            ],
          }),
        ],
      }),
    },
    children,
  };
}

function buildVerificationSection(verification: VerificationReport) {
  const { summary, claims } = verification;
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 200 },
    children: [new TextRun({ text: 'Verification Results' })],
  }));

  // Summary table
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: 'Summary' })],
  }));

  const headerShading = { type: ShadingType.SOLID, color: '2B579A', fill: '2B579A' };

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          makeHeaderCell('Metric', headerShading),
          makeHeaderCell('Value', headerShading),
        ],
      }),
      makeDataRow('Total Claims', String(summary.totalClaims)),
      makeDataRow('Verified', String(summary.verified)),
      makeDataRow('Disputed', String(summary.disputed)),
      makeDataRow('Unverified', String(summary.unverified)),
      makeDataRow('Errors', String(summary.errors)),
      makeDataRow('Overall Confidence', `${Math.round(summary.overallConfidence * 100)}%`),
    ],
  }));

  // Disputed claims detail
  const disputed = claims.filter(c => c.status === 'disputed');
  if (disputed.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: 'Disputed Claims' })],
    }));

    for (const claim of disputed) {
      children.push(new Paragraph({
        spacing: { after: 50 },
        children: [
          new TextRun({ text: `${claim.id}: `, bold: true }),
          new TextRun({ text: claim.text }),
        ],
      }));
      if (claim.reasoning) {
        children.push(new Paragraph({
          spacing: { after: 100 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: claim.reasoning, italics: true, color: '666666' }),
          ],
        }));
      }
    }
  }

  return {
    properties: {},
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'scrutari', italics: true, color: '888888', size: 18 }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
            ],
          }),
        ],
      }),
    },
    children,
  };
}

function buildMetadataSection(
  skill: Skill,
  model?: string,
  totalCostUsd?: number,
  totalDurationMs?: number,
) {
  const headerShading = { type: ShadingType.SOLID, color: '2B579A', fill: '2B579A' };
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 200 },
    children: [new TextRun({ text: 'Execution Details' })],
  }));

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('Parameter', headerShading),
        makeHeaderCell('Value', headerShading),
      ],
    }),
    makeDataRow('Skill', skill.name),
    makeDataRow('Stages', String(skill.stages.length)),
  ];

  if (model) rows.push(makeDataRow('Model', model));
  if (totalCostUsd !== undefined) rows.push(makeDataRow('Total Cost', `$${totalCostUsd.toFixed(4)}`));
  if (totalDurationMs !== undefined) rows.push(makeDataRow('Duration', formatDuration(totalDurationMs)));

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  }));

  children.push(new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: `Generated by scrutari on ${new Date().toISOString().split('T')[0]}`,
        italics: true,
        color: '888888',
        size: 18,
      }),
    ],
  }));

  return {
    properties: {},
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'scrutari', italics: true, color: '888888', size: 18 }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
            ],
          }),
        ],
      }),
    },
    children,
  };
}

/**
 * Parse basic markdown inline formatting (bold, italic) into TextRun arrays.
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Simple regex-based inline formatting: **bold**, *italic*, `code`
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.substring(lastIndex, match.index) }));
    }

    if (match[2]) {
      // Bold
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      // Italic
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      // Code
      runs.push(new TextRun({ text: match[4], font: 'Consolas', size: 20, shading: { type: ShadingType.SOLID, color: 'F0F0F0', fill: 'F0F0F0' } }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.substring(lastIndex) }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}

function makeHeaderCell(text: string, shading: { type: (typeof ShadingType)[keyof typeof ShadingType]; color: string; fill: string }): TableCell {
  return new TableCell({
    shading,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })],
      }),
    ],
  });
}

function makeDataRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, size: 22 })] })],
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 22 })] })],
      }),
    ],
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
