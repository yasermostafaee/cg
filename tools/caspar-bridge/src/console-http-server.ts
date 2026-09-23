import fs from 'node:fs';
import http from 'node:http';
import type net from 'node:net';
import path from 'node:path';
import { PGM_RETURN_PATH_PREFIX } from '@cg/shared-ipc';

/**
 * 🔴 `DESKTOP-APPS-01` — **THE CONSOLE, SERVED BY THE BRIDGE** (ADR 0011).
 *
 * CG Control's desktop window loads the console from HERE rather than from files bundled inside
 * the shell, for the two reasons ADR 0011 records — both of which hold with no console change:
 *
 *   1. the console derives its bridge address from the host that served the page
 *      (`bridgeUrlFor`), so a page from `http://127.0.0.1:5174` finds `ws://127.0.0.1:5280`. A
 *      page served from `tauri.localhost` would derive `ws://tauri.localhost:5280`, which is
 *      nothing;
 *   2. the console's origin is ONE fixed string on every install, `http://127.0.0.1:5174`, so a
 *      client Playout's CORS list needs that one entry and nothing site-specific.
 *
 * 🔴 **ITS OWN LISTENER — NEVER THE TEMPLATE ORIGIN.** ADR 0010 rule 13 makes the template server
 * on 7911 a security boundary whose route set is pinned by `template-server-route-set.test.ts`;
 * a console or a health route appearing there is a defect. The CLI refuses a console port equal
 * to the template or control port rather than letting two servers race for one.
 *
 * Loopback, GET/HEAD only. Four answers, from a table in the template server's own idiom:
 *   - `GET /__cg/health` — the identity the desktop shell reads to tell its own leftover bridge
 *     from a stranger holding the port;
 *   - `GET /pgm/<channel>` — `C-016`'s programme return, relayed by the bridge (`pgm-return.ts`),
 *     to LOOPBACK clients only — refused `403` to any other peer, whatever the bind;
 *   - a file under the served directory;
 *   - `index.html` for any other path that names no file extension (the SPA fallback). A path
 *     WITH an extension that names no file is a 404: answering a missing asset with HTML turns a
 *     broken build into a MIME error nobody can read.
 */

/** The port the desktop shell opens its window on. Fixed, because it IS the console's origin. */
export const CONSOLE_DEFAULT_PORT = 5174;

/** The identity route. Not under `/api`: the console calls no API here, and never will. */
export const CONSOLE_HEALTH_PATH = '/__cg/health';

/** What the health route calls this process — the shell's test for "this is a bridge". */
export const CONSOLE_HEALTH_APP = 'cg-caspar-bridge';

export interface ConsoleHealth {
  readonly app: typeof CONSOLE_HEALTH_APP;
  readonly pid: number;
  /**
   * The executable running this bridge. The desktop shell compares it with its own sidecar
   * before stopping a leftover: a bridge started by hand from a checkout holds the same ports
   * and is not the shell's to kill.
   */
  readonly execPath: string;
}

/** What the console server hands a `/pgm/<channel>` request to — the bridge's relay. */
export interface PgmRelayRoute {
  serve(req: http.IncomingMessage, res: http.ServerResponse, channel: number): void;
}

export interface ConsoleServeOptions {
  /** The built console — the Runtime's `dist`, with `index.html` at its root. */
  readonly dir: string;
  /** `0` = ephemeral (tests). The product always passes {@link CONSOLE_DEFAULT_PORT}. */
  readonly port: number;
  /** Bind host. Loopback by default and by intent: the console's origin is `127.0.0.1`. */
  readonly host?: string;
  /** `C-016` — the programme return relay. Absent: `/pgm/<n>` is a 404. */
  readonly pgmRelay?: PgmRelayRoute;
}

/** `/pgm/<channel>`, a 1-based channel with no leading zero; anything else is not the route. */
const PGM_ROUTE = new RegExp(`^${PGM_RETURN_PATH_PREFIX}([1-9]\\d{0,3})$`);

/**
 * Is this peer on THIS machine? The socket's own address, never a header: IPv4 loopback
 * (`127.0.0.0/8`), IPv6 `::1`, and IPv4 loopback mapped into IPv6.
 */
