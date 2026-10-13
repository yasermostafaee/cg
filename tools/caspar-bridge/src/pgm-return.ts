import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import net from 'node:net';
import type { PgmReturnState, PgmReturnStatus } from '@cg/shared-ipc';

/**
 * 🔴 `C-016` / `PGM-RETURN-01` — **THE PROGRAMME RETURN: the Playout's `pgm` feed, read by ONE
 * well-behaved client per channel and relayed to the console on its own origin.**
 *
 * The feed is specified by the Playout team in
 * `docs/integration/playout/PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md`, from their core's source and
 * measured on build 2.8.54; that document outranks anything here. In one paragraph: programme
 * channel _n_ is served on `9250 + n − 1` as HTTP/1.0 `multipart/x-mixed-replace;
 * boundary=apasaipgm`, one baseline JPEG per part with an exact `Content-Length`, ~25 fps of
 * 640×360 on a 50 Hz channel, until the connection closes (a core restart closes it).
 *
 * ── 🔴 THE CONSTRAINT THAT SHAPES THIS WHOLE FILE ───────────────────────────
 *
 * That HTTP server runs **inside the playout core's process** and is **not hardened**: no limit
 * on request size, connection count or idle time — and an unexpected error on its network thread
 * **stops the whole core, every channel off air**. A WELL-BEHAVED reader is safe. So this client
 * is exactly that, and each rule below is a property a test pins:
 *
 *   1. ONE well-formed request — `GET / HTTP/1.1\r\nHost: <host>\r\n\r\n` — and NOTHING written
 *      after it, ever (raw `net`, so no agent, no keep-alive, no second request can happen);
 *   2. parts read by `Content-Length`, never by scanning for the boundary;
 *   3. the socket closed when nobody watches — and no idle or silent connection kept open;
 *   4. reconnects with INCREASING backoff, never a tight loop;
 *   5. at most ONE upstream connection per channel from this bridge.
 *
 * ── 🔴 THE PREVIEW TRAP ─────────────────────────────────────────────────────
 *
 * `9350 + n − 1` is the same channel's PREVIEW — the operator's source, scrub and live-input
 * check — NOT air. Reading it as programme would show preview content as if it were on air. The
 * Playout team's first answer said otherwise and was corrected. {@link pgmPort} is the ONE place
 * a feed port is computed, and it never produces that range.
 */

// ── The port rule ──────────────────────────────────────────────────────────────

/**
 * 🔴 **THE programme feed port for channel `n` (1-based, the D4 catalogue's `casparChannel`) —
 * the ONLY place the number is written.** Channel 2 → 9251.
 */
export function pgmPort(channel: number): number {
  return 9250 + channel - 1;
}

/**
 * The Playout rewrites its firewall rule for these feeds on every start: TCP `9250–9269` (twenty
 * programme channels), open to the whole LAN. A channel beyond it runs, but its port is closed to
 * the network, so dialling it could only time out.
 */
export const PGM_FIREWALL_CHANNELS = 20;

export function pgmChannelInFirewallRule(channel: number): boolean {
  return Number.isInteger(channel) && channel >= 1 && channel <= PGM_FIREWALL_CHANNELS;
}

// ── The part parser ────────────────────────────────────────────────────────────

/** Hard bounds, so a confused or hostile peer cannot make the bridge buffer without limit. */
export const PGM_PARSE_LIMITS = {
  /** The response head (status line + headers). The real one is ~250 bytes. */
  headBytes: 8 * 1024,
  /** A boundary line plus a part's headers. The real one is ~70 bytes. */
  partHeadBytes: 1024,
  /** One JPEG. A 3840-wide quality-100 frame fits; the default 640×360 is ~13 KB. */
  bodyBytes: 16 * 1024 * 1024,
} as const;

export class PgmProtocolError extends Error {
  override readonly name = 'PgmProtocolError';
}

export type PgmParseEvent =
  | { readonly kind: 'head'; readonly status: number; readonly boundary: string }
  | { readonly kind: 'frame'; readonly jpeg: Buffer };

const CRLF = Buffer.from('\r\n', 'latin1');
const HEAD_END = Buffer.from('\r\n\r\n', 'latin1');
const EMPTY = Buffer.alloc(0);

