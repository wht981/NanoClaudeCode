/**
 * Test Fixtures
 * Shared data for tests
 */

export const sampleCodeSnippet = `
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`;

export const samplePrompt =
  'Optimize this function for performance using memoization';

export const sampleContext = {
  filePath: '/test/fibonacci.ts',
  language: 'typescript',
  codeSnippet: sampleCodeSnippet,
};

export const sampleMessages = [
  {
    role: 'user' as const,
    content: 'What does this code do?',
  },
  {
    role: 'assistant' as const,
    content: 'This calculates the Fibonacci sequence.',
  },
];

export const sampleToolInput = {
  command: 'analyze',
  code: sampleCodeSnippet,
  language: 'typescript',
};

export const sampleConfig = {
  model: 'claude-3-5-sonnet',
  maxTokens: 2048,
  temperature: 0.7,
};
