import type {
  AgentConfig,
  AgentResult,
} from '../types/agent';
import type { Message } from '../types/message';
import { BaseAgent } from './base';

/**
 * Research source types
 */
export type ResearchSource =
  | 'documentation'
  | 'code-examples'
  | 'best-practices'
  | 'tutorials'
  | 'api-reference'
  | 'community'
  | 'academic';

/**
 * Research depth levels
 */
export type ResearchDepth = 'quick' | 'standard' | 'deep';

/**
 * Research finding
 */
export interface ResearchFinding {
  source: ResearchSource;
  title: string;
  content: string;
  url?: string;
  relevance: number; // 0-1 score
  timestamp?: string;
}

/**
 * ResearcherAgent options
 */
export interface ResearcherAgentOptions {
  sources?: ResearchSource[];
  depth?: ResearchDepth;
  maxResults?: number;
  maxIterations?: number;
  contextMessages?: Message[];
  includeExamples?: boolean;
  verifyInformation?: boolean;
}

/**
 * Research result
 */
export interface ResearchResult extends AgentResult {
  findings?: ResearchFinding[];
  summary?: string;
  recommendations?: string[];
  metadata?: {
    totalFindings: number;
    averageRelevance: number;
    sourceBreakdown: Record<string, number>;
  };
}

/**
 * ResearcherAgent specialized for information gathering and analysis.
 * Conducts research across various sources to provide comprehensive answers.
 */
export class ResearcherAgent extends BaseAgent {
  private readonly defaultSources: ResearchSource[] = [
    'documentation',
    'code-examples',
    'best-practices',
  ];

  /**
   * Create a ResearcherAgent with specific configuration
   */
  static create(config?: Partial<AgentConfig>): ResearcherAgent {
    const defaultConfig: AgentConfig = {
      role: 'custom',
      name: 'ResearcherAgent',
      description: 'Specialized agent for research and information gathering',
      systemPrompt: `You are an expert research assistant specializing in technical information gathering and analysis.
Your responsibilities include:
- Finding relevant documentation and resources
- Analyzing code examples and best practices
- Synthesizing information from multiple sources
- Providing accurate, well-sourced answers
- Identifying authoritative references
- Recommending learning resources
- Staying current with latest developments

When researching:
1. Identify the most authoritative sources
2. Cross-reference information for accuracy
3. Provide relevant code examples when applicable
4. Cite sources with URLs when possible
5. Assess relevance and quality of findings
6. Synthesize information into clear summaries
7. Include actionable recommendations
8. Note any conflicting information or caveats`,
      capabilities: {
        canExecuteTools: true,
        canStreamResponses: true,
        canAccessFiles: true,
        canAccessNetwork: true,
        canModifySystem: false,
        maxContextTokens: 16384,
      },
      llmProvider: 'openai',
      model: 'gpt-4',
      temperature: 0.4,
      maxTokens: 4096,
      tools: ['search_web', 'read_file', 'list_files', 'search_code'],
    };

    return new ResearcherAgent({ ...defaultConfig, ...config });
  }

  /**
   * Execute a research task
   */
  async execute(
    input: string,
    options?: ResearcherAgentOptions
  ): Promise<ResearchResult> {
    this.ensureInitialized();
    this.setState('thinking');

    try {
      const sources = options?.sources ?? this.defaultSources;
      const depth = options?.depth ?? 'standard';
      const enhancedPrompt = this.buildResearchPrompt(input, sources, depth, options);

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
        temperature: this.config.temperature ?? 0.4,
        maxTokens: this.config.maxTokens ?? 4096,
      });

      const { findings, summary, recommendations } = this.parseResearchResponse(response.content);
      const metadata = this.generateMetadata(findings);

      this.setState('idle');

