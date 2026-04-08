/**
 * ✦ Aether — Web Fetch Tool
 * Improved HTML extraction, redirect following, metadata extraction
 */

import { logger } from '../utils/logger.js';

// URL validation
const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'data:', 'javascript:'];
const MAX_REDIRECTS = 5;

class WebFetchTool {
  constructor(config) {
    this.config = config;
  }

  _isUrlSafe(url) {
    try {
      const parsed = new URL(url);
      if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) return false;
      // Block internal/private IPs in sandbox mode
      if (this.config.sandbox) {
        const host = parsed.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
            host.startsWith('192.168.') || host.startsWith('10.') ||
            host.startsWith('172.16.') || host === '::1') {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  _extractText(html) {
    // Remove non-content elements
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Convert block elements to newlines
    text = text
      .replace(/<\/?(h[1-6]|p|div|br|li|tr|blockquote|section|article)[^>]*>/gi, '\n')
      .replace(/<\/?[^>]+>/g, ' ')  // Strip remaining tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s{2,}/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Prepend metadata if available
    let result = '';
    if (title) result += `Title: ${title}\n`;
    if (description) result += `Description: ${description}\n`;
    if (result) result += '\n---\n\n';
    result += text;

    return result;
  }

  async execute(toolName, input) {
    const { url } = input;
    if (!url) return { error: 'No URL provided' };
    if (!this._isUrlSafe(url)) return { error: 'URL blocked: invalid or restricted address' };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Aether/1.0 (Personal AI Assistant)',
          'Accept': 'text/html,application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      let content;

      if (contentType.includes('application/json')) {
        content = JSON.stringify(await response.json(), null, 2);
      } else {
        const text = await response.text();
        content = contentType.includes('text/html') ? this._extractText(text) : text;
      }

      // Truncate if too long
      if (content.length > 50000) {
        content = content.slice(0, 50000) + '\n\n[Content truncated at 50KB]';
      }

      return {
        url: response.url, // final URL after redirects
        contentType,
        length: content.length,
        content,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { error: 'Request timed out (20s)' };
      }
      return { error: `Fetch failed: ${err.message}` };
    }
  }
}

export { WebFetchTool };
export default WebFetchTool;
