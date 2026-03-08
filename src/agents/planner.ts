import type {
  AgentConfig,
  AgentResult,
} from '../types/agent';
import type { Message } from '../types/message';
import { BaseAgent } from './base';

/**
 * Planning scope
 */
export type PlanningScope = 'feature' | 'sprint' | 'project' | 'architecture';

/**
 * Task priority levels
 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Task status
 */
export type TaskStatus = 'planned' | 'in-progress' | 'completed' | 'blocked';

/**
 * Planned task
 */
export interface PlannedTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedHours?: number;
  dependencies?: string[]; // Task IDs
  assignee?: string;
  tags?: string[];
}

/**
 * Planning milestone
 */
export interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate?: string;
  tasks: string[]; // Task IDs
  status: 'planned' | 'in-progress' | 'completed';
}

/**
 * PlannerAgent options
 */
export interface PlannerAgentOptions {
  scope?: PlanningScope;
  timeframe?: string;
  constraints?: string[];
  maxIterations?: number;
  contextMessages?: Message[];
  includeMilestones?: boolean;
  estimateEffort?: boolean;
}

/**
 * Planning result
 */
export interface PlanningResult extends AgentResult {
  tasks?: PlannedTask[];
  milestones?: Milestone[];
  timeline?: string;
  risks?: string[];
  recommendations?: string[];
  metadata?: {
    totalTasks: number;
    totalEstimatedHours?: number;
    tasksByPriority: Record<TaskPriority, number>;
    criticalPath?: string[];
  };
}

/**
 * PlannerAgent specialized for project planning and task breakdown.
 * Creates structured plans with tasks, dependencies, and timelines.
 */
export class PlannerAgent extends BaseAgent {
  private taskIdCounter = 0;
  private milestoneIdCounter = 0;

  /**
   * Create a PlannerAgent with specific configuration
   */
  static create(config?: Partial<AgentConfig>): PlannerAgent {
    const defaultConfig: AgentConfig = {
      role: 'custom',
      name: 'PlannerAgent',
      description: 'Specialized agent for project planning and task management',
      systemPrompt: `You are an expert project planner specializing in software development planning.
Your responsibilities include:
- Breaking down complex projects into manageable tasks
- Identifying task dependencies and critical paths
- Estimating effort and timelines realistically
- Prioritizing work based on value and risk
- Creating actionable milestones
- Identifying potential risks and blockers
- Recommending best practices for project execution
- Balancing technical debt with feature development

When creating plans:
1. Start with clear objectives and success criteria
2. Break work into small, achievable tasks (< 8 hours each)
3. Identify dependencies explicitly
4. Prioritize tasks by value and urgency
5. Consider technical constraints and risks
6. Build in buffer time for unknowns
7. Create meaningful milestones
8. Provide realistic effort estimates`,
      capabilities: {
        canExecuteTools: true,
        canStreamResponses: true,
        canAccessFiles: true,
        canAccessNetwork: false,
        canModifySystem: false,
        maxContextTokens: 16384,
      },
      llmProvider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4096,
      tools: ['read_file', 'list_files', 'search_code'],
    };

    return new PlannerAgent({ ...defaultConfig, ...config });
  }

