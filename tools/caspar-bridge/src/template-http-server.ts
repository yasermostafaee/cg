import * as http from 'node:http';
import * as os from 'node:os';

/** Where/how the template HTTP server binds + the host CasparCG uses to reach it. */
export interface TemplateServeOptions {
  /** Bind interface. Loopback for local CasparCG; `0.0.0.0` to expose (opt-in, remote). */
  bindHost: string;
  /** Bind port. `0` = ephemeral — the `CG ADD` URL carries the actual bound port. */
  port: number;
  /** Host CasparCG uses to reach this machine (the `CG ADD` URL host). */
  serveHost: string;
}

/** Caller overrides for {@link deriveServeOptions} (each falls back to the derived value). */
export interface TemplateServeOverride {
  bindHost?: string;
  port?: number;
  serveHost?: string;
}

/** True for loopback CasparCG hosts → serve loopback, no LAN exposure. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

/**
 * A reachable LAN IPv4 for this machine, so a remote CasparCG can fetch the served
 * template. Falls back to loopback. Mirrors the C-001 probe's `guessLanHost()`.
 */
export function guessLanHost(): string {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

/**
 * Derive serve options from where CasparCG runs (design §6), honoring overrides:
 *
 * - CasparCG **local** (loopback host) → bind + serve on `127.0.0.1` (no LAN
 *   exposure — the common operator case).
 * - CasparCG **remote** → bind a routable interface (`0.0.0.0`, opt-in) and serve
 *   on an explicit `serveHost`, else a guessed LAN IPv4.
 *
 * Port defaults to `0` (ephemeral); the `CG ADD` URL carries the actual bound port.
 */
export function deriveServeOptions(
  casparHost: string,
  override: TemplateServeOverride = {},
): TemplateServeOptions {
  const local = isLoopbackHost(casparHost);
  return {
    bindHost: override.bindHost ?? (local ? '127.0.0.1' : '0.0.0.0'),
    port: override.port ?? 0,
    serveHost: override.serveHost ?? (local ? '127.0.0.1' : guessLanHost()),
  };
}

/**
 * B-038 Phase 3 — serves each retained template's self-contained HTML over HTTP
 * (mirrors `caspar-amcp-probe`'s `ProbeServer`). `GET /template/<id>` → the stored
 * HTML (`200 text/html; charset=utf-8`); an unknown id → `404`.
 *
 * Holds no template state itself: it reads the current HTML from the injected
 * `getHtml` (the bridge's `TemplateRegistry`), so a re-import/remove is reflected
 * with no server change. Separate from the control WebSocket (which stays
 * loopback); this server exposes template HTML only — no control surface.
 */
export class TemplateHttpServer {
  #server: http.Server | null = null;
  #port = 0;
  #serveHost = '127.0.0.1';
  readonly #getHtml: (templateId: string) => string | null;

  constructor(getHtml: (templateId: string) => string | null) {
    this.#getHtml = getHtml;
  }

  /** Start listening. Idempotent — a second call resolves without rebinding. */
  async start(options: TemplateServeOptions): Promise<void> {
    if (this.#server !== null) return;
    this.#serveHost = options.serveHost;
    const server = http.createServer((req, res) => {
      this.#handle(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, options.bindHost, () => {
        server.off('error', reject);
        const addr = server.address();
        this.#port = typeof addr === 'object' && addr !== null ? addr.port : options.port;
        this.#server = server;
        resolve();
      });
    });
  }

  #handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const match = /^\/template\/([^/]+)$/.exec(path);
    if (match !== null) {
      const id = decodeURIComponent(match[1] ?? '');
      const html = this.#getHtml(id);
      if (html !== null) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('template not found');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }

  /** Whether the server is bound and serving. */
  get listening(): boolean {
    return this.#server !== null;
  }
  /** The bound port (0 until started). */
  get port(): number {
    return this.#port;
  }
  /** The host CasparCG reaches this server at (the `CG ADD` URL host). */
  get serveHost(): string {
    return this.#serveHost;
  }

  /** The URL CasparCG should `CG ADD` for template `<id>`. */
  urlFor(templateId: string): string {
    return `http://${this.#serveHost}:${String(this.#port)}/template/${encodeURIComponent(templateId)}`;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    if (server === null) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
