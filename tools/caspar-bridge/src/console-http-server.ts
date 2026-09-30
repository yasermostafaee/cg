import fs from 'node:fs';
import http from 'node:http';
import type net from 'node:net';
import path from 'node:path';
import { PGM_RETURN_PATH_PREFIX } from '@cg/shared-ipc';

/**
 * `DESKTOP-APPS-01` — **A BUILT CONSOLE, SERVED FROM A FOLDER, BESIDE THE BRIDGE** (`--console-dir`).
 *
 * `CENTRAL-BRIDGE-01` — no longer CG Control's: the app bundles its console now and connects to CG
 * Bridge on the Playout machine, and CG Bridge the service starts no console listener. What is left
 * is a convenience for a station run from a checkout — `pnpm dev:station`'s stub page and its own
 * readiness probe (`/__cg/health`, matched by pid), and the e2e specs that serve the built `dist`
 * next to a real bridge. A console served here derives its bridge from the page's host
 * (`bridgeUrlFor`), so a page from `http://127.0.0.1:<port>` finds `ws://127.0.0.1:5280`.
 *
 * ⚠ **NO PROGRAMME RETURN HERE.** It has ONE door, the control port's `/pgm/<n>?ticket=…`, opened by
 * a ticket a console's verified socket was given for that channel (`http-tickets.ts`). This listener
 * relayed it untokened to loopback peers until then — a second door beside the first.
 *
 * 🔴 **ITS OWN LISTENER — NEVER THE TEMPLATE ORIGIN.** ADR 0010 rule 13 makes the template server
 * on 7911 a security boundary whose route set is pinned by `template-server-route-set.test.ts`;
 * a console or a health route appearing there is a defect. The CLI refuses a console port equal
 * to the template or control port rather than letting two servers race for one.
 *
 * Loopback, GET/HEAD only. Four answers, from a table in the template server's own idiom:
 *   - `GET /__cg/health` — the identity a launcher reads to tell ITS bridge from a stranger holding
 *     the port;
 *   - `/pgm/…` — `404`, never the page: the programme return is not here (above), and a door that
 *     is gone answers as one;
 *   - a file under the served directory;
 *   - `index.html` for any other path that names no file extension (the SPA fallback). A path
 *     WITH an extension that names no file is a 404: answering a missing asset with HTML turns a
 *     broken build into a MIME error nobody can read.
 */

/** The console's port when `--console-port` is not given (the dev station passes its own). */
export const CONSOLE_DEFAULT_PORT = 5174;

/** The identity route. Not under `/api`: the console calls no API here, and never will. */
export const CONSOLE_HEALTH_PATH = '/__cg/health';

/** What the health route calls this process — a launcher's test for "this is a bridge". */
export const CONSOLE_HEALTH_APP = 'cg-caspar-bridge';

export interface ConsoleHealth {
  readonly app: typeof CONSOLE_HEALTH_APP;
  readonly pid: number;
  /** The executable running this bridge — which process answered, for the one who started it. */
  readonly execPath: string;
}

export interface ConsoleServeOptions {
  /** The built console — the Runtime's `dist`, with `index.html` at its root. */
  readonly dir: string;
  /** `0` = ephemeral (tests). */
  readonly port: number;
  /** Bind host. Loopback by default and by intent. */
  readonly host?: string;
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
    // `CENTRAL-BRIDGE-01` (D9) — the programme return's one door is the control port's, ticketed.
    if (urlPath.startsWith(PGM_RETURN_PATH_PREFIX)) {
      this.#notFound(res);
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
