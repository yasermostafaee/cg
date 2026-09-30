import type http from 'node:http';
import net from 'node:net';
import {
  DEFAULT_PGM_RETURN_TUNING,
  pgmChannelInFirewallRule,
  pgmPort,
  PGM_PARSE_LIMITS,
  type PgmReturnTuning,
  type PgmTarget,
} from './pgm-return.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME'S SOUND: the core's `GET /audio.wav`, read by ONE
 * well-behaved client per channel and relayed to the console by CG Bridge, beside the picture.**
 *
 * The Playout's own client reads the same stream (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §2.1): the core
 * serves it on the programme channel's picture port (`9250 + n − 1`, {@link pgmPort}), as HTTP/1.0 with no
 * length — a 44-byte WAV header, then raw PCM s16le, 2 channels, 48 kHz, one field's worth a chunk, until the
 * connection closes. The console never talks to CasparCG (`CENTRAL-BRIDGE-01`'s hard stop), so, like the
 * picture, it reaches the sound through a ticketed route on CG Bridge's control port.
 *
 * The server inside the core is NOT hardened (`PGM-FEED-AS-USED.md`), so every rule the picture relay keeps
 * holds here, and a test pins each:
 *
 *   1. ONE well-formed request — `GET /audio.wav HTTP/1.1\r\nHost: <host>\r\n\r\n` — and nothing written after it;
 *   2. ONE upstream per channel, shared by every listener, closed `lingerMs` after the last one leaves;
 *   3. no silent connection: nothing for `deadMs` → closed and redialled, with INCREASING backoff;
 *   4. every listener gets the 44-byte header first and then WHOLE 4-byte frames (a stereo s16 sample
 *      pair is never split across two writes), so the console can decode each chunk as it lands;
 *   5. a slow listener SKIPS chunks rather than queueing them — the newest sound wins, as in the core.
 */

/** The WAV header the core sends first (their §2.1). */
export const WAV_HEADER_BYTES = 44;

/** One s16le stereo sample frame. */
export const PCM_FRAME_BYTES = 4;

/**
 * A listener holding more than this unsent skips chunks until it drains: ~0.33 s of 48 kHz stereo s16 — the
 * core itself keeps at most 64 chunks (≈ 1.28 s) and drops the oldest.
 */
export const MAX_LISTENER_BUFFERED_BYTES = 64 * 1024;

/** One console holding a channel's sound open. */
interface PgmAudioListener {
  /** The WAV header, once, before anything else. */
  header(bytes: Buffer): void;
  /** Whole frames of PCM. */
  pcm(bytes: Buffer): void;
  close(): void;
}

export interface PgmAudioRelayOptions {
  /** The Playout's host, resolved at each connect (the picture relay's resolver). */
  readonly resolveTarget: () => Promise<PgmTarget | null>;
  /** TEST-ONLY — the feed port for a channel. Absent = {@link pgmPort}, the product's rule. */
  readonly portFor?: (channel: number) => number;
  /** TEST-ONLY — the bounds. */
  readonly tuning?: Partial<PgmReturnTuning>;
  readonly log?: (line: string) => void;
}

/** THE HUB: one {@link ChannelAudio} per channel somebody listens to. */
export class PgmAudioRelay {
  readonly #feeds = new Map<number, ChannelAudio>();
  readonly #resolveTarget: () => Promise<PgmTarget | null>;
  readonly #portFor: (channel: number) => number;
  readonly #tuning: PgmReturnTuning;
  readonly #log: (line: string) => void;
  #disposed = false;

  constructor(options: PgmAudioRelayOptions) {
    this.#resolveTarget = options.resolveTarget;
    this.#portFor = options.portFor ?? pgmPort;
    this.#tuning = { ...DEFAULT_PGM_RETURN_TUNING, ...(options.tuning ?? {}) };
    this.#log =
      options.log ??
      ((line) => {
        process.stderr.write(`[caspar-bridge] ${line}\n`);
      });
  }

  /** How many upstream sockets exist now — a test's instrument for rule 2. */
  get upstreams(): number {
    let n = 0;
    for (const f of this.#feeds.values()) if (f.connected) n++;
    return n;
  }

  /**
   * Serve `GET /pgm/<channel>/sound` to one console: no length, the core's WAV header and then the live
   * PCM, until the console closes it. `TCP_NODELAY`, as the core sends. Typed `application/octet-stream`,
   * never `audio/wav`: a download manager's browser hook captures `.wav` + `audio/wav` and answers the page
   * an empty `204` (`pgmAudioPath`).
   */
  serve(req: http.IncomingMessage, res: http.ServerResponse, channel: number): void {
    if (this.#disposed || !pgmChannelInFirewallRule(channel)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('no programme sound for this channel');
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
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
    let feed = this.#feeds.get(channel);
    if (feed === undefined) {
      feed = new ChannelAudio(channel, {
        resolveTarget: this.#resolveTarget,
        port: this.#portFor(channel),
        tuning: this.#tuning,
        log: this.#log,
        onGone: () => {
          this.#feeds.delete(channel);
        },
      });
      this.#feeds.set(channel, feed);
    }
    /*
      The header ONCE per console: a redial reads the core's header again, and a second copy in the
      middle of a console's stream would be decoded as 44 bytes of sound — a click on every reconnect.
      The core's format does not change (s16le, 2 channels, 48 kHz), so the first header stands.
    */
    let headerSent = false;
    const listener: PgmAudioListener = {
      header: (bytes) => {
        if (headerSent || res.writableEnded || res.destroyed) return;
        headerSent = true;
        res.write(bytes);
      },
      pcm: (bytes) => {
        if (!headerSent || res.writableEnded || res.destroyed) return;
        if (res.writableLength > MAX_LISTENER_BUFFERED_BYTES) return;
        res.write(bytes);
      },
      close: () => {
        if (!res.writableEnded) res.end();
      },
    };
    feed.add(listener);
    const owner = feed;
    res.on('close', () => {
      owner.remove(listener);
    });
  }

  /** The Playout's address may have moved: redial every live upstream. */
  reconnectAll(): void {
    for (const feed of this.#feeds.values()) feed.redial();
  }

  dispose(): void {
    this.#disposed = true;
    for (const feed of [...this.#feeds.values()]) feed.dispose();
    this.#feeds.clear();
  }
}

interface ChannelAudioDeps {
  readonly resolveTarget: () => Promise<PgmTarget | null>;
  readonly port: number;
  readonly tuning: PgmReturnTuning;
  readonly log: (line: string) => void;
  readonly onGone: () => void;
}

const HEAD_END = Buffer.from('\r\n\r\n', 'latin1');

/** One channel's upstream and its listeners. At most ONE socket at any moment. */
class ChannelAudio {
  readonly channel: number;
  readonly #deps: ChannelAudioDeps;
  readonly #listeners = new Set<PgmAudioListener>();
  #socket: net.Socket | null = null;
  #generation = 0;
  #attempts = 0;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #lingerTimer: NodeJS.Timeout | null = null;
  /** The current connection's WAV header, once read. */
  #header: Buffer | null = null;
  #failureLogged = false;
  #disposed = false;

  constructor(channel: number, deps: ChannelAudioDeps) {
    this.channel = channel;
    this.#deps = deps;
  }

  get connected(): boolean {
    return this.#socket !== null;
  }

  add(listener: PgmAudioListener): void {
    this.#listeners.add(listener);
    if (this.#lingerTimer !== null) {
      clearTimeout(this.#lingerTimer);
      this.#lingerTimer = null;
    }
    if (this.#header !== null) listener.header(this.#header);
    if (this.#socket === null && this.#reconnectTimer === null) {
      this.#deps.log(
        `programme sound ch ${String(this.channel)}: a console is listening - reading port ${String(this.#deps.port)}`,
      );
      this.#dial();
    }
  }

  remove(listener: PgmAudioListener): void {
    if (!this.#listeners.delete(listener) || this.#listeners.size > 0 || this.#disposed) return;
    this.#lingerTimer = setTimeout(() => {
      this.#lingerTimer = null;
      if (this.#listeners.size > 0) return;
      this.#teardown();
      this.#disposed = true;
      this.#deps.log(
        `programme sound ch ${String(this.channel)}: released - no console is listening`,
      );
      this.#deps.onGone();
    }, this.#deps.tuning.lingerMs);
  }

  redial(): void {
    if (this.#disposed) return;
    this.#teardown();
    this.#attempts = 0;
    this.#dial();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#lingerTimer !== null) clearTimeout(this.#lingerTimer);
    this.#lingerTimer = null;
    this.#teardown();
    for (const l of [...this.#listeners]) l.close();
    this.#listeners.clear();
  }

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
    void this.#deps.resolveTarget().then(
      (target) => {
        if (generation !== this.#generation || this.#disposed) return;
        if (target === null) {
          this.#fail(generation, 'the Playout host has no address to dial');
          return;
        }
        this.#connect(generation, target);
      },
      () => {
        if (generation !== this.#generation || this.#disposed) return;
        this.#fail(generation, 'the Playout host could not be resolved');
      },
    );
  }

  #connect(generation: number, target: PgmTarget): void {
    const { tuning, port } = this.#deps;
    const socket = net.connect({ host: target.address, port });
    socket.setNoDelay(true);
    this.#socket = socket;
    this.#header = null;
    let head: Buffer | null = Buffer.alloc(0);
    let headerBytes: Buffer = Buffer.alloc(0);
    let carry: Buffer = Buffer.alloc(0);
    let lastDataAt = 0;
    let connectedAt = 0;
    const started = Date.now();
    const lose = (reason: string): void => {
      clearInterval(check);
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
      // 🔴 No SILENT connection: a stream that has stopped is closed and redialled.
      if (now - (lastDataAt || connectedAt) >= tuning.deadMs) {
        lose(`no sound for ${String(tuning.deadMs)} ms`);
      }
    }, tuning.checkEveryMs);
    check.unref();

    socket.once('connect', () => {
      if (generation !== this.#generation) return;
      connectedAt = Date.now();
      // 🔴 THE ONE WRITE this socket ever makes (rule 1).
      socket.write(`GET /audio.wav HTTP/1.1\r\nHost: ${target.hostHeader}\r\n\r\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      if (generation !== this.#generation) return;
      lastDataAt = Date.now();
      let body = chunk;
      if (head !== null) {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf(HEAD_END);
        if (end < 0) {
          if (head.length > PGM_PARSE_LIMITS.headBytes) lose('the response head is too long');
          return;
        }
        const status = /^HTTP\/1\.[01] (\d{3})/.exec(head.subarray(0, end).toString('latin1'));
        if (status === null || status[1] !== '200') {
          lose(`the core answered ${status?.[1] ?? 'something that is not HTTP'}`);
          return;
        }
        body = head.subarray(end + HEAD_END.length);
        head = null;
      }
      if (this.#header === null) {
        headerBytes = Buffer.concat([headerBytes, body]);
        if (headerBytes.length < WAV_HEADER_BYTES) return;
        this.#header = headerBytes.subarray(0, WAV_HEADER_BYTES);
        body = headerBytes.subarray(WAV_HEADER_BYTES);
        if (this.#attempts > 0 || this.#failureLogged) {
          this.#deps.log(`programme sound ch ${String(this.channel)}: live again`);
        }
        this.#failureLogged = false;
        for (const l of [...this.#listeners]) l.header(this.#header);
      }
      // Whole 4-byte frames only (rule 4): a remainder waits for the next chunk.
      const all = carry.length === 0 ? body : Buffer.concat([carry, body]);
      const whole = all.length - (all.length % PCM_FRAME_BYTES);
      carry = all.subarray(whole);
      if (whole === 0) return;
      if (this.#attempts > 0 && Date.now() - connectedAt >= tuning.healthyAfterMs)
        this.#attempts = 0;
      const pcm = all.subarray(0, whole);
      for (const l of [...this.#listeners]) l.pcm(pcm);
    });
    socket.on('error', (err) => {
      lose(err.message);
    });
    socket.on('close', () => {
      lose('the core closed the connection');
    });
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
        `programme sound ch ${String(this.channel)}: no stream (${reason}) - retrying with increasing ` +
          `backoff, from ${String(delay)} ms`,
      );
    }
    const next = this.#generation;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (next !== this.#generation || this.#disposed) return;
      this.#dial();
    }, delay);
  }
}
