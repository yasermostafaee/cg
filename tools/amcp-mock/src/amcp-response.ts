import type { AmcpResponse } from './types.js';

/**
 * Serialize a typed response to its on-the-wire form per Phase 5 §3.1.
 *
 * Shapes:
 *  - 202 OK, no data:           `<code> <verb>\r\n`
 *  - 201 OK, one data line:     `<code> <verb> OK\r\n<data>\r\n`
 *  - 200 OK, multi-line data:   `<code> <verb> OK\r\n<line>\r\n…\r\n\r\n`
 *  - 4xx/5xx errors:            `<code> ERROR\r\n` (with optional detail line)
 */
export function serializeAmcpResponse(resp: AmcpResponse): string {
  switch (resp.kind) {
    case 'ok':
      return `${String(resp.code)} ${resp.verb}\r\n`;
    case 'ok-line':
      return `${String(resp.code)} ${resp.verb} OK\r\n${resp.data}\r\n`;
    case 'ok-multi': {
      const body = resp.lines.map((l) => `${l}\r\n`).join('');
      return `${String(resp.code)} ${resp.verb} OK\r\n${body}\r\n`;
    }
    case 'err': {
      const tail = resp.detail ? `\r\n${resp.detail}` : '';
      return `${String(resp.code)} ERROR${tail}\r\n`;
    }
  }
}
