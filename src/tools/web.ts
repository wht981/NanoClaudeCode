/**
 * Web access tool
 * Provides fetch and scrape operations for web content
 */
import { BaseTool } from './base';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ToolResult, JSONSchema } from '../types/tool';

interface WebOperation {
  operation: 'fetch' | 'scrape';
  url: string;
  timeout?: number;
}

type DnsLookup = typeof lookup;

/**
 * Simple HTML text extraction
 * Removes script, style tags and extracts visible text
 */
function extractTextFromHTML(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

export class WebTool extends BaseTool {
  private defaultTimeout: number;
  private dnsLookup: DnsLookup;

  constructor(defaultTimeout: number = 30000, dnsLookup: DnsLookup = lookup) {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['fetch', 'scrape'],
          description: 'The web operation to perform: fetch (GET request) or scrape (extract text from HTML)',
        },
        url: {
          type: 'string',
          description: 'The URL to fetch',
          pattern: '^https?://.+',
        },
        timeout: {
          type: 'integer',
          description: 'Request timeout in milliseconds (default: 30000)',
          minimum: 1000,
          maximum: 120000,
        },
      },
      required: ['operation', 'url'],
      additionalProperties: false,
    };

    super(
      'web',
      'Fetch web content and extract text from HTML pages',
      schema
    );

    this.defaultTimeout = defaultTimeout;
    this.dnsLookup = dnsLookup;
  }

  private normalizeAddress(address: string): string {
    const cleaned = (address || '').replace(/^\[|\]$/g, '');
    const parts = cleaned.split('%');
    return (parts[0] || '').toLowerCase();
  }

  private isPrivateIPv4(ip: string): boolean {
    const octets = ip.split('.').map((segment) => Number.parseInt(segment, 10));
    if (octets.length !== 4 || octets.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
      return false;
    }

    if (octets[0] === 127) return true;
    if (octets[0] === 10) return true;
    if (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;

    return false;
  }

  private isPrivateIP(ip: string): boolean {
    const normalized = this.normalizeAddress(ip);
    const ipVersion = isIP(normalized);

    if (ipVersion === 4) {
      return this.isPrivateIPv4(normalized);
    }

    if (ipVersion === 6) {
      if (normalized === '::1') {
        return true;
      }

      const firstHextet = normalized.split(':', 1)[0];
      if (firstHextet && firstHextet.length > 0) {
        const firstHextetValue = Number.parseInt(firstHextet, 16);
        if (!Number.isNaN(firstHextetValue)) {
          if ((firstHextetValue & 0xfe00) === 0xfc00) {
            return true;
          }

          if (firstHextetValue >= 0xfe80 && firstHextetValue <= 0xfebf) {
            return true;
          }
        }
      }

      if (normalized.startsWith('::ffff:')) {
        const mappedIPv4 = normalized.slice('::ffff:'.length);
        if (isIP(mappedIPv4) === 4) {
          if (this.isPrivateIPv4(mappedIPv4)) {
            return true;
          }
        } else {
          const hexGroups = mappedIPv4.split(':');
          if (hexGroups.length === 2) {
            const high = Number.parseInt(hexGroups[0]!, 16);
            const low = Number.parseInt(hexGroups[1]!, 16);
            if (!Number.isNaN(high) && !Number.isNaN(low) && high >= 0 && high <= 0xffff && low >= 0 && low <= 0xffff) {
              const convertedIPv4 = [
                (high >> 8) & 0xff,
                high & 0xff,
                (low >> 8) & 0xff,
                low & 0xff,
              ].join('.');
              if (this.isPrivateIPv4(convertedIPv4)) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  private async isUrlAllowed(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname) {
        return false;
      }
      const hostname = this.normalizeAddress(parsed.hostname);

      if (hostname === 'localhost' || this.isPrivateIP(hostname)) {
        return false;
      }

      if (isIP(hostname) !== 0) {
        return true;
      }

      const addresses = await this.dnsLookup(hostname, { all: true, verbatim: true });
      if (addresses.length === 0) {
        return false;
      }

      return addresses.every((entry) => !this.isPrivateIP(entry.address));
    } catch {
      return false;
    }
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // Validate arguments
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(`Invalid arguments: ${validation.errors?.join(', ')}`);
    }

    const { operation, url, timeout } = args as unknown as WebOperation;
    const effectiveTimeout = timeout ?? this.defaultTimeout;

    // Security check: prevent access to private IPs
    if (!(await this.isUrlAllowed(url))) {
      return this.error('Access to private/internal IPs is not permitted');
    }

    try {
      // Perform fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'NanoClaudeCode/1.0',
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Check for HTTP errors
      if (!response.ok) {
        return this.error(
          `HTTP error ${response.status}: ${response.statusText}`,
          { statusCode: response.status }
        );
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (operation === 'fetch') {
        // Return raw content
        return this.success(text, {
          url,
          contentType,
          contentLength: text.length,
        });
      } else if (operation === 'scrape') {
        // Extract text from HTML
        if (!contentType.includes('html')) {
          return this.error('URL does not return HTML content', { contentType });
        }

        const extractedText = extractTextFromHTML(text);
        return this.success(extractedText, {
          url,
          originalLength: text.length,
          extractedLength: extractedText.length,
        });
      }

      return this.error('Unknown operation');
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('AbortError')) {
          return this.error(`Request timeout after ${effectiveTimeout}ms`);
        }
        return this.error(`Request failed: ${error.message}`);
      }
      return this.error('Request failed with unknown error');
    }
  }
}