  /**
   * Execute a planning task
   */
  async execute(
    input: string,
    options?: PlannerAgentOptions
  ): Promise<PlanningResult> {
    this.ensureInitialized();
    this.setState('thinking');

    try {
      const scope = options?.scope ?? 'feature';
      const enhancedPrompt = this.buildPlanningPrompt(input, scope, options);

      const messages: Message[] = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      const response = await this.llmProvider!.complete({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.3,
        maxTokens: this.config.maxTokens ?? 4096,
      });

      const parsed = this.parsePlanningResponse(response.content);
      const metadata = this.generateMetadata(parsed.tasks);

      this.setState('idle');

      return this.createPlanningSuccessResult(
        'Planning completed successfully',
        parsed.tasks,
        parsed.milestones,
        parsed.timeline,
        parsed.risks,
        parsed.recommendations,
        metadata
      );
    } catch (error) {
      this.setState('error');
      return this.createPlanningErrorResult(
        'Planning failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Stream planning results
   */
  override async *executeStream(
    input: string,
    options?: PlannerAgentOptions
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    this.ensureInitialized();
    this.setState('thinking');

    yield {
      type: 'thinking',
      content: 'Creating project plan...',
    };

    try {
      const scope = options?.scope ?? 'feature';
      const enhancedPrompt = this.buildPlanningPrompt(input, scope, options);

      const messages: Message[] = [
        {
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      for await (const chunk of this.llmProvider!.streamComplete({
        model: this.config.model,
        messages,
        temperature: this.config.temperature ?? 0.3,
        maxTokens: this.config.maxTokens ?? 4096,
      })) {
        yield {
          type: 'output',
          content: chunk.content,
        };
      }

      this.setState('idle');
    } catch (error) {
      this.setState('error');
      yield {
        type: 'output',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create a plan for a specific scope
   */
  async createPlan(
    objective: string,
    scope: PlanningScope,
    options?: Omit<PlannerAgentOptions, 'scope'>
  ): Promise<PlanningResult> {
    return this.execute(objective, {
      ...options,
      scope,
    });
  }

  /**
   * Quick feature planning
   */
  async planFeature(
    featureDescription: string,
    options?: Omit<PlannerAgentOptions, 'scope'>
  ): Promise<PlanningResult> {
    return this.execute(featureDescription, {
      ...options,
      scope: 'feature',
      includeMilestones: false,
    });
  }

  /**
   * Sprint planning
   */
  async planSprint(
    sprintGoals: string,
    options?: Omit<PlannerAgentOptions, 'scope'>
  ): Promise<PlanningResult> {
    return this.execute(sprintGoals, {
      ...options,
      scope: 'sprint',
      timeframe: '2 weeks',
      estimateEffort: true,
    });
  }

  /**
   * Build planning prompt
   */
  private buildPlanningPrompt(
    input: string,
    scope: PlanningScope,
    options?: PlannerAgentOptions
  ): string {
    const parts: string[] = [];

    parts.push(`Create a ${scope} plan for:`);
    parts.push('');
    parts.push(input);
    parts.push('');

    if (options?.timeframe) {
      parts.push(`Timeframe: ${options.timeframe}`);
    }

    if (options?.constraints && options.constraints.length > 0) {
      parts.push('Constraints:');
      for (const constraint of options.constraints) {
        parts.push(`- ${constraint}`);
      }
    }

    parts.push('');
    parts.push('Structure your response as:');
    parts.push('## Tasks');
    parts.push('[TASK:task-1] Title: <title>');
    parts.push('Priority: critical|high|medium|low');
    parts.push('Description: <description>');
    parts.push('Estimated Hours: <hours>');
    parts.push('Dependencies: task-2, task-3');
    parts.push('');

    if (options?.includeMilestones !== false) {
      parts.push('## Milestones');
      parts.push('[MILESTONE:m1] Title: <title>');
      parts.push('Description: <description>');
      parts.push('Tasks: task-1, task-2');
      parts.push('');
    }

    parts.push('## Timeline');
    parts.push('[Overall timeline description]');
    parts.push('');
    parts.push('## Risks');
    parts.push('- [Potential risks]');
    parts.push('');
    parts.push('## Recommendations');
    parts.push('- [Best practices and recommendations]');

    return parts.join('\n');
  }

  /**
   * Parse planning response
   */
  private parsePlanningResponse(content: string): {
    tasks: PlannedTask[];
    milestones: Milestone[];
    timeline: string;
    risks: string[];
    recommendations: string[];
  } {
    const tasks: PlannedTask[] = [];
    const milestones: Milestone[] = [];
    let timeline = '';
    const risks: string[] = [];
    const recommendations: string[] = [];

    const lines = content.split('\n');
    let section: 'none' | 'tasks' | 'milestones' | 'timeline' | 'risks' | 'recommendations' = 'none';
    let currentTask: Partial<PlannedTask> | null = null;
    let currentMilestone: Partial<Milestone> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (trimmed.startsWith('## Tasks')) {
        section = 'tasks';
        continue;
      } else if (trimmed.startsWith('## Milestones')) {
        section = 'milestones';
        continue;
      } else if (trimmed.startsWith('## Timeline')) {
        section = 'timeline';
        continue;
      } else if (trimmed.startsWith('## Risks')) {
        section = 'risks';
        continue;
      } else if (trimmed.startsWith('## Recommendations')) {
        section = 'recommendations';
        continue;
      }

      // Parse tasks
      if (section === 'tasks') {
        const taskMatch = trimmed.match(/\[TASK:([^\]]+)\]\s*Title:\s*(.+)/i);
        if (taskMatch) {
          if (currentTask) {
            tasks.push(currentTask as PlannedTask);
          }
          currentTask = {
            id: taskMatch[1],
            title: taskMatch[2],
            description: '',
            priority: 'medium',
            status: 'planned',
          };
          continue;
        }

        if (currentTask) {
          const priorityMatch = trimmed.match(/Priority:\s*(critical|high|medium|low)/i);
          if (priorityMatch) {
            currentTask.priority = (priorityMatch[1] ?? 'medium').toLowerCase() as TaskPriority;
            continue;
          }

          const descMatch = trimmed.match(/Description:\s*(.+)/i);
          if (descMatch) {
            currentTask.description = descMatch[1] ?? '';
            continue;
          }

          const hoursMatch = trimmed.match(/Estimated Hours:\s*(\d+)/i);
          if (hoursMatch) {
            currentTask.estimatedHours = parseInt(hoursMatch[1] ?? '0', 10);
            continue;
          }

          const depsMatch = trimmed.match(/Dependencies:\s*(.+)/i);
          if (depsMatch) {
            currentTask.dependencies = (depsMatch[1] ?? '').split(',').map(d => d.trim()).filter(Boolean);
            continue;
          }
        }
      }

      // Parse milestones
      if (section === 'milestones') {
        const milestoneMatch = trimmed.match(/\[MILESTONE:([^\]]+)\]\s*Title:\s*(.+)/i);
        if (milestoneMatch) {
          if (currentMilestone) {
            milestones.push(currentMilestone as Milestone);
          }
          currentMilestone = {
            id: milestoneMatch[1] ?? 'milestone',
            title: milestoneMatch[2] ?? 'Untitled milestone',
            description: '',
            tasks: [],
            status: 'planned',
          };
          continue;
        }

        if (currentMilestone) {
          const descMatch = trimmed.match(/Description:\s*(.+)/i);
          if (descMatch) {
            currentMilestone.description = descMatch[1] ?? '';
            continue;
          }

          const tasksMatch = trimmed.match(/Tasks:\s*(.+)/i);
          if (tasksMatch) {
            currentMilestone.tasks = (tasksMatch[1] ?? '').split(',').map(t => t.trim()).filter(Boolean);
            continue;
          }
        }
      }

      // Parse other sections
      if (section === 'timeline' && trimmed && !trimmed.startsWith('##')) {
        timeline += (timeline ? ' ' : '') + trimmed;
      } else if (section === 'risks' && trimmed.startsWith('-')) {
        risks.push(trimmed.substring(1).trim());
      } else if (section === 'recommendations' && trimmed.startsWith('-')) {
        recommendations.push(trimmed.substring(1).trim());
      }
    }

    if (currentTask) {
      tasks.push(currentTask as PlannedTask);
    }
    if (currentMilestone) {
      milestones.push(currentMilestone as Milestone);
    }

    return { tasks, milestones, timeline, risks, recommendations };
  }

  /**
   * Generate metadata statistics
   */
  private generateMetadata(tasks: PlannedTask[]): PlanningResult['metadata'] {
    const tasksByPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    let totalEstimatedHours = 0;

    for (const task of tasks) {
      tasksByPriority[task.priority]++;
      if (task.estimatedHours) {
        totalEstimatedHours += task.estimatedHours;
      }
    }

    return {
      totalTasks: tasks.length,
      totalEstimatedHours: totalEstimatedHours > 0 ? totalEstimatedHours : undefined,
      tasksByPriority,
    };
  }

  /**
   * Create a success result
   */
  private createPlanningSuccessResult(
    message: string,
    tasks: PlannedTask[],
    milestones: Milestone[],
    timeline: string,
    risks: string[],
    recommendations: string[],
    metadata: PlanningResult['metadata']
  ): PlanningResult {
    return {
      success: true,
      message,
      output: this.formatPlan(tasks, milestones, timeline, risks, recommendations),
      tasks,
      milestones,
      timeline,
      risks,
      recommendations,
      metadata,
    };
  }

  /**
   * Create an error result
   */
  private createPlanningErrorResult(
    message: string,
    error: string
  ): PlanningResult {
    return {
      success: false,
      message,
      error,
      metadata: {
        totalTasks: 0,
        tasksByPriority: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    };
  }

  /**
   * Format plan as readable output
   */
  private formatPlan(
    tasks: PlannedTask[],
    milestones: Milestone[],
    timeline: string,
    risks: string[],
    recommendations: string[]
  ): string {
    const lines: string[] = [];

    lines.push('# Project Plan');
    lines.push('');

    if (tasks.length > 0) {
      lines.push('## Tasks');
      for (const task of tasks) {
        lines.push(`\n### ${task.title} [${task.priority.toUpperCase()}]`);
        lines.push(`ID: ${task.id}`);
        lines.push(`Status: ${task.status}`);
        lines.push(task.description);
        if (task.estimatedHours) {
          lines.push(`Estimated: ${task.estimatedHours}h`);
        }
        if (task.dependencies && task.dependencies.length > 0) {
          lines.push(`Dependencies: ${task.dependencies.join(', ')}`);
        }
      }
      lines.push('');
    }

    if (milestones.length > 0) {
      lines.push('## Milestones');
      for (const milestone of milestones) {
        lines.push(`\n### ${milestone.title}`);
        lines.push(milestone.description);
        lines.push(`Tasks: ${milestone.tasks.join(', ')}`);
      }
      lines.push('');
    }

    if (timeline) {
      lines.push('## Timeline');
      lines.push(timeline);
      lines.push('');
    }

    if (risks.length > 0) {
      lines.push('## Risks');
      for (const risk of risks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');
    }

    if (recommendations.length > 0) {
      lines.push('## Recommendations');
      for (const rec of recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }
}
