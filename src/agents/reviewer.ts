import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  AgentResult,
} from '../types/agent';
import type { Message } from '../types/message';
import { BaseAgent } from './base';

/**
 * Code review severity levels
 */
export type ReviewSeverity = 'critical' | 'major' | 'minor' | 'suggestion' | 'info';

/**
 * Code review categories
 */
export type ReviewCategory =
  | 'security'        // Security vulnerabilities
  | 'performance'     // Performance issues
  | 'maintainability' // Code maintainability
  | 'reliability'     // Bug and error handling
  | 'readability'     // Code clarity and style
  | 'best-practices'  // Language/framework best practices
  | 'testing'         // Test coverage and quality
  | 'documentation'   // Documentation completeness
  | 'architecture'    // Design and architecture
  | 'accessibility';  // Accessibility issues

/**
 * Individual review finding
 */
export interface ReviewFinding {
  severity: ReviewSeverity;
  category: ReviewCategory;
  message: string;
  line?: number;
  column?: number;
  file?: string;
  suggestion?: string;
  codeSnippet?: string;
}

/**
 * Code quality metrics
 */
export interface QualityMetrics {
  overallScore: number; // 0-100
  securityScore: number;
  performanceScore: number;
  maintainabilityScore: number;
  reliabilityScore: number;
  readabilityScore: number;
  complexity?: number;
  testCoverage?: number;
}

/**
 * ReviewerAgent options
 */
export interface ReviewerAgentOptions {
  language?: string;
  includeMetrics?: boolean;
  includeSuggestions?: boolean;
  minSeverity?: ReviewSeverity;
  categories?: ReviewCategory[];
  focusAreas?: ReviewCategory[];
  maxIterations?: number;
  contextMessages?: Message[];
  strictMode?: boolean;
  checkSecurity?: boolean;
  checkPerformance?: boolean;
  checkStyle?: boolean;
}

/**
 * Code review result
 */
export interface CodeReviewResult extends AgentResult {
  findings?: ReviewFinding[];
  metrics?: QualityMetrics;
  summary?: {
    totalFindings: number;
    bySeverity: Record<ReviewSeverity, number>;
    byCategory: Partial<Record<ReviewCategory, number>>;
  };
  overallRating?: string;
  language?: string;
  reviewed?: boolean;
}

/**
 * ReviewerAgent specialized for code review and quality analysis.
 * Provides comprehensive analysis of code quality, security, performance, and best practices.
 */
export class ReviewerAgent extends BaseAgent {
  private readonly severityWeights: Record<ReviewSeverity, number> = {
    critical: 100,
    major: 75,
    minor: 50,
    suggestion: 25,
    info: 0,
  };

  /**
   * Create a ReviewerAgent with specific configuration
   */
  static create(config?: Partial<AgentConfig>): ReviewerAgent {
    const defaultConfig: AgentConfig = {
      role: 'reviewer',
      name: 'ReviewerAgent',
      description: 'Specialized agent for code review and quality analysis',
      systemPrompt: `You are an expert code reviewer specializing in quality analysis, security, and best practices.
Your responsibilities include:
- Identifying bugs, security vulnerabilities, and performance issues
- Checking code quality, maintainability, and readability
- Ensuring adherence to best practices and design patterns
- Providing constructive feedback and actionable suggestions
- Evaluating test coverage and documentation completeness
- Assessing architectural decisions and design patterns

When reviewing code:
1. Analyze for security vulnerabilities (injection, XSS, auth issues, etc.)
2. Check for performance problems (inefficient algorithms, memory leaks, etc.)
3. Evaluate code maintainability (complexity, coupling, cohesion)
4. Assess reliability (error handling, edge cases, null safety)
5. Review readability (naming, structure, comments)
6. Verify best practices (SOLID, DRY, KISS principles)
7. Check test coverage and quality
8. Evaluate documentation completeness
9. Consider architectural implications
10. Check accessibility if applicable

Provide specific, actionable feedback with:
- Clear severity levels (critical, major, minor, suggestion, info)
- Exact line numbers when possible
- Code examples for suggestions
- Explanations of why issues matter
- Prioritized recommendations`,
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
      temperature: 0.1, // Very low temperature for consistent, analytical reviews
      maxTokens: 4096,
      tools: ['read_file', 'list_files', 'search_code'],
    };

    return new ReviewerAgent({ ...defaultConfig, ...config });
  }

