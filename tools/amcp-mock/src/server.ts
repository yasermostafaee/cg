import * as net from 'node:net';
import { parseAmcpLine } from './amcp-parser.js';
import { serializeAmcpResponse } from './amcp-response.js';
import type { AmcpHandler, HandlerContext } from './types.js';

/**
 * Owns the AMCP TCP listener. Per Phase 5 §3.1, framing is `\r\n`-terminated
 * UTF-8 lines, one command per line. Inbound bytes are accumulated per
 * connection and split on CRLF; LF-only lines are tolerated for paste-
 * friendliness in dev.
 */
export class AmcpServer {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();

  constructor(
    private readonly handlers: Map<string, AmcpHandler>,
    private readonly ctx: HandlerContext,
    private readonly onTrace?: (entry: TraceEntry) => void,
  ) {}

  async start(host: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((sock) => {
        this.onConnection(sock);
      });
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        const addr = server.address();
        if (addr === null || typeof addr === 'string') {
          reject(new Error('server.address() returned an unexpected value'));
          return;
        }
        this.server = server;
        resolve(addr.port);
      });
    });
  }

  /** Number of currently-connected clients. */
  get clientCount(): number {
    return this.sockets.size;
  }

  /** Force-close every connection; used by tests to simulate TCP reset. */
  closeAll(): void {
    for (const sock of this.sockets) {
      sock.destroy();
    }
    this.sockets.clear();
  }

  async stop(): Promise<void> {
    this.closeAll();
    const server = this.server;
    if (server === null) return;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private onConnection(sock: net.Socket): void {
    this.sockets.add(sock);
    sock.setEncoding('utf-8');

    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      // Process every complete line (CRLF or bare LF).
      let idx = findLineEnd(buf);
      while (idx !== null) {
        const line = buf.slice(0, idx.start);
        buf = buf.slice(idx.end);
        void this.dispatch(sock, line);
        idx = findLineEnd(buf);
      }
    });

    sock.on('close', () => {
      this.sockets.delete(sock);
    });

    sock.on('error', () => {
      this.sockets.delete(sock);
    });
  }

  private async dispatch(sock: net.Socket, line: string): Promise<void> {
    if (line.length === 0) return;
    if (this.onTrace) this.onTrace({ dir: 'recv', line });

    const req = parseAmcpLine(line);
    if (req === null) {
      this.write(sock, serializeAmcpResponse({ kind: 'err', code: 400, verb: 'ERROR' }));
      return;
    }

    const handler = this.handlers.get(req.verb);
    if (!handler) {
      this.write(sock, serializeAmcpResponse({ kind: 'err', code: 400, verb: req.verb }));
      return;
    }

    try {
      const resp = await handler(req, this.ctx);
      this.write(sock, serializeAmcpResponse(resp));
    } catch {
      this.write(sock, serializeAmcpResponse({ kind: 'err', code: 500, verb: req.verb }));
    }
  }

  private write(sock: net.Socket, payload: string): void {
    if (this.onTrace) this.onTrace({ dir: 'send', line: payload.replace(/\r\n$/, '') });
    if (sock.writable) sock.write(payload);
  }
}

export interface TraceEntry {
  dir: 'send' | 'recv';
  line: string;
}

function findLineEnd(s: string): { start: number; end: number } | null {
  const crlf = s.indexOf('\r\n');
  const lf = s.indexOf('\n');
  if (crlf === -1 && lf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) return { start: crlf, end: crlf + 2 };
  return { start: lf, end: lf + 1 };
}
