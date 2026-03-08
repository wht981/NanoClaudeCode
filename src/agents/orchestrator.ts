import type { Agent, AgentContext, AgentResult } from '../types/agent';
import type { Message } from '../types/message';
import type { LLMProvider } from '../types/llm';
import type { Tool } from '../types/tool';
import { MessageBus, type AgentMessage } from './message-bus';

export interface AgentExecutionRequest {
  agentId: string;
  input: string;
  options?: {
    streaming?: boolean;
    maxIterations?: number;
    contextMessages?: Message[];
  };
}

export interface AgentExecutionRecord {
  agentId: string;
  result: AgentResult;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}

export interface PipelineStep {
  agentId: string;
  input: string;
  options?: {
    streaming?: boolean;
    maxIterations?: number;
    contextMessages?: Message[];
  };
}

export interface OrchestratorOptions {
  messageBus?: MessageBus;
}

/**
 * Coordinates multiple agents and provides messaging + execution primitives.
 */
export class AgentOrchestrator {
  private readonly agents: Map<string, Agent> = new Map();
  private readonly messageBus: MessageBus;

  constructor(options: OrchestratorOptions = {}) {
    this.messageBus = options.messageBus ?? new MessageBus();
  }

  getBus(): MessageBus {
    return this.messageBus;
  }

  registerAgent(agent: Agent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent '${agent.id}' is already registered`);
    }

    this.agents.set(agent.id, agent);
  }

  async unregisterAgent(agentId: string, dispose = false): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    if (dispose) {
      await agent.dispose();
    }

    this.agents.delete(agentId);
    return true;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAgents(): Agent[] {
    return [...this.agents.values()];
  }

  async initializeAll(
    llmProvider: LLMProvider,
    tools: Tool[],
    context: AgentContext
  ): Promise<void> {
    await Promise.all(
      this.getAgents().map((agent) => agent.initialize(llmProvider, tools, context))
    );
  }

  async resetAll(): Promise<void> {
    await Promise.all(this.getAgents().map((agent) => agent.reset()));
  }

  async disposeAll(): Promise<void> {
    await Promise.all(this.getAgents().map((agent) => agent.dispose()));
  }

  async executeWithAgent(request: AgentExecutionRequest): Promise<AgentExecutionRecord> {
    const agent = this.getRequiredAgent(request.agentId);
    const startedAt = Date.now();
    const result = await agent.execute(request.input, request.options);
    const finishedAt = Date.now();

    return {
      agentId: request.agentId,
      result,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    };
  }

  async executeWithAll(
    input: string,
    options?: AgentExecutionRequest['options']
  ): Promise<AgentExecutionRecord[]> {
    const requests = this.getAgents().map((agent) => this.executeWithAgent({
      agentId: agent.id,
      input,
      options,
    }));

    return Promise.all(requests);
  }

  async runPipeline(steps: PipelineStep[]): Promise<AgentExecutionRecord[]> {
    const results: AgentExecutionRecord[] = [];

    for (const step of steps) {
      const execution = await this.executeWithAgent({
        agentId: step.agentId,
        input: step.input,
        options: step.options,
      });
      results.push(execution);
    }

    return results;
  }

  async sendMessage(
    fromAgentId: string,
    toAgentId: string,
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AgentMessage> {
    this.assertRegistered(fromAgentId);
    this.assertRegistered(toAgentId);

    return this.messageBus.sendToAgent(fromAgentId, toAgentId, type, payload, metadata);
  }

  async broadcastMessage(
    fromAgentId: string,
    type: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<AgentMessage> {
    this.assertRegistered(fromAgentId);

    return this.messageBus.broadcast(fromAgentId, type, payload, metadata);
  }

  private getRequiredAgent(agentId: string): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' is not registered`);
    }

    return agent;
  }

  private assertRegistered(agentId: string): void {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent '${agentId}' is not registered`);
    }
  }
}