/**
 * The `multipart/x-mixed-replace` reader, as a pure push parser so it is tested without sockets.
 *
 * 🔴 **FRAMING IS BY `Content-Length`.** A JPEG may contain any byte sequence, `--apasaipgm`
 * included; a parser that scanned for the boundary would cut such a frame in two. This one reads
 * a part's head, takes N, and copies exactly N bytes — the body is never searched.
 *
 * Between parts it expects the body's trailing `\r\n` and tolerates further CRLFs before the next
 * `--boundary` line. Anything else throws {@link PgmProtocolError}: the caller closes the
 * connection and reconnects with backoff rather than guessing where the next frame starts.
 */
export class MjpegPartParser {
  #state: 'head' | 'boundary' | 'part-head' | 'body' = 'head';
  #pending: Buffer = EMPTY;
  #boundaryLine = '';
  #body: Buffer | null = null;
  #bodyFilled = 0;

  push(chunk: Buffer): PgmParseEvent[] {
    const out: PgmParseEvent[] = [];
    const data = this.#pending.length === 0 ? chunk : Buffer.concat([this.#pending, chunk]);
    let offset = 0;
    for (;;) {
      if (this.#state === 'body') {
        const body = this.#body as Buffer;
        const take = Math.min(body.length - this.#bodyFilled, data.length - offset);
        data.copy(body, this.#bodyFilled, offset, offset + take);
        this.#bodyFilled += take;
        offset += take;
        if (this.#bodyFilled < body.length) break;
        out.push({ kind: 'frame', jpeg: body });
        this.#body = null;
        this.#state = 'boundary';
        continue;
      }
      if (this.#state === 'head') {
        const end = data.indexOf(HEAD_END, offset);
        if (end === -1) {
          if (data.length - offset > PGM_PARSE_LIMITS.headBytes) {
            throw new PgmProtocolError('the response head is longer than any real one');
          }
          break;
        }
        const head = this.#parseHead(data.toString('latin1', offset, end));
        offset = end + HEAD_END.length;
        out.push(head);
        this.#state = 'boundary';
        continue;
      }
      if (this.#state === 'boundary') {
        // The body's trailing CRLF, and any further blank lines before the boundary.
        while (offset + 1 < data.length && data[offset] === 0x0d && data[offset + 1] === 0x0a) {
          offset += 2;
        }
        const eol = data.indexOf(CRLF, offset);
        if (eol === -1) {
          if (data.length - offset > PGM_PARSE_LIMITS.partHeadBytes) {
            throw new PgmProtocolError('no boundary line where one was due');
          }
          break;
        }
        const line = data.toString('latin1', offset, eol).trimEnd();
        if (line !== this.#boundaryLine) {
          throw new PgmProtocolError(`expected the boundary line, read ${JSON.stringify(line)}`);
        }
        offset = eol + CRLF.length;
        this.#state = 'part-head';
        continue;
      }
      // 'part-head' — header lines, then a blank line. A part with NO header lines (a blank line
      // straight after the boundary) is refused below for want of a Content-Length.
      let headEnd: number;
      let next: number;
      if (data.length - offset >= CRLF.length && data.indexOf(CRLF, offset) === offset) {
        headEnd = offset;
        next = offset + CRLF.length;
      } else {
        headEnd = data.indexOf(HEAD_END, offset);
        next = headEnd + HEAD_END.length;
      }
      if (headEnd === -1) {
        if (data.length - offset > PGM_PARSE_LIMITS.partHeadBytes) {
          throw new PgmProtocolError('a part head is longer than any real one');
        }
        break;
      }
      const length = this.#parsePartHead(data.toString('latin1', offset, headEnd));
      offset = next;
      if (length === 0) {
        this.#state = 'boundary';
        continue;
      }
      this.#body = Buffer.allocUnsafe(length);
      this.#bodyFilled = 0;
      this.#state = 'body';
    }
    this.#pending = offset >= data.length ? EMPTY : Buffer.from(data.subarray(offset));
    return out;
  }

  #parseHead(head: string): PgmParseEvent {
    const [statusLine = '', ...lines] = head.split('\r\n');
    const status = /^HTTP\/1\.[01] (\d{3})\b/.exec(statusLine);
    if (status === null) {
      throw new PgmProtocolError(`not an HTTP response: ${JSON.stringify(statusLine)}`);
    }
    const code = Number(status[1]);
    if (code !== 200) throw new PgmProtocolError(`the feed answered status ${String(code)}`);
    const contentType = headerValue(lines, 'content-type') ?? '';
    const boundary = /^multipart\/x-mixed-replace\s*;.*\bboundary=("?)([^";\s]+)\1/i.exec(
      contentType,
    );
    if (boundary?.[2] === undefined) {
      throw new PgmProtocolError(`not a multipart feed: ${JSON.stringify(contentType)}`);
    }
    this.#boundaryLine = `--${boundary[2]}`;
    return { kind: 'head', status: code, boundary: boundary[2] };
  }

  #parsePartHead(head: string): number {
    const lines = head.split('\r\n');
    const type = headerValue(lines, 'content-type');
    if (type !== undefined && !/^image\/jpeg\b/i.test(type)) {
      throw new PgmProtocolError(`a part that is not a JPEG: ${JSON.stringify(type)}`);
    }
    const raw = headerValue(lines, 'content-length');
    if (raw === undefined || !/^\d+$/.test(raw)) {
      throw new PgmProtocolError('a part without a usable Content-Length');
    }
    const length = Number(raw);
    if (length > PGM_PARSE_LIMITS.bodyBytes) {
      throw new PgmProtocolError(`a ${String(length)}-byte part is larger than any real frame`);
    }
    return length;
  }
}

