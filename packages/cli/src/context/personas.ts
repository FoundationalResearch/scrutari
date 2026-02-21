import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { PersonaSchema } from './schemas.js';
import type { Persona, LoadedPersona } from './types.js';

const USER_PERSONAS_DIR = resolve(homedir(), '.scrutari', 'personas');

export const BUILT_IN_PERSONAS: Persona[] = [
  {
    name: 'equity-analyst',
    description: 'Deep fundamental analysis, DCF-focused, long-form reports',
    system_prompt: `You are a senior equity analyst. Focus on deep fundamental analysis: financial statement dissection, DCF modeling, valuation multiples (P/E, EV/EBITDA, P/FCF), and balance sheet quality. Always cite specific numbers from SEC filings. Be skeptical of management narratives — let the data speak. Produce long-form, detailed reports with clear sections. Flag risks prominently and quantify them where possible.`,
    analysis_depth: 'deep',
    risk_framing: 'conservative',
    tone: 'formal and data-driven',
  },
  {
    name: 'pm-brief',
    description: 'Portfolio manager style, concise, risk-focused, relative value',
    system_prompt: `You are an experienced portfolio manager. Keep analysis concise and decision-oriented. Evaluate investments through a portfolio lens: position sizing, sector exposure, correlation, and risk-adjusted returns. Compare opportunities on a relative-value basis. Think in terms of risk/reward ratios, margin of safety, and portfolio impact. Summarize with clear buy/hold/sell conviction.`,
    analysis_depth: 'standard',
    risk_framing: 'moderate',
    tone: 'concise and decision-oriented',
  },
  {
    name: 'quant-screen',
    description: 'Data-heavy, metrics-first, minimal narrative',
    system_prompt: `You are a quantitative analyst. Prioritize data and metrics over narrative. Present results as structured data: tables, ratios, factor exposures, and statistical summaries. Minimize prose — use numbers, percentages, and rankings. When narrative is needed, keep it terse. Focus on systematic signals, screening criteria, and quantifiable patterns.`,
    analysis_depth: 'deep',
    output_format: 'json',
    risk_framing: 'moderate',
    tone: 'terse and quantitative',
  },
  {
    name: 'thesis-builder',
    description: 'Bull/bear framework, catalyst-focused, price targets',
    system_prompt: `You are an investment thesis builder. Structure every analysis around a bull/bear framework. Identify and prioritize catalysts (upcoming earnings, product launches, regulatory events, macro shifts). Build explicit price targets with base/bull/bear scenarios and probability weightings. Be opinionated — take a stance and defend it with evidence. Always include a timeline for thesis realization.`,
    analysis_depth: 'deep',
    risk_framing: 'moderate',
    tone: 'structured and opinionated',
  },
];

function loadUserPersonas(): LoadedPersona[] {
  if (!existsSync(USER_PERSONAS_DIR)) return [];

  const files = readdirSync(USER_PERSONAS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const personas: LoadedPersona[] = [];

  for (const file of files) {
    const filePath = resolve(USER_PERSONAS_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const raw = parseYaml(content);
      if (raw === null || raw === undefined) continue;

      const result = PersonaSchema.safeParse(raw);
      if (result.success) {
        personas.push({ persona: result.data, filePath, source: 'user' });
      }
    } catch {
      // Skip unparseable files
    }
  }

  return personas;
}

export function loadAllPersonas(): LoadedPersona[] {
  const builtIn: LoadedPersona[] = BUILT_IN_PERSONAS.map(persona => ({
    persona,
    filePath: '<built-in>',
    source: 'built-in' as const,
  }));

  const userPersonas = loadUserPersonas();

  // User personas override built-in by name
  const byName = new Map<string, LoadedPersona>();
  for (const p of builtIn) byName.set(p.persona.name, p);
  for (const p of userPersonas) byName.set(p.persona.name, p);

  return [...byName.values()];
}

export function findPersona(name: string, personas: LoadedPersona[]): LoadedPersona | undefined {
  return personas.find(p => p.persona.name === name);
}
