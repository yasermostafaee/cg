import * as net from 'node:net';
import { parseAmcpLine } from './amcp-parser.js';
import { serializeAmcpResponse } from './amcp-response.js';
import type { AmcpConnection, AmcpHandler, HandlerContext } from './types.js';

/**
 * `CENTRAL-BRIDGE-01` — one connection's lifecycle objects (`AmcpConnection`), released together
 * when the socket goes, however it goes.
 */
class Connection implements AmcpConnection {
  private readonly bound = new Map<string, () => void>();

  constructor(readonly remoteAddress: string) {}

  bindLifecycle(key: string, release: () => void): void {
    this.bound.get(key)?.();
    this.bound.set(key, release);
  }

  unbindLifecycle(key: string): boolean {
    const release = this.bound.get(key);
    if (release === undefined) return false;
    this.bound.delete(key);
    release();
    return true;
  }

  releaseAll(): void {
    const all = [...this.bound.values()];
    this.bound.clear();
    for (const release of all) release();
  }
}

/**
 * Owns the AMCP TCP listener. Per Phase 5 §3.1, framing is `\r\n`-terminated
 * UTF-8 lines, one command per line. Inbound bytes are accumulated per
 * connection and split on CRLF; LF-only lines are tolerated for paste-
 * friendliness in dev.
 */
export class AmcpServer {
  private server: net.Server | null = null;
  private readonly sockets = new Map<net.Socket, Connection>();
  /** `DESKTOP-APPS-01-B` — who may connect; `null` admits everyone. */
  private admit: ((sourceAddress: string) => boolean) | null = null;
  private refused = 0;
  /** `CENTRAL-BRIDGE-01` — where the listener was, so a restarted core listens there again. */
  private listening: { host: string; port: number } | null = null;

  constructor(
    private readonly handlers: Map<string, AmcpHandler>,
    private readonly ctx: HandlerContext,
    private readonly onTrace?: (entry: TraceEntry) => void,
    /** `ROUTE-PLATES-01` — every received line, before it is parsed (the command log). */
    private readonly onReceive?: (line: string) => void,
    /**
     * `CENTRAL-BRIDGE-01` — called for every admitted connection before its first line is read:
     * where the core's default per-client OSC subscription is bound to it.
     */
    private readonly onConnect?: (conn: AmcpConnection) => void,
  ) {}

  setAdmission(admit: ((sourceAddress: string) => boolean) | null): void {
    this.admit = admit;
  }

  /** Connections the admission rule refused. */
  get refusedCount(): number {
    return this.refused;
  }

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
        this.listening = { host, port: addr.port };
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
    for (const [sock, conn] of this.sockets) {
      sock.destroy();
      // Released here as well as on `close`: a restarted core has no subscriber left by the time
      // it listens again, whatever order the socket events arrive in.
      conn.releaseAll();
    }
    this.sockets.clear();
  }

  /**
   * `CENTRAL-BRIDGE-01` — a core going DOWN: stop listening (a connect is then refused, as a core
   * that is not up refuses one) and drop every connection. {@link resume} listens again.
   */
  async suspend(): Promise<void> {
    await this.closeListener();
  }

  /** `CENTRAL-BRIDGE-01` — the core is up again: listen on the host and port it had. */
  async resume(): Promise<void> {
    const at = this.listening;
    if (at === null || this.server !== null) return;
    await this.start(at.host, at.port);
  }

  async stop(): Promise<void> {
    await this.closeListener();
  }

  private async closeListener(): Promise<void> {
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
    // An IPv4 peer on a dual-stack socket reads `::ffff:a.b.c.d`; the rule is written in a.b.c.d.
    const source = (sock.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (this.admit !== null && !this.admit(source)) {
      this.refused += 1;
      sock.resetAndDestroy();
      return;
    }
    const conn = new Connection(source);
    this.sockets.set(sock, conn);
    this.onConnect?.(conn);
    sock.setEncoding('utf-8');

    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk;
      // Process every complete line (CRLF or bare LF).
      let idx = findLineEnd(buf);
      while (idx !== null) {
        const line = buf.slice(0, idx.start);
        buf = buf.slice(idx.end);
        void this.dispatch(sock, conn, line);
        idx = findLineEnd(buf);
      }
    });

    const gone = (): void => {
      this.sockets.delete(sock);
      conn.releaseAll();
    };
    sock.on('close', gone);
    sock.on('error', gone);
  }

  private async dispatch(sock: net.Socket, conn: Connection, line: string): Promise<void> {
    if (line.length === 0) return;
    if (this.onTrace) this.onTrace({ dir: 'recv', line });
    this.onReceive?.(line);

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
      const resp = await handler(req, this.ctx, conn);
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
