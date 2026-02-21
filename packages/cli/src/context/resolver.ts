import type { ContextBundle } from './types.js';
import { loadInstructions } from './instructions.js';
import { loadPreferences } from './preferences.js';
import { loadAllRules } from './rules.js';
import { loadAllPersonas, findPersona } from './personas.js';
import { loadMemory } from './memory.js';

export interface ResolveContextOptions {
  cwd: string;
  personaOverride?: string;
}

export function resolveContext({ cwd, personaOverride }: ResolveContextOptions): ContextBundle {
  const instructions = loadInstructions(cwd);
  const preferences = loadPreferences();
  const rules = loadAllRules(cwd);
  const allPersonas = loadAllPersonas();
  const availablePersonas = allPersonas.map(p => p.persona.name);
  const memory = loadMemory();

  // Resolve active persona: CLI override > preferences.default_persona > none
  const personaName = personaOverride ?? preferences.default_persona;
  const activePersona = personaName ? findPersona(personaName, allPersonas) : undefined;

  return {
    instructions,
    preferences,
    rules,
    activePersona,
    availablePersonas,
    memory,
  };
}