      return this.createResearchSuccessResult(
        'Research completed successfully',
        findings,
        summary,
        recommendations,
        metadata
      );
    } catch (error) {
      this.setState('error');
      return this.createResearchErrorResult(
        'Research failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Stream research results
   */
  override async *executeStream(
    input: string,
    options?: ResearcherAgentOptions
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    this.ensureInitialized();
    this.setState('thinking');

    yield {
      type: 'thinking',
      content: 'Conducting research...',
    };

    try {
      const sources = options?.sources ?? this.defaultSources;
      const depth = options?.depth ?? 'standard';
      const enhancedPrompt = this.buildResearchPrompt(input, sources, depth, options);

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
        temperature: this.config.temperature ?? 0.4,
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
   * Research a topic with specific sources
   */
  async research(
    topic: string,
    sources?: ResearchSource[],
    options?: Omit<ResearcherAgentOptions, 'sources'>
  ): Promise<ResearchResult> {
    return this.execute(topic, {
      ...options,
      sources,
    });
  }

  /**
   * Quick research for immediate answers
   */
  async quickResearch(
    question: string,
    options?: Omit<ResearcherAgentOptions, 'depth'>
  ): Promise<ResearchResult> {
    return this.execute(question, {
      ...options,
      depth: 'quick',
      maxResults: 5,
    });
  }

  /**
   * Deep research for comprehensive analysis
   */
  async deepResearch(
    topic: string,
    options?: Omit<ResearcherAgentOptions, 'depth'>
  ): Promise<ResearchResult> {
    return this.execute(topic, {
      ...options,
      depth: 'deep',
      verifyInformation: true,
    });
  }

  /**
   * Build research prompt with context
   */
  private buildResearchPrompt(
    input: string,
    sources: ResearchSource[],
    depth: ResearchDepth,
    options?: ResearcherAgentOptions
  ): string {
    const parts: string[] = [];

    parts.push('Research the following topic:');
    parts.push('');
    parts.push(input);
    parts.push('');

    parts.push(`Research depth: ${depth}`);
    parts.push(`Focus on sources: ${sources.join(', ')}`);

    if (options?.maxResults) {
      parts.push(`Maximum findings: ${options.maxResults}`);
    }

    if (options?.includeExamples) {
      parts.push('Include practical code examples');
    }

    if (options?.verifyInformation) {
      parts.push('Cross-reference and verify all information');
    }

    parts.push('');
    parts.push('Structure your response as:');
    parts.push('## Summary');
    parts.push('[Brief overview of findings]');
    parts.push('');
    parts.push('## Findings');
    parts.push('[SOURCE: source_type] Title: <title>');
    parts.push('Relevance: <0-1>');
    parts.push('Content: <detailed_information>');
    parts.push('URL: <url_if_available>');
    parts.push('');
    parts.push('## Recommendations');
    parts.push('- [Actionable recommendations]');

    return parts.join('\n');
  }

  /**
   * Parse research response
   */
  private parseResearchResponse(content: string): {
    findings: ResearchFinding[];
    summary: string;
    recommendations: string[];
  } {
    const findings: ResearchFinding[] = [];
    let summary = '';
    const recommendations: string[] = [];

    const lines = content.split('\n');
    let section: 'none' | 'summary' | 'findings' | 'recommendations' = 'none';
    let currentFinding: Partial<ResearchFinding> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (trimmed.startsWith('## Summary')) {
        section = 'summary';
        continue;
      } else if (trimmed.startsWith('## Findings')) {
        section = 'findings';
        continue;
      } else if (trimmed.startsWith('## Recommendations')) {
        section = 'recommendations';
        continue;
      }

      // Parse content based on section
      if (section === 'summary' && trimmed && !trimmed.startsWith('##')) {
        summary += (summary ? ' ' : '') + trimmed;
      } else if (section === 'findings') {
        const sourceMatch = trimmed.match(/\[SOURCE:\s*(\w+(?:-\w+)*)\]\s*Title:\s*(.+)/i);
        if (sourceMatch) {
          if (currentFinding) {
            findings.push(currentFinding as ResearchFinding);
          }
          currentFinding = {
            source: (sourceMatch[1] ?? 'web').toLowerCase() as ResearchSource,
            title: sourceMatch[2] ?? 'Untitled finding',
            content: '',
            relevance: 0.5,
          };
          continue;
        }

        const relevanceMatch = trimmed.match(/Relevance:\s*([\d.]+)/i);
        if (relevanceMatch && currentFinding) {
          currentFinding.relevance = parseFloat(relevanceMatch[1] ?? '0.5');
          continue;
        }

        const contentMatch = trimmed.match(/Content:\s*(.+)/i);
        if (contentMatch && currentFinding) {
          currentFinding.content = contentMatch[1] ?? '';
          continue;
        }

        const urlMatch = trimmed.match(/URL:\s*(.+)/i);
        if (urlMatch && currentFinding) {
          currentFinding.url = urlMatch[1] ?? undefined;
          continue;
        }
      } else if (section === 'recommendations' && trimmed.startsWith('-')) {
        recommendations.push(trimmed.substring(1).trim());
      }
    }

    if (currentFinding) {
      findings.push(currentFinding as ResearchFinding);
    }

    return { findings, summary, recommendations };
  }

  /**
   * Generate metadata statistics
   */
  private generateMetadata(findings: ResearchFinding[]): ResearchResult['metadata'] {
    const sourceBreakdown: Record<string, number> = {};
    let totalRelevance = 0;

    for (const finding of findings) {
      sourceBreakdown[finding.source] = (sourceBreakdown[finding.source] || 0) + 1;
      totalRelevance += finding.relevance;
    }

    return {
      totalFindings: findings.length,
      averageRelevance: findings.length > 0 ? totalRelevance / findings.length : 0,
      sourceBreakdown,
    };
  }

  /**
   * Create a success result
   */
  private createResearchSuccessResult(
    message: string,
    findings: ResearchFinding[],
    summary: string,
    recommendations: string[],
    metadata: ResearchResult['metadata']
  ): ResearchResult {
    return {
      success: true,
      message,
      output: this.formatResearch(findings, summary, recommendations),
      findings,
      summary,
      recommendations,
      metadata,
    };
  }

  /**
   * Create an error result
   */
  private createResearchErrorResult(
    message: string,
    error: string
  ): ResearchResult {
    return {
      success: false,
      message,
      error,
      metadata: {
        totalFindings: 0,
        averageRelevance: 0,
        sourceBreakdown: {},
      },
    };
  }

  /**
   * Format research as readable output
   */
  private formatResearch(
    findings: ResearchFinding[],
    summary: string,
    recommendations: string[]
  ): string {
    const lines: string[] = [];

    if (summary) {
      lines.push('## Summary');
      lines.push(summary);
      lines.push('');
    }

    if (findings.length > 0) {
      lines.push('## Findings');
      for (const finding of findings) {
        lines.push(`\n### ${finding.title}`);
        lines.push(`Source: ${finding.source} (Relevance: ${finding.relevance.toFixed(2)})`);
        lines.push(finding.content);
        if (finding.url) {
          lines.push(`URL: ${finding.url}`);
        }
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