function headerValue(lines: readonly string[], name: string): string | undefined {
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === name) {
      return line.slice(colon + 1).trim();
    }
  }
  return undefined;
}

// ── The relay ──────────────────────────────────────────────────────────────────

/** Where a feed is read from: the address dialled, and the name kept in `Host`. */
export interface PgmTarget {
  readonly address: string;
  readonly hostHeader: string;
}

export interface PgmReturnTuning {
  /** Give up on a TCP connect after this long. */
  readonly connectTimeoutMs: number;
  /** Give up on a connection whose response head has not arrived (the real one: ~20 ms). */
  readonly headTimeoutMs: number;
  /** No frame for this long → `stalled`. 2 s is fifty frames at 25 fps. */
  readonly stallMs: number;
  /** No frame for this long → the connection is closed and redialled: never a silent one. */
  readonly deadMs: number;
  /** Keep a channel's upstream this long after its last viewer leaves. */
  readonly lingerMs: number;
  /** The first reconnect delay; each further failure doubles it … */
  readonly backoffBaseMs: number;
  /** … up to this. */
  readonly backoffMaxMs: number;
  /** A connection that has delivered frames this long resets the backoff. */
  readonly healthyAfterMs: number;
  /** How often a connection's frame age is checked against the two bounds above. */
  readonly checkEveryMs: number;
}

export const DEFAULT_PGM_RETURN_TUNING: PgmReturnTuning = {
  connectTimeoutMs: 3000,
  headTimeoutMs: 3000,
  stallMs: 2000,
  deadMs: 8000,
  lingerMs: 1500,
  backoffBaseMs: 1000,
  backoffMaxMs: 10_000,
  healthyAfterMs: 5000,
  checkEveryMs: 200,
};

/** A viewer holding more than this unsent skips frames until it drains: newest wins, as upstream. */
export const MAX_VIEWER_BUFFERED_BYTES = 512 * 1024;

/** One console holding a channel's picture open. */
export interface PgmViewer {
  send(jpeg: Buffer): void;
  close(): void;
}

export interface PgmReturnRelayOptions {
  /** The Playout's host, resolved at each connect; `null` when it has no address to dial. */
  readonly resolveTarget: () => Promise<PgmTarget | null>;
  /** TEST-ONLY — the feed port for a channel. Absent = {@link pgmPort}, the product's rule. */
  readonly portFor?: (channel: number) => number;
  /** TEST-ONLY — the bounds, so a suite need not wait seconds for a stall. */
  readonly tuning?: Partial<PgmReturnTuning>;
  /** Where the relay's lines go. The CLI's stderr by default. */
  readonly log?: (line: string) => void;
}

