import { describe, it, expect, beforeEach } from "bun:test";
import { PluginManager, type Plugin } from "../src/plugins/manager";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir as getTmpDir } from "node:os";
import { join } from "node:path";

const cleanupDir = (dir: string) => rm(dir, { recursive: true, force: true });

describe("PluginManager", () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe("loadFromDirectory", () => {
    it("should silently skip if directory does not exist", async () => {
      const nonExistentDir = join(getTmpDir(), `non-existent-${Date.now()}`);
      await expect(manager.loadFromDirectory(nonExistentDir)).resolves.toBeUndefined();
      expect(manager.list()).toHaveLength(0);
    });

    it("should load nothing from empty directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "plugin-"));
      try {
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should skip non-.js and non-.ts files", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "plugin-"));
      try {
        // Create a .txt file that should be skipped
        await writeFile(join(tempDir, "ignored.txt"), "some text");
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should skip invalid plugin files", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "plugin-"));
      try {
        // Create an invalid JS file
        await writeFile(
          join(tempDir, "invalid.js"),
          "export default { invalid: true };"
        );
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toHaveLength(0);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should load valid plugin from directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "plugin-"));
      try {
        // Create a valid plugin file
        const pluginCode = `
export default {
  name: "test-plugin",
  setup: async () => { console.log("setup"); },
  dispose: async () => { console.log("dispose"); }
};`;
        await writeFile(join(tempDir, "test-plugin.js"), pluginCode);
        await manager.loadFromDirectory(tempDir);
        expect(manager.list()).toContain("test-plugin");
      } finally {
        await cleanupDir(tempDir);
      }
    });

    it("should load multiple plugins from directory", async () => {
      const tempDir = await mkdtemp(join(getTmpDir(), "plugin-"));
      try {
        // Create first plugin
        const plugin1Code = `export default { name: "plugin-1" };`;
        await writeFile(join(tempDir, "plugin1.js"), plugin1Code);

        // Create second plugin
        const plugin2Code = `export default { name: "plugin-2" };`;
        await writeFile(join(tempDir, "plugin2.js"), plugin2Code);

        await manager.loadFromDirectory(tempDir);
        const plugins = manager.list();
        expect(plugins).toHaveLength(2);
        expect(plugins).toContain("plugin-1");
        expect(plugins).toContain("plugin-2");
      } finally {
        await cleanupDir(tempDir);
      }
    });
  });

  describe("register", () => {
    it("should register a plugin", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        setup: async () => {},
      };
      manager.register(plugin);
      expect(manager.list()).toContain("test-plugin");
    });
  });

  describe("list", () => {
    it("should return empty array when no plugins registered", () => {
      expect(manager.list()).toHaveLength(0);
    });

    it("should return all registered plugins", () => {
      manager.register({ name: "plugin-1" });
      manager.register({ name: "plugin-2" });
      expect(manager.list()).toHaveLength(2);
    });
  });
});
