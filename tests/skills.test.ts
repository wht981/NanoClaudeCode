import { describe, it, expect, beforeEach } from "bun:test";
import { SkillsManager } from "../src/skills/manager";
import type { SkillDefinition } from "../src/skills/loader";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir as getTmpDir } from "node:os";
import { join } from "node:path";

const cleanupDir = (dir: string) => rm(dir, { recursive: true, force: true });

describe("SkillsManager", () => {
  let manager: SkillsManager;

  beforeEach(() => {
    manager = new SkillsManager();
  });

  describe("loadFromDirectory", () => {
    it("should silently skip if directory does not exist", async () => {
      const nonExistentDir = join(getTmpDir(), `non-existent-${Date.now()}`);
      await expect(manager.loadFromDirectory(nonExistentDir)).resolves.toBeUndefined();
      expect(manager.list()).toHaveLength(0);
    });

    it("should load nothing from empty directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should skip non-.json files", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        // Create a .txt file that should be skipped
        await writeFile(join(tempDir, "ignored.txt"), "some text");
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should skip invalid JSON files", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        // Create an invalid JSON file
        await writeFile(join(tempDir, "invalid.json"), "{invalid json}");
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should skip JSON without required fields", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        // Create a JSON file missing required fields
        const invalidSkill = { name: "test" }; // missing description
        await writeFile(
          join(tempDir, "incomplete.json"),
          JSON.stringify(invalidSkill)
        );
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should load valid skill from directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        // Create a valid skill file
        const skill: SkillDefinition = {
          name: "test-skill",
          description: "A test skill",
          prompt: "This is a test prompt",
          tags: ["test"],
        };
        await writeFile(
          join(tempDir, "test-skill.json"),
          JSON.stringify(skill)
        );
        await manager.loadFromDirectory(tempDir);
        const skills = manager.list();
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe("test-skill");
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should load multiple skills from directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "skill-"));
      try {
        // Create first skill
        const skill1: SkillDefinition = {
          name: "skill-1",
          description: "First skill",
          prompt: "Prompt 1",
        };
        await writeFile(
          join(tempDir, "skill1.json"),
          JSON.stringify(skill1)
        );

        // Create second skill
        const skill2: SkillDefinition = {
          name: "skill-2",
          description: "Second skill",
          prompt: "Prompt 2",
          tags: ["tag1", "tag2"],
        };
        await writeFile(
          join(tempDir, "skill2.json"),
          JSON.stringify(skill2)
        );

        await manager.loadFromDirectory(tempDir);
        const skills = manager.list();
        expect(skills).toHaveLength(2);
        expect(skills.map((s) => s.name)).toContain("skill-1");
        expect(skills.map((s) => s.name)).toContain("skill-2");
      } finally {
        await cleanupDir(tempDir);
      }
    });
  });

  describe("register", () => {
    it("should register a skill", () => {
      const skill: SkillDefinition = {
        name: "test-skill",
        description: "A test skill",
        prompt: "This is a test prompt",
      };
      manager.register(skill);
      const skills = manager.list();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe("test-skill");
    });
  });

  describe("registerMany", () => {
    it("should register multiple skills", () => {
      const skills: SkillDefinition[] = [
        { name: "skill-1", description: "First", prompt: "p1" },
        { name: "skill-2", description: "Second", prompt: "p2" },
      ];
      manager.registerMany(skills);
      const registered = manager.list();
      expect(registered).toHaveLength(2);
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent skill", () => {
      expect(manager.get("non-existent")).toBeUndefined();
    });

    it("should return skill by name", () => {
      const skill: SkillDefinition = {
        name: "test-skill",
        description: "A test skill",
        prompt: "This is a test prompt",
      };
      manager.register(skill);
      const found = manager.get("test-skill");
      expect(found).toBeDefined();
      expect(found?.name).toBe("test-skill");
    });
  });

  describe("list", () => {
    it("should return empty array when no skills registered", () => {
      expect(manager.list()).toHaveLength(0);
    });

    it("should return all registered skills", () => {
      manager.register({
        name: "skill-1",
        description: "First",
        prompt: "p1",
      });
      manager.register({
        name: "skill-2",
        description: "Second",
        prompt: "p2",
      });
      expect(manager.list()).toHaveLength(2);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      manager.registerMany([
        {
          name: "javascript-guide",
          description: "Learn JavaScript programming",
          prompt: "Teach JavaScript",
          tags: ["javascript", "programming"],
        },
        {
          name: "python-tutorial",
          description: "Python programming basics",
          prompt: "Teach Python",
          tags: ["python", "programming"],
        },
        {
          name: "web-design",
          description: "Create beautiful web designs",
          prompt: "Design websites",
          tags: ["design", "web"],
        },
      ]);
    });

    it("should search by name", () => {
      const results = manager.search("javascript");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("javascript-guide");
    });

    it("should search by description", () => {
      const results = manager.search("programming");
      expect(results).toHaveLength(2);
    });

    it("should search by tags", () => {
      const results = manager.search("design");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("web-design");
    });

    it("should be case-insensitive", () => {
      const results = manager.search("PYTHON");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("python-tutorial");
    });
  });
});
