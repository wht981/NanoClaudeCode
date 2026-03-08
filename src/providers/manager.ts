import type { LLMModel, LLMProvider } from "../types/llm";
import { ClaudeProvider, type ClaudeProviderConfig } from "./claude";
import { OpenAIProvider, type OpenAIConfig } from "./openai";

export type ProviderId = "openai" | "anthropic";
export type ProviderConnectionState = "disconnected" | "connecting" | "connected" | "error";

export interface ProviderStatus {
  provider: ProviderId;
  state: ProviderConnectionState;
  model?: string;
  message?: string;
  connectedAt?: number;
}

export interface RuntimeProviderConfig {
  provider?: ProviderId;
  model?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
}

export class ProviderManager {
  private provider: LLMProvider | null = null;
  private status: ProviderStatus = {
    provider: "openai",
    state: "disconnected",
    message: "No provider connected",
  };

  private listeners: Array<(status: ProviderStatus) => void> = [];
  private config: RuntimeProviderConfig;

  constructor(config: RuntimeProviderConfig = {}) {
    this.config = { ...config };
    this.status.provider = config.provider ?? "openai";
    this.status.model = config.model;
  }

  onStatusChange(listener: (status: ProviderStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  getStatus(): ProviderStatus {
    return { ...this.status };
  }

  getActiveProvider(): LLMProvider | null {
    return this.provider;
  }

  setProvider(provider: ProviderId): void {
    this.status.provider = provider;
    this.emit({
      ...this.status,
      state: this.provider && this.status.provider === provider ? "connected" : "disconnected",
      message: `Provider set to ${provider}`,
    });
  }

  setApiKey(provider: ProviderId, key: string): void {
    if (provider === "openai") {
      this.config.openaiApiKey = key;
    } else {
      this.config.anthropicApiKey = key;
    }
  }

  setModel(model: string): void {
    this.status.model = model;
    this.config.model = model;
    this.emit({ ...this.status, message: `Model set to ${model}` });
  }

  async connect(providerArg?: ProviderId): Promise<ProviderStatus> {
    const provider = providerArg ?? this.status.provider;
    this.emit({ ...this.status, provider, state: "connecting", message: `Connecting to ${provider}...` });

    try {
      this.provider = this.createProvider(provider);
      this.status = {
        provider,
        state: "connected",
        model: this.status.model ?? this.defaultModelFor(provider),
        message: `Connected to ${provider}`,
        connectedAt: Date.now(),
      };
      this.emit(this.status);
      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.provider = null;
      this.status = {
        provider,
        state: "error",
        model: this.status.model,
        message,
      };
      this.emit(this.status);
      return this.getStatus();
    }
  }

  async disconnect(): Promise<void> {
    this.provider = null;
    this.status = {
      ...this.status,
      state: "disconnected",
      message: `Disconnected from ${this.status.provider}`,
      connectedAt: undefined,
    };
    this.emit(this.status);
  }

  async listModels(providerArg?: ProviderId): Promise<LLMModel[]> {
    const provider = providerArg ?? this.status.provider;
    const client = this.provider && this.status.provider === provider
      ? this.provider
      : this.createProvider(provider);
    return client.getModels();
  }

  private createProvider(provider: ProviderId): LLMProvider {
    if (provider === "openai") {
      const apiKey = this.config.openaiApiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is missing. Use /connect openai <apiKey> or set env.");
      }
      const cfg: OpenAIConfig = { apiKey };
      return new OpenAIProvider(cfg);
    }

    const apiKey = this.config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is missing. Use /connect anthropic <apiKey> or set env.");
    }
    const cfg: ClaudeProviderConfig = { apiKey };
    return new ClaudeProvider(cfg);
  }

  private defaultModelFor(provider: ProviderId): string {
    if (provider === "openai") return "gpt-4o-mini";
    return "claude-3-5-sonnet-20240620";
  }

  private emit(status: ProviderStatus): void {
    this.status = { ...status };
    for (const listener of this.listeners) {
      listener(this.getStatus());
    }
  }
}