/**
 * THE HUB: one {@link ChannelFeed} per watched channel, created by the first viewer and removed
 * `lingerMs` after the last one leaves.
 *
 * ⚠ **"Watched" IS "a viewer is attached", and there is no second signal.** A viewer is the
 * console's own HTTP connection to the relay route, which the PROGRAM pane holds open only while
 * it is rendered — and it is not rendered while the monitors are hidden, the boot state. A
 * separate watch/unwatch message would be a second fact that could disagree with the first.
 */
export class PgmReturnRelay {
  readonly #feeds = new Map<number, ChannelFeed>();
  readonly #subscribers = new Set<(status: PgmReturnStatus[]) => void>();
  readonly #resolveTarget: () => Promise<PgmTarget | null>;
  readonly #portFor: (channel: number) => number;
  readonly #tuning: PgmReturnTuning;
  readonly #log: (line: string) => void;
  #disposed = false;

  constructor(options: PgmReturnRelayOptions) {
    this.#resolveTarget = options.resolveTarget;
    this.#portFor = options.portFor ?? pgmPort;
    this.#tuning = { ...DEFAULT_PGM_RETURN_TUNING, ...(options.tuning ?? {}) };
    this.#log =
      options.log ??
      ((line) => {
        process.stderr.write(`[caspar-bridge] ${line}\n`);
      });
  }

