export type HookName =
  | "beforeLoop"
  | "afterLoop"
  | "beforeTool"
  | "afterTool"
  | "onError";

export type HookPayload = Record<string, unknown>;
export type HookHandler = (payload: HookPayload) => Promise<void> | void;

export interface HooksManagerOptions {
  /** What to do when a hook handler throws. Default: 'log' */
  onError?: 'throw' | 'log' | 'silent' | ((error: Error, hookName: HookName) => void);
}

export class HooksManager {
  private readonly hooks = new Map<HookName, HookHandler[]>();
  private readonly onError: HooksManagerOptions['onError'];
  constructor(options?: HooksManagerOptions) {
    this.onError = options?.onError ?? 'log';
  }

  on(name: HookName, handler: HookHandler): void {
    const list = this.hooks.get(name) ?? [];
    list.push(handler);
    this.hooks.set(name, list);
  }

  async emit(name: HookName, payload: HookPayload): Promise<void> {
    const list = this.hooks.get(name) ?? [];
    for (const handler of list) {
      try {
        await handler(payload);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (this.onError === 'throw') throw err;
        if (this.onError === 'silent') continue;
        if (typeof this.onError === 'function') {
          this.onError(err, name);
          continue;
        }
        // Default: 'log'
        console.error(`Hook "${name}" error: ${err.message}`);
      }
    }
  }

  clear(name?: HookName): void {
    if (name) this.hooks.delete(name);
    else this.hooks.clear();
  }
}
