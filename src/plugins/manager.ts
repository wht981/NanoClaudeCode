export interface PluginContext {
  cwd: string;
}

export interface Plugin {
  name: string;
  setup?(context: PluginContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export class PluginManager {
  private readonly plugins = new Map<string, Plugin>();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  async loadFromPath(modulePath: string): Promise<void> {
    const imported = await import(modulePath);
    const plugin = (imported.default ?? imported.plugin) as Plugin;
    if (!plugin || typeof plugin.name !== "string") {
      throw new Error(`Invalid plugin module: ${modulePath}`);
    }
    this.register(plugin);
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    const { existsSync } = await import("node:fs");
    const { readdir } = await import("node:fs/promises");
    const path = await import("node:path");

    if (!existsSync(dirPath)) return; // Silently skip if dir doesn't exist

    const entries = await readdir(dirPath);
    for (const entry of entries) {
      if (entry.endsWith(".ts") || entry.endsWith(".js")) {
        const fullPath = path.join(dirPath, entry);
        try {
          await this.loadFromPath(fullPath);
        } catch {
          // Skip invalid plugin files
        }
      }
    }
  }

  async setupAll(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.setup?.(context);
    }
  }

  async disposeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.dispose?.();
    }
  }

  list(): string[] {
    return [...this.plugins.keys()];
  }
}
