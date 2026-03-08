import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export interface SkillDefinition {
  name: string;
  description: string;
  prompt: string;
  tags?: string[];
}

export class SkillsLoader {
  async loadFromJson(path: string): Promise<SkillDefinition[]> {
    if (!existsSync(path)) {
      return [];
    }
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content) as SkillDefinition[];
    return parsed.filter((s) => Boolean(s.name) && Boolean(s.prompt));
  }
}