  /** Every watched channel's state, in channel order. */
  status(): PgmReturnStatus[] {
    return [...this.#feeds.values()]
      .map((f) => ({ channel: f.channel, state: f.state }))
      .sort((a, b) => a.channel - b.channel);
  }

  /** Called with the whole list whenever any entry changes, appears or goes. */
  subscribe(handler: (status: PgmReturnStatus[]) => void): () => void {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  /** Attach a viewer to a channel; the returned function detaches it (idempotent). */
  attach(channel: number, viewer: PgmViewer): () => void {
    if (this.#disposed) {
      viewer.close();
      return () => undefined;
    }
    let feed = this.#feeds.get(channel);
    if (feed === undefined) {
      feed = new ChannelFeed(channel, {
        resolveTarget: this.#resolveTarget,
        port: this.#portFor(channel),
        tuning: this.#tuning,
        log: this.#log,
        onState: () => this.#publish(),
        onGone: () => {
          this.#feeds.delete(channel);
          this.#publish();
        },
      });
      this.#feeds.set(channel, feed);
      feed.addViewer(viewer);
      this.#publish();
    } else {
      feed.addViewer(viewer);
    }
    const owner = feed;
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      owner.removeViewer(viewer);
    };
  }

  /**
   * Serve `GET /pgm/<channel>` to one console: a `multipart/x-mixed-replace` response that
   * receives each JPEG the upstream delivered, byte for byte, in a part of its own.
   *
   * The boundary is RANDOM per response. The browser's parser SCANS for the boundary (it does not
   * read `Content-Length`), so a fixed one could in principle appear inside a JPEG; 96 random bits
   * cannot. The loopback fence is the console server's, which calls this only for loopback peers.
   */
  serve(req: http.IncomingMessage, res: http.ServerResponse, channel: number): void {
    const boundary = `cgpgm${randomBytes(12).toString('hex')}`;
    res.writeHead(200, {
      'content-type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'cache-control': 'no-cache, no-store, must-revalidate, private',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      connection: 'close',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.socket?.setNoDelay(true);
    const partHead = (length: number): Buffer =>
      Buffer.from(
        `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${String(length)}\r\n\r\n`,
        'latin1',
      );
    const detach = this.attach(channel, {
      send: (jpeg) => {
        if (res.writableEnded || res.destroyed) return;
        // A slow viewer skips frames rather than queueing them — newest wins.
        if (res.writableLength > MAX_VIEWER_BUFFERED_BYTES) return;
        res.write(Buffer.concat([partHead(jpeg.length), jpeg, CRLF]));
      },
      close: () => {
        if (!res.writableEnded) res.end();
      },
    });
    res.on('close', detach);
  }

  /** The Playout's address may have moved (a connection change): redial every live upstream. */
  reconnectAll(): void {
    for (const feed of this.#feeds.values()) feed.redial();
  }

  /** Close every upstream and every viewer. The bridge's `close()` calls this. */
  dispose(): void {
    this.#disposed = true;
    for (const feed of [...this.#feeds.values()]) feed.dispose();
    this.#feeds.clear();
    this.#subscribers.clear();
  }

  #publish(): void {
    const list = this.status();
    for (const handler of [...this.#subscribers]) handler(list);
  }
}

interface ChannelFeedDeps {
  readonly resolveTarget: () => Promise<PgmTarget | null>;
  readonly port: number;
  readonly tuning: PgmReturnTuning;
  readonly log: (line: string) => void;
  readonly onState: () => void;
  readonly onGone: () => void;
}

/**
 * One channel's upstream, its viewers, and its state machine. At most ONE socket exists at any
 * moment: a redial destroys the old socket before the new one is dialled.
 */
class ChannelFeed {
  readonly channel: number;
  state: PgmReturnState;
  readonly #deps: ChannelFeedDeps;
  readonly #viewers = new Set<PgmViewer>();
  #socket: net.Socket | null = null;
  /** Bumped by every dial and every teardown, so a late callback from an old attempt is ignored. */
  #generation = 0;
  #attempts = 0;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #lingerTimer: NodeJS.Timeout | null = null;
  #failureLogged = false;
  #capLogged = false;
  #disposed = false;

  constructor(channel: number, deps: ChannelFeedDeps) {
    this.channel = channel;
    this.#deps = deps;
    this.state = pgmChannelInFirewallRule(channel) ? 'connecting' : 'unavailable';
  }

  addViewer(viewer: PgmViewer): void {
    const first = this.#viewers.size === 0;
    this.#viewers.add(viewer);
    if (this.#lingerTimer !== null) {
      clearTimeout(this.#lingerTimer);
      this.#lingerTimer = null;
    }
    if (!first) return;
    if (this.state === 'unavailable') {
      this.#deps.log(
        `programme return ch ${String(this.channel)}: not read - port ${String(pgmPort(this.channel))} is ` +
          `outside the Playout's firewall rule for programme feeds ` +
          `(ports ${String(pgmPort(1))}-${String(pgmPort(PGM_FIREWALL_CHANNELS))}, channels 1-` +
          `${String(PGM_FIREWALL_CHANNELS)})`,
      );
      return;
    }
    if (this.#socket === null && this.#reconnectTimer === null) {
      this.#deps.log(
        `programme return ch ${String(this.channel)}: a console is watching - reading port ` +
          `${String(this.#deps.port)}`,
      );
      this.#dial();
    }
  }

  removeViewer(viewer: PgmViewer): void {
    if (!this.#viewers.delete(viewer) || this.#viewers.size > 0 || this.#disposed) return;
    this.#lingerTimer = setTimeout(() => {
      this.#lingerTimer = null;
      if (this.#viewers.size > 0) return;
      this.#teardown();
      this.#disposed = true;
      if (this.state !== 'unavailable') {
        this.#deps.log(
          `programme return ch ${String(this.channel)}: released - no console is watching`,
        );
      }
      this.#deps.onGone();
    }, this.#deps.tuning.lingerMs);
  }

  redial(): void {
    if (this.#disposed || this.state === 'unavailable') return;
    this.#teardown();
    this.#attempts = 0;
    this.#dial();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#lingerTimer !== null) clearTimeout(this.#lingerTimer);
    this.#lingerTimer = null;
    this.#teardown();
    for (const viewer of [...this.#viewers]) viewer.close();
    this.#viewers.clear();
  }

  #setState(next: PgmReturnState): void {
    if (this.state === next) return;
    this.state = next;
    this.#deps.onState();
  }

  /** Destroy the socket and every timer of the current attempt. */
  #teardown(): void {
    this.#generation++;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    const socket = this.#socket;
    this.#socket = null;
    socket?.destroy();
  }

  #dial(): void {
    const generation = ++this.#generation;
    this.#setState('connecting');
    void this.#deps.resolveTarget().then(
      (target) => {
        if (generation !== this.#generation || this.#disposed) return;
        if (target === null) {
          this.#fail(generation, 'the Playout host has no address to dial');
          return;
        }
        this.#connect(generation, target);
      },
      (err: unknown) => {
        if (generation !== this.#generation || this.#disposed) return;
        this.#fail(generation, `the Playout host could not be resolved (${describe(err)})`);
      },
    );
  }

  #connect(generation: number, target: PgmTarget): void {
    const { tuning, port } = this.#deps;
    const socket = net.connect({ host: target.address, port });
    this.#socket = socket;
    const parser = new MjpegPartParser();
    let connectedAt = 0;
    let headAt = 0;
    let lastFrameAt = 0;
    let sawFrame = false;
    const started = Date.now();
    // A holder, because `lose` (declared first) and the interval each need the other.
    const timers: { check?: NodeJS.Timeout } = {};
    const lose = (reason: string): void => {
      clearInterval(timers.check);
      if (generation !== this.#generation) return;
      this.#fail(generation, reason);
    };
    const check = setInterval(() => {
      if (generation !== this.#generation) {
        clearInterval(check);
        return;
      }
      const now = Date.now();
      if (connectedAt === 0) {
        if (now - started >= tuning.connectTimeoutMs) lose('no connection within the bound');
        return;
      }
      if (headAt === 0) {
        if (now - connectedAt >= tuning.headTimeoutMs) lose('no response within the bound');
        return;
      }
      const age = now - lastFrameAt;
      // 🔴 No SILENT connection: a feed that has stopped is closed and redialled.
      if (age >= tuning.deadMs) {
        lose(`no frame for ${String(tuning.deadMs)} ms`);
        return;
      }
      if (age >= tuning.stallMs && this.state === 'live') {
        this.#deps.log(
          `programme return ch ${String(this.channel)}: STALLED - no frame for ` +
            `${String(tuning.stallMs)} ms`,
        );
        this.#setState('stalled');
      }
    }, tuning.checkEveryMs);
    check.unref();
    timers.check = check;

    socket.once('connect', () => {
      if (generation !== this.#generation) return;
      connectedAt = Date.now();
      /*
        🔴 THE ONE WRITE this socket ever makes. The server sends nothing until it has read
        `\r\n\r\n`, reads only the first line, and routes any path containing `/audio` to WAV —
        so the path is `/`. Nothing may be written after this line: not a keep-alive, not a
        second request, not a half-close.
      */
      socket.write(`GET / HTTP/1.1\r\nHost: ${target.hostHeader}\r\n\r\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      if (generation !== this.#generation) return;
      let events: PgmParseEvent[];
      try {
        events = parser.push(chunk);
      } catch (err) {
        lose(`the feed broke its framing (${describe(err)})`);
        return;
      }
      for (const event of events) {
        const now = Date.now();
        if (event.kind === 'head') {
          headAt = now;
          // The stall clock starts at the head: a feed that answers and sends nothing stalls.
          lastFrameAt = now;
          continue;
        }
        lastFrameAt = now;
        if (!sawFrame) {
          sawFrame = true;
          this.#deps.log(
            `programme return ch ${String(this.channel)}: live from ${target.address}:${String(port)}`,
          );
        } else if (this.state === 'stalled') {
          this.#deps.log(`programme return ch ${String(this.channel)}: frames resumed`);
        }
        this.#failureLogged = false;
        this.#capLogged = false;
        if (this.#attempts > 0 && now - connectedAt >= tuning.healthyAfterMs) this.#attempts = 0;
        this.#setState('live');
        for (const viewer of [...this.#viewers]) viewer.send(event.jpeg);
      }
    });
    socket.on('error', (err) => lose(describe(err)));
    socket.on('close', () => lose('the Playout closed the connection'));
  }

  #fail(generation: number, reason: string): void {
    if (generation !== this.#generation) return;
    this.#teardown();
    if (this.#disposed) return;
    const { tuning } = this.#deps;
    const delay = Math.min(tuning.backoffBaseMs * 2 ** this.#attempts, tuning.backoffMaxMs);
    this.#attempts++;
    if (!this.#failureLogged) {
      this.#failureLogged = true;
      this.#deps.log(
        `programme return ch ${String(this.channel)}: no feed (${reason}) - retrying with ` +
          `increasing backoff, from ${String(delay)} ms`,
      );
    } else if (delay >= tuning.backoffMaxMs && !this.#capLogged) {
      this.#capLogged = true;
      this.#deps.log(
        `programme return ch ${String(this.channel)}: still no feed (${reason}) - retrying every ` +
          `${String(tuning.backoffMaxMs)} ms while a console watches`,
      );
    }
    this.#setState('connecting');
    const next = this.#generation;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (next !== this.#generation || this.#disposed) return;
      this.#dial();
    }, delay);
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== undefined ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}
