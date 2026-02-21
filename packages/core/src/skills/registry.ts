import { loadAllSkills } from './loader.js';
import { scanAgentSkillSummaries, loadAgentSkill } from './agent-loader.js';
import type { SkillEntry, AgentSkill, AgentSkillSummary } from './types.js';

export class SkillRegistry {
  private readonly _skills = new Map<string, SkillEntry>();

  get size(): number {
    return this._skills.size;
  }

  register(entry: SkillEntry): void {
    this._skills.set(entry.skill.name, entry);
  }

  get(name: string): SkillEntry | undefined {
    return this._skills.get(name);
  }

  has(name: string): boolean {
    return this._skills.has(name);
  }

  list(): SkillEntry[] {
    return [...this._skills.values()];
  }

  names(): string[] {
    return [...this._skills.keys()];
  }

  remove(name: string): boolean {
    return this._skills.delete(name);
  }

  clear(): void {
    this._skills.clear();
  }

  loadFrom(options: { builtInDir: string; userDir?: string }): void {
    const entries = loadAllSkills(options);
    for (const entry of entries) {
      this.register(entry);
    }
  }
}

export class AgentSkillRegistry {
  private readonly _summaries = new Map<string, AgentSkillSummary>();
  private readonly _loaded = new Map<string, AgentSkill>();

  get size(): number {
    return this._summaries.size;
  }

  loadSummariesFrom(options: { builtInDir: string; userDir?: string }): void {
    const summaries = scanAgentSkillSummaries(options.builtInDir, options.userDir);
    for (const summary of summaries) {
      this._summaries.set(summary.name, summary);
    }
  }

  getSummary(name: string): AgentSkillSummary | undefined {
    return this._summaries.get(name);
  }

  listSummaries(): AgentSkillSummary[] {
    return [...this._summaries.values()];
  }

  load(name: string): AgentSkill | undefined {
    // Return cached if already loaded
    if (this._loaded.has(name)) {
      return this._loaded.get(name);
    }

    const summary = this._summaries.get(name);
    if (!summary) return undefined;

    const skill = loadAgentSkill(summary.dirPath, summary.source);
    this._loaded.set(name, skill);
    return skill;
  }

  has(name: string): boolean {
    return this._summaries.has(name);
  }

  names(): string[] {
    return [...this._summaries.keys()];
  }

  clear(): void {
    this._summaries.clear();
    this._loaded.clear();
  }
}
