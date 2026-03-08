import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import * as path from 'path';

describe('E2E CLI Test', () => {
  it('should display help when called with --help', () => {
    const result = spawnSync('bun', ['src/index.ts', '--help'], {
      encoding: 'utf-8',
      cwd: process.cwd()
    });
    
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--prompt');
    expect(result.stdout).toContain('--tui');
  });
  
  it('should handle missing API key gracefully', () => {
    // Clear API keys from environment
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.OPENAI_API_KEY;
    
    const result = spawnSync('bun', ['src/index.ts', '--prompt', 'hello'], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      env
    });
    
    // Should exit with error when API keys missing
    expect(result.status).not.toBe(0);
  });
});
