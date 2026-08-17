import * as http from 'node:http';
import type * as net from 'node:net';
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

/**
 * fix-setconfig-serve-restart — how long `stop()` lets IN-FLIGHT responses
 * flush before force-destroying them. Active loopback/LAN responses complete
 * in milliseconds; the deadline only bites stalled clients, keeping teardown
 * bounded (the B-064 requirement) without severing legitimate fetches.
 */
const STOP_GRACE_MS = 500;

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
  return '192.168.21.93';
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
  /**
   * Every live client socket (fix-setconfig-serve-restart): CasparCG's CEF
   * holds keep-alive / preconnect / mid-request sockets that `server.close()`
   * waits on (Node-version-dependent reaping — Node <19 never reaps them).
   * `stop()` force-destroys the request-less ones immediately and bounds the
   * rest so teardown is BOUNDED on every Node/CEF combination; an unbounded
   * stop wedged R-010's setConfig live.
   */
  readonly #sockets = new Set<net.Socket>();
  /**
   * Sockets with an IN-FLIGHT request/response. These get a short bounded
   * grace in `stop()` instead of an instant destroy: severing an active
   * template fetch mid-response makes the fetching CEF (and the amcp-mock's
   * faithful model of it) settle the page FAILED — which silently killed the
   * on-air orphan the reconnect-reconciliation fixtures assert (the CI-only
   * :133/:243 failures; the window is contention-scaled and effectively
   * unreachable on a fast idle machine). The wedge-makers (idle keep-alive,
   * preconnect, never-completed request headers) are by definition NOT in
   * this set and still die instantly — B-064's bound holds.
   */
  readonly #busy = new Set<net.Socket>();

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
    server.on('connection', (socket) => {
      this.#sockets.add(socket);
      socket.on('close', () => {
        this.#sockets.delete(socket);
        this.#busy.delete(socket);
      });
    });
    server.on('request', (req, res) => {
      const socket = req.socket;
      this.#busy.add(socket);
      // 'close' fires on both finish and abort — the response is over either way.
      res.on('close', () => {
        this.#busy.delete(socket);
        // Mid-teardown, a keep-alive socket whose response just completed
        // would otherwise idle until the grace deadline (the destroy passes
        // already ran) — reap it so stop() resolves as soon as the flush is
        // over. destroySoon (never destroy): 'close' fires when the response
        // is handed to the socket, and a hard destroy discards bytes still
        // queued for the client.
        if (this.#server === null) socket.destroySoon();
      });
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
    // The grace deadline arms FIRST so the whole teardown is bounded from the
    // moment stop() is entered: a stalled client is force-destroyed at
    // STOP_GRACE_MS no matter what the passes below decide.
    const deadline = setTimeout(() => {
      (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      for (const socket of this.#sockets) socket.destroy();
    }, STOP_GRACE_MS);
    deadline.unref?.();
    // Teardown begins ONE FULL EVENT-LOOP ITERATION later (double
    // setImmediate spans the next poll phase): a fetch whose request bytes
    // have ARRIVED but are not yet parsed ('request' not fired → not in
    // #busy) is indistinguishable from an idle socket until the loop polls —
    // and `server.close()` itself destroys idle keep-alive connections since
    // Node 19, RST-ing the unread request (the CI-only ECONNRESET that
    // settled the fetching CEF's page FAILED and silently killed the
    // reconnect fixtures' on-air orphan: the :133/:243 + setconfig :187
    // failures). After the poll, an arrived request has joined #busy and
    // flushes within the grace; `listening` is already false so no new URLs
    // are handed out during the deferral.
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        setImmediate(resolve);
      });
    });
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    // Bounded teardown (fix-setconfig-serve-restart): `close()` alone waits
    // for held client connections — Node <19 never reaps even idle ones, and
    // that wedge is what broke R-010's setConfig live. Destroy the
    // REQUEST-LESS sockets (idle keep-alive, preconnect, never-completed
    // request headers — the actual wedge-makers) immediately; IN-FLIGHT
    // responses flush within the grace (severing an active template fetch
    // has a real on-air consequence — the amcp-mock models CEF settling the
    // page FAILED). Active loopback/LAN responses flush in milliseconds;
    // only a stalled client rides the deadline.
    (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
    for (const socket of this.#sockets) {
      if (!this.#busy.has(socket)) socket.destroy();
    }
    await closed;
    clearTimeout(deadline);
    this.#sockets.clear();
    this.#busy.clear();
  }
}
