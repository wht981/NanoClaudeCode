/**
 * Tests for WebTool
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { WebTool } from './web';

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe('WebTool', () => {
  let tool: WebTool;
  let dnsLookupMock: ReturnType<typeof mock>;

  beforeEach(() => {
    dnsLookupMock = mock(async (hostname: string, options?: { all?: boolean }) => {
      const addressMap: Record<string, string[]> = {
        'dns-private.test': ['10.0.0.7'],
        'dns-mixed.test': ['93.184.216.34', '192.168.1.10'],
        'dns-ipv6-private.test': ['fc00::1'],
      };

      const selected = addressMap[hostname] ?? ['93.184.216.34'];
      if (options?.all) {
        return selected.map((address) => ({
          address,
          family: address.includes(':') ? 6 : 4,
        }));
      }

      const firstAddress = selected[0] ?? '93.184.216.34';
      return {
        address: firstAddress,
        family: firstAddress.includes(':') ? 6 : 4,
      };
    });

    tool = new WebTool(5000, dnsLookupMock as any); // 5 second timeout for tests
    // Reset fetch mock
    globalThis.fetch = originalFetch;
  });

  describe('fetch operation', () => {
    test('fetches content successfully', async () => {
      const mockContent = '<html><body>Test content</body></html>';
      const mockResponse = new Response(mockContent, {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
      });

      globalThis.fetch = mock(() => Promise.resolve(mockResponse));

      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockContent);
      expect(result.metadata?.url).toBe('https://example.com');
      expect(result.metadata?.contentType).toBe('text/html');
    });

    test('handles HTTP errors', async () => {
      const mockResponse = new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });

      globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as any;

      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com/notfound',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
      expect(result.metadata?.statusCode).toBe(404);
    });

    test('handles network errors', async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    test('handles timeout', async () => {
      globalThis.fetch = mock(async (_url, options) => {
        const signal = (options as any)?.signal;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(new Response('OK')), 10000);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('AbortError'));
            });
          }
        });
      }) as any;

      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com',
        timeout: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    test('ssrf blocks direct private IP targets', async () => {
      const privateUrls = [
        'http://localhost/api',
        'http://127.0.0.1/api',
        'http://[::1]/api',
        'http://[fc00::1]/api',
        'http://[fe80::1]/api',
        'http://[::ffff:10.0.0.1]/api',
        'http://10.0.0.1/api',
        'http://172.16.0.1/api',
        'http://192.168.1.1/api',
        'http://169.254.1.1/api',
      ];

      for (const url of privateUrls) {
        const result = await tool.execute({
          operation: 'fetch',
          url,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('private/internal');
      }
    });

    test('ssrf blocks DNS rebinding to private IPv4', async () => {
      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://dns-private.test/path',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('private/internal');
    });

    test('ssrf blocks DNS answers containing private and public IPs', async () => {
      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://dns-mixed.test/path',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('private/internal');
    });

    test('ssrf blocks DNS rebinding to private IPv6', async () => {
      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://dns-ipv6-private.test/path',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('private/internal');
    });
  });

  describe('scrape operation', () => {
    test('extracts text from HTML', async () => {
      const mockHtml = `
        <html>
          <head>
            <title>Test Page</title>
            <script>console.log('test');</script>
            <style>body { color: red; }</style>
          </head>
          <body>
            <h1>Hello World</h1>
            <p>This is a test paragraph.</p>
            <div>Some &nbsp; text &amp; entities &lt;tag&gt;</div>
          </body>
        </html>
      `;

      const mockResponse = new Response(mockHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

      globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as any;

      const result = await tool.execute({
        operation: 'scrape',
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.output).not.toContain('<script>');
      expect(result.output).not.toContain('<style>');
      expect(result.output).not.toContain('<h1>');
      expect(result.output).toContain('Hello World');
      expect(result.output).toContain('test paragraph');
      expect(result.output).toContain('& entities <tag>');
      expect(result.metadata?.originalLength).toBeGreaterThan(0);
      expect(result.metadata?.extractedLength).toBeGreaterThan(0);
    });

    test('returns error for non-HTML content', async () => {
      const mockResponse = new Response('{"data": "json"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as any;

      const result = await tool.execute({
        operation: 'scrape',
        url: 'https://example.com/api',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTML content');
    });

    test('normalizes whitespace', async () => {
      const mockHtml = `
        <html>
          <body>
            <p>Text   with    multiple    spaces</p>
            <p>Text
            with
            newlines</p>
          </body>
        </html>
      `;

      const mockResponse = new Response(mockHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

      globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as any;

      const result = await tool.execute({
        operation: 'scrape',
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.output).not.toContain('  '); // No double spaces
      expect(result.output).not.toContain('\n');
    });
  });

  describe('validation', () => {
    test('requires operation parameter', async () => {
      const result = await tool.execute({
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('operation');
    });

    test('requires url parameter', async () => {
      const result = await tool.execute({
        operation: 'fetch',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('url');
    });

    test('validates operation enum', async () => {
      const result = await tool.execute({
        operation: 'invalid',
        url: 'https://example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('operation');
    });

    test('validates timeout range', async () => {
      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com',
        timeout: 500, // Too low
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('custom timeout', () => {
    test('uses custom timeout from constructor', async () => {
      const customTool = new WebTool(15000);
      expect(customTool).toBeDefined();
    });

    test('overrides default timeout with parameter', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      globalThis.fetch = mock(() => Promise.resolve(mockResponse)) as any;

      const result = await tool.execute({
        operation: 'fetch',
        url: 'https://example.com',
        timeout: 2000,
      });

      expect(result.success).toBe(true);
    });
  });
});
