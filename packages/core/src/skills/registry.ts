import { loadAllSkills } from './loader.js';
import type { SkillEntry } from './types.js';

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
