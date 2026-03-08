import type { SkillDefinition } from "./loader";

export class SkillsManager {
  private readonly skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  search(query: string): SkillDefinition[] {
    const q = query.toLowerCase();
    return this.list().filter(
      (skill) =>
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        (skill.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    const { existsSync } = await import("node:fs");
    const { readdir, readFile } = await import("node:fs/promises");
    const path = await import("node:path");

    if (!existsSync(dirPath)) return; // Silently skip if dir doesn't exist

    const entries = await readdir(dirPath);
    for (const entry of entries) {
      if (entry.endsWith(".json")) {
        const fullPath = path.join(dirPath, entry);
        try {
          const content = await readFile(fullPath, "utf-8");
          const skill = JSON.parse(content) as SkillDefinition;
          if (skill.name && skill.description) {
            this.register(skill);
          }
        } catch {
          // Skip invalid skill files
        }
      }
    }
  }
}