  /**
   * Execute a code review
   */
  async execute(
    input: string,
    options?: ReviewerAgentOptions
  ): Promise<CodeReviewResult> {
    this.ensureInitialized();
    this.setState('thinking');

    try {
      // Build enhanced prompt with review context
      const enhancedPrompt = this.buildPrompt(input, options);

      // Prepare messages for LLM
      const messages: Message[] = [
        {
          id: randomUUID(),
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          id: randomUUID(),
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      // Call LLM provider
      const response = await this.llmProvider!.complete({
        model: this.config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => typeof c === 'string' ? c : 'text' in c ? c.text : '').join('') : 'text' in m.content ? m.content.text : ''),
          name: m.name,
          toolCallId: m.toolCallId,
        })),
        temperature: this.config.temperature ?? 0.1,
        maxTokens: this.config.maxTokens ?? 4096,
      });

      // Parse review results
      const { findings, overallRating } = this.parseReview(response.content, options);

      // Calculate quality metrics if requested
      const metrics = options?.includeMetrics
        ? this.calculateMetrics(findings)
        : undefined;
      
      this.setState('idle');

      return this.createReviewSuccessResult(
        'Code review completed successfully',
        findings,
        overallRating,
        metrics,
        options?.language
      );
    } catch (error) {
      this.setState('error');
      return this.createReviewErrorResult(
        'Code review failed',
        error instanceof Error ? error.message : 'Unknown error',
        options?.language
      );
    }
  }

  /**
   * Stream code review
   */
  override async *executeStream(
    input: string,
    options?: ReviewerAgentOptions
  ): AsyncIterable<{ type: 'thinking' | 'tool_use' | 'output'; content: string }> {
    this.ensureInitialized();
    this.setState('thinking');

    yield {
      type: 'thinking',
      content: 'Analyzing code for review...',
    };

    try {
      const enhancedPrompt = this.buildPrompt(input, options);

      const messages: Message[] = [
        {
          id: randomUUID(),
          role: 'system',
          content: this.config.systemPrompt,
        },
        ...(options?.contextMessages ?? []),
        {
          id: randomUUID(),
          role: 'user',
          content: enhancedPrompt,
        },
      ];

      this.setState('executing');

      let fullContent = '';

      // Stream from LLM provider
      for await (const chunk of this.llmProvider!.streamComplete({
        model: this.config.model,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(c => typeof c === 'string' ? c : 'text' in c ? c.text : '').join('') : 'text' in m.content ? m.content.text : ''),
          name: m.name,
          toolCallId: m.toolCallId,
        })),
        temperature: this.config.temperature ?? 0.1,
      })) {
        fullContent += chunk.content;

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
   * Build enhanced prompt with review context
   */
  private buildPrompt(
    input: string,
    options?: ReviewerAgentOptions
  ): string {
    const parts: string[] = [];

    // Add review scope
    parts.push('Review the following code and provide detailed feedback:');
    parts.push('');
    parts.push(input);
    parts.push('');

    // Add specific requirements
    if (options?.language) {
      parts.push(`Language: ${options.language}`);
    }

    const focusAreas = options?.focusAreas ?? options?.categories;
    if (focusAreas && focusAreas.length > 0) {
      parts.push(`Focus on: ${focusAreas.join(', ')}`);
    }

    if (options?.minSeverity) {
      parts.push(`Report issues of severity '${options.minSeverity}' and above`);
    }

    if (options?.strictMode) {
      parts.push('Use strict review standards');
    }

    // Add check preferences
    const checks: string[] = [];
    if (options?.checkSecurity !== false) {
      checks.push('security vulnerabilities');
    }
    if (options?.checkPerformance !== false) {
      checks.push('performance issues');
    }
    if (options?.checkStyle !== false) {
      checks.push('code style and readability');
    }

    if (checks.length > 0) {
      parts.push(`Check for: ${checks.join(', ')}`);
    }

    parts.push('');

    // Add output format instructions
    parts.push('Provide your review in the following format:');
    parts.push('');
    parts.push('## Summary');
    parts.push('Brief overall assessment of the code');
    parts.push('');
    parts.push('## Findings');
    parts.push('List each issue with:');
    parts.push('- Severity: [critical|major|minor|suggestion|info]');
    parts.push('- Category: [security|performance|maintainability|reliability|readability|best-practices|testing|documentation|architecture|accessibility]');
    parts.push('- Message: Clear description of the issue');
    parts.push('- Line: Line number (if applicable)');

    if (options?.includeSuggestions !== false) {
      parts.push('- Suggestion: How to fix the issue');
    }

    if (options?.includeMetrics) {
      parts.push('');
      parts.push('## Metrics');
      parts.push('Provide quality scores (0-100) for:');
      parts.push('- Security');
      parts.push('- Performance');
      parts.push('- Maintainability');
      parts.push('- Reliability');
      parts.push('- Readability');
    }

    return parts.join('\n');
  }

  /**
   * Parse review results from LLM response
   */
  private parseReview(
    content: string,
    options?: ReviewerAgentOptions
  ): { findings: ReviewFinding[]; overallRating: string } {
    const findings: ReviewFinding[] = [];
    const explicitRating = content.match(/overall\s+rating\s*:\s*([a-z-]+)/i)?.[1]?.toLowerCase();
    const inferredRating =
      content.match(/\b(excellent|good|needs-improvement|poor)\b/i)?.[1]?.toLowerCase();
    const overallRating = explicitRating ?? inferredRating ?? 'unknown';

    // Extract findings - look for structured patterns
    const findingPatterns = [
      // Pattern: - Severity: X, Category: Y, Message: Z
      /[-*]\s*Severity:\s*(\w+).*?Category:\s*([\w-]+).*?Message:\s*([^\n]+)/gi,
      // Pattern: [SEVERITY] (Category) Message
      /\[(\w+)\]\s*\((\w+)\)\s*([^\n]+)/gi,
      // Pattern: **SEVERITY**: (Category) Message
      /\*\*(\w+)\*\*:\s*\((\w+)\)\s*([^\n]+)/gi,
    ];

    for (const pattern of findingPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const [, severityStr, categoryStr, message] = match;
        
        if (!severityStr || !categoryStr || !message) continue;
        
        const severity = this.normalizeSeverity(severityStr);
        const category = this.normalizeCategory(categoryStr);
        if (severity && category) {
          // Check if severity meets minimum threshold
          if (options?.minSeverity) {
            const minWeight = this.severityWeights[options.minSeverity];
            const findingWeight = this.severityWeights[severity];
            if (findingWeight < minWeight) {
              continue;
            }
          }

          const focusAreas = options?.focusAreas ?? options?.categories;
          // Check if category is included
          if (focusAreas && !focusAreas.includes(category)) {
            continue;
          }

          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;
          const nearbyText = content.slice(endIndex, Math.min(content.length, endIndex + 220));
          const line = nearbyText.match(/Line\s*:\s*(\d+)/i)?.[1];
          const suggestion = nearbyText.match(/Suggestion\s*:\s*([^\n]+)/i)?.[1]?.trim();

          findings.push({
            severity,
            category,
            message: message?.trim() ?? '',
            line: line ? Number(line) : undefined,
            suggestion,
          });
        }
      }
    }

    return { findings, overallRating };
  }

  private buildReviewSummary(findings: ReviewFinding[]): CodeReviewResult['summary'] {
    const bySeverity: Record<ReviewSeverity, number> = {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      info: 0,
    };
    const byCategory: Partial<Record<ReviewCategory, number>> = {};

    for (const finding of findings) {
      bySeverity[finding.severity] += 1;
      byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    }

    return {
      totalFindings: findings.length,
      bySeverity,
      byCategory,
    };
  }

  private buildReadableOutput(findings: ReviewFinding[], overallRating: string): string {
    if (findings.length === 0) {
      return `No issues found. Overall rating: ${overallRating}`;
    }

    const lines: string[] = [];
    for (const finding of findings) {
      lines.push(`[${finding.severity.toUpperCase()}] (${finding.category}) - ${finding.message}`);
      if (typeof finding.line === 'number') {
        lines.push(`Line: ${finding.line}`);
      }
      if (finding.suggestion) {
        lines.push(`Suggestion: ${finding.suggestion}`);
      }
      lines.push('');
    }
    lines.push(`Overall rating: ${overallRating}`);
    return lines.join('\n').trim();
  }

  /**
   * Normalize severity string to valid severity level
   */
  private normalizeSeverity(severity: string): ReviewSeverity | null {
    const normalized = severity.toLowerCase().trim();
    const severityMap: Record<string, ReviewSeverity> = {
      critical: 'critical',
      high: 'critical',
      major: 'major',
      medium: 'major',
      minor: 'minor',
      low: 'minor',
      suggestion: 'suggestion',
      info: 'info',
    };
    return severityMap[normalized] || null;
  }

  /**
   * Normalize category string to valid review category
   */
  private normalizeCategory(category: string): ReviewCategory | null {
    const normalized = category.toLowerCase().trim();
    const categoryMap: Record<string, ReviewCategory> = {
      security: 'security',
      sec: 'security',
      performance: 'performance',
      perf: 'performance',
      maintainability: 'maintainability',
      maint: 'maintainability',
      reliability: 'reliability',
      rel: 'reliability',
      readability: 'readability',
      read: 'readability',
      'best-practices': 'best-practices',
      practices: 'best-practices',
      testing: 'testing',
      test: 'testing',
      documentation: 'documentation',
      docs: 'documentation',
      architecture: 'architecture',
      arch: 'architecture',
      accessibility: 'accessibility',
      a11y: 'accessibility',
    };
    return categoryMap[normalized] || null;
  }

  /**
   * Calculate quality metrics from findings
   */
  private calculateMetrics(findings: ReviewFinding[]): QualityMetrics {
    const categoryScores: Record<string, number> = {
      security: 100,
      performance: 100,
      maintainability: 100,
      reliability: 100,
      readability: 100,
    };

    // Deduct points based on findings
    for (const finding of findings) {
      const weight = this.severityWeights[finding.severity];
      const deduction = weight * 0.1; // 10% of weight as deduction

      // Map finding category to metric category
      const metricCategory = this.getMetricCategory(finding.category);
      if (metricCategory && categoryScores[metricCategory] !== undefined) {
        categoryScores[metricCategory] = Math.max(0, categoryScores[metricCategory] - deduction);
      }
    }

    // Calculate overall score
    const scores = Object.values(categoryScores);
    const overallScore = Math.round(
      scores.reduce((sum, score) => sum + score, 0) / scores.length
    );

    return {
      overallScore,
      securityScore: Math.round(categoryScores.security ?? 0),
      performanceScore: Math.round(categoryScores.performance ?? 0),
      maintainabilityScore: Math.round(categoryScores.maintainability ?? 0),
      reliabilityScore: Math.round(categoryScores.reliability ?? 0),
      readabilityScore: Math.round(categoryScores.readability ?? 0),
    };
  }

  /**
   * Map review category to metric category
   */
  private getMetricCategory(category: ReviewCategory): string | null {
    const categoryMap: Record<ReviewCategory, string> = {
      security: 'security',
      performance: 'performance',
      maintainability: 'maintainability',
      reliability: 'reliability',
      readability: 'readability',
      'best-practices': 'maintainability',
      testing: 'reliability',
      documentation: 'maintainability',
      architecture: 'maintainability',
      accessibility: 'readability',
    };
    return categoryMap[category] || null;
  }

  /**
   * Create a success result with review data
   */
  private createReviewSuccessResult(
    message: string,
    findings: ReviewFinding[],
    overallRating: string,
    metrics?: QualityMetrics,
    language?: string
  ): CodeReviewResult {
    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const majorCount = findings.filter((f) => f.severity === 'major').length;
    const minorCount = findings.filter((f) => f.severity === 'minor').length;
    const summary = this.buildReviewSummary(findings);
    const output = this.buildReadableOutput(findings, overallRating);

    return {
      success: true,
      message,
      output,
      findings,
      metrics,
      summary,
      overallRating,
      language,
      reviewed: true,
      metadata: {
        language,
        totalFindings: findings.length,
        criticalFindings: criticalCount,
        majorFindings: majorCount,
        minorFindings: minorCount,
        overallScore: metrics?.overallScore,
        rating: overallRating,
      },
    };
  }

  /**
   * Create an error result
   */
  private createReviewErrorResult(
    message: string,
    error: string,
    language?: string
  ): CodeReviewResult {
    return {
      success: false,
      message,
      error,
      language,
      reviewed: false,
      metadata: {
        language,
      },
    };
  }

  /**
   * Review code with specific focus
   */
  async reviewCode(
    code: string,
    options?: ReviewerAgentOptions
  ): Promise<CodeReviewResult> {
    return this.execute(code, options);
  }

  /**
   * Review for security issues
   */
  async reviewSecurity(
    code: string,
    language?: string
  ): Promise<CodeReviewResult> {
    return this.execute(code, {
      language,
      categories: ['security'],
      checkSecurity: true,
      strictMode: true,
      includeSuggestions: true,
    });
  }

  async securityReview(
    code: string,
    language?: string
  ): Promise<CodeReviewResult> {
    return this.reviewSecurity(code, language);
  }

  /**
   * Review for performance issues
   */
  async reviewPerformance(
    code: string,
    language?: string
  ): Promise<CodeReviewResult> {
    return this.execute(code, {
      language,
      categories: ['performance'],
      checkPerformance: true,
      includeSuggestions: true,
    });
  }

  /**
   * Quick code quality assessment
   */
  async assessQuality(
    code: string,
    language?: string
  ): Promise<CodeReviewResult> {
    return this.execute(code, {
      language,
      includeMetrics: true,
      minSeverity: 'minor',
    });
  }
}