export function isLoopbackPeer(address: string | undefined): boolean {
  if (address === undefined) return false;
  const bare = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
  return bare === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

/**
 * Resolve a request path to a file INSIDE `root`, or `null`. The containment test is on the
 * resolved path, so `..`, an encoded `%2e%2e` and a Windows `\` all land on the same refusal.
 */
export function resolveConsolePath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, `.${path.sep}${decoded.replace(/^[/\\]+/, '')}`);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export class ConsoleHttpServer {
  #server: http.Server | null = null;
  #port = 0;
  #host = '127.0.0.1';
  #root = '';
  #pgmRelay: PgmRelayRoute | null = null;
  readonly #sockets = new Set<net.Socket>();

  /** Start listening. Throws when the directory holds no console, or the port is taken. */
  async start(options: ConsoleServeOptions): Promise<void> {
    if (this.#server !== null) return;
    const root = path.resolve(options.dir);
    if (!isFile(path.join(root, 'index.html'))) {
      throw new Error(`no console at ${root} (index.html is missing)`);
    }
    this.#root = root;
    this.#host = options.host ?? '127.0.0.1';
    this.#pgmRelay = options.pgmRelay ?? null;
    const server = http.createServer((req, res) => {
      this.#handle(req, res);
    });
    server.on('connection', (socket) => {
      this.#sockets.add(socket);
      socket.on('close', () => this.#sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, this.#host, () => {
        server.off('error', reject);
        const addr = server.address();
        this.#port = typeof addr === 'object' && addr !== null ? addr.port : options.port;
        this.#server = server;
        resolve();
      });
    });
  }

  #handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      res.end('method not allowed');
      return;
    }
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    if (urlPath === CONSOLE_HEALTH_PATH) {
      const health: ConsoleHealth = {
        app: CONSOLE_HEALTH_APP,
        pid: process.pid,
        execPath: process.execPath,
      };
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(method === 'HEAD' ? undefined : JSON.stringify(health));
      return;
    }
    if (urlPath.startsWith(PGM_RETURN_PATH_PREFIX)) {
      this.#pgm(req, res, urlPath);
      return;
    }
    const resolved = resolveConsolePath(this.#root, urlPath);
    if (resolved === null) {
      this.#notFound(res);
      return;
    }
    if (isFile(resolved)) {
      this.#sendFile(res, resolved, method, urlPath.startsWith('/assets/'));
      return;
    }
    // A path naming an extension is an ASSET request; a missing asset is a 404, never the page.
    if (path.extname(urlPath) !== '') {
      this.#notFound(res);
      return;
    }
    this.#sendFile(res, path.join(this.#root, 'index.html'), method, false);
  }

  /**
   * 🔴 `C-016` — the programme return, to THIS machine only. The listener already binds loopback;
   * this is the second fence, and it reads the SOCKET's peer, so no bind, proxy or header can
   * widen it. The feed itself is readable by the whole LAN at the Playout (its own rule, not
   * ours); what this route adds — the relay's single upstream — is not.
   */
  #pgm(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): void {
    if (!isLoopbackPeer(req.socket.remoteAddress)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden');
      return;
    }
    const match = PGM_ROUTE.exec(urlPath);
    if (this.#pgmRelay === null || match?.[1] === undefined) {
      this.#notFound(res);
      return;
    }
    this.#pgmRelay.serve(req, res, Number(match[1]));
  }

  #sendFile(res: http.ServerResponse, file: string, method: string, immutable: boolean): void {
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      // Vite fingerprints everything under /assets/; index.html and public/ files are not.
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  #notFound(res: http.ServerResponse): void {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }

  get port(): number {
    return this.#port;
  }

  get url(): string {
    return `http://${this.#host}:${String(this.#port)}`;
  }

  /** Stop listening and drop every open connection (WebView2 keeps idle sockets alive). */
  async stop(): Promise<void> {
    const server = this.#server;
    if (server === null) return;
    this.#server = null;
    for (const socket of this.#sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
