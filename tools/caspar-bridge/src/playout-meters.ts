import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import {
  parsePlayoutMeterEvent,
  type PgmMeterReading,
  type PlayoutMeterEvent,
} from '@cg/shared-ipc';
import { pinnedIPv4, plainAgentFor } from './playout-http.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PLAYOUT'S METERS (`GET /api/cg/meters`, `2.9.2`), READ ONCE
 * BY CG BRIDGE WITH ITS OWN SESSION AND RELAYED TO EVERY CONSOLE.**
 *
 * `PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §2.3 names the rules, and each is kept here:
 *
 * - **A stream read as a stream** — `text/event-stream` over one long request, never `EventSource` (it
 *   cannot send `Authorization`) and **never the token in the URL**: the bearer rides the header only, and
 *   no line this reader logs carries it.
 * - **Server-side, no `Origin`, no proxy, over the ONE pinned IPv4** — the same three properties every
 *   Playout-bound request of this bridge keeps (`playout-http.ts`).
 * - **Reconnect when it closes** — an expired token, the engine stopping, an internal error: every one
 *   closes the stream and every one is answered by connecting again, with the bearer read afresh, after an
 *   increasing backoff. A stream that goes silent (not even the 15 s `: ping`) is closed and reconnected.
 * - **Read only while somebody listens** — the first console's subscription opens it; the last one's
 *   departure closes it after a linger, so a bridge nobody watches holds no stream open on the Playout.
 * - **`404` is "not served"** — a Playout before `2.9.2`, or CG Control switched off: asked again rarely,
 *   and the meters simply stay at the floor on every console.
 *
 * The reading is joined to the station by `channelFor` — the ONE join the D10 reader uses (the
 * Playout's `casparHost` and `casparChannel` to one of this station's declared channels) — and a reading
 * for a channel the station does not declare is dropped here.
 */

/** Tuning, in one place. The TEST-ONLY seam shortens it; nothing in the product does. */
export interface PlayoutMetersTuning {
  /** First retry after a close; doubled per consecutive failure. */
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  /** A Playout that does not serve the meters (`404`) is asked again this rarely. */
  readonly notServedRetryMs: number;
  /** No bytes at all (not even a `: ping`, every 15 s) for this long: closed and reconnected. */
  readonly silentMs: number;
  /** The stream stays open this long after the last listener leaves. */
  readonly lingerMs: number;
  /** A connection must open within this. */
  readonly connectTimeoutMs: number;
}

export const DEFAULT_PLAYOUT_METERS_TUNING: PlayoutMetersTuning = {
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
  notServedRetryMs: 60_000,
  silentMs: 35_000,
  lingerMs: 5_000,
  connectTimeoutMs: 5_000,
};

/** The SSE parser's bound: one event larger than this is not the Playout's and ends the stream. */
const MAX_EVENT_BYTES = 64 * 1024;

export interface PlayoutMetersReaderOptions {
  /** `GET /api/cg/meters` at the configured Playout (`playout292Url(…, 'meters')`). */
  readonly url: string;
  /** The bearer — the bridge's own session, checked at use — or `null`: wait, and ask again. */
  readonly bearer: () => string | null;
  /** The Playout's `casparHost` + `casparChannel` → this station's channel, or `null`. */
  readonly channelFor: (casparHost: string, casparChannel: number) => number | null;
  readonly tuning?: Partial<PlayoutMetersTuning>;
  readonly log?: (line: string) => void;
}

export class PlayoutMetersReader {
  readonly #url: URL;
  readonly #bearer: () => string | null;
  readonly #channelFor: (casparHost: string, casparChannel: number) => number | null;
  readonly #tuning: PlayoutMetersTuning;
  readonly #log: (line: string) => void;
  readonly #handlers = new Set<(readings: readonly PgmMeterReading[]) => void>();

  #request: http.ClientRequest | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #linger: ReturnType<typeof setTimeout> | null = null;
  #failures = 0;
  #generation = 0;
  #connectCount = 0;
  #open = false;
  #notServedLogged = false;
  #disposed = false;

  constructor(options: PlayoutMetersReaderOptions) {
    this.#url = new URL(options.url);
    this.#bearer = options.bearer;
    this.#channelFor = options.channelFor;
    this.#tuning = { ...DEFAULT_PLAYOUT_METERS_TUNING, ...(options.tuning ?? {}) };
    this.#log = options.log ?? ((): void => undefined);
  }

  /** Streams opened so far — a test's instrument for "read ONCE". */
  get connectCount(): number {
    return this.#connectCount;
  }

  /** A stream is open and answered `200` now. */
  get open(): boolean {
    return this.#open;
  }

  /**
   * Called with the readings joined to this station's channels, one list per read of the stream (never an
   * empty one). The first subscriber opens the stream; the last one's unsubscribe closes it after the
   * linger. Returns an unsubscribe.
   */
  subscribe(handler: (readings: readonly PgmMeterReading[]) => void): () => void {
    this.#handlers.add(handler);
    if (this.#linger !== null) {
      clearTimeout(this.#linger);
      this.#linger = null;
    }
    if (this.#request === null && this.#retry === null) this.#connect();
    return () => {
      if (!this.#handlers.delete(handler) || this.#handlers.size > 0 || this.#disposed) return;
      this.#linger = setTimeout(() => {
        this.#linger = null;
        if (this.#handlers.size === 0) this.#stop();
      }, this.#tuning.lingerMs);
      this.#linger.unref();
    };
  }

  /**
   * CG Bridge's OWN session arrived: an open stream is reopened with it now. The Playout sends only the
   * bearer's `cg_channels`, and a stream opened on a console's token (D7's fallback, before the bridge had
   * its own) carries that console's channels only — the station's own account is what covers them all.
   */
  restart(): void {
    if (this.#disposed || this.#handlers.size === 0) return;
    this.#stop();
    this.#failures = 0;
    this.#connect();
  }

  /** A console signed in: a stream waiting for any bearer connects now rather than later. */
  kick(): void {
    if (this.#disposed || this.#handlers.size === 0 || this.#request !== null) return;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
    this.#connect();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#linger !== null) clearTimeout(this.#linger);
    this.#linger = null;
    this.#handlers.clear();
    this.#stop();
  }

  #stop(): void {
    this.#generation++;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = null;
    const request = this.#request;
    this.#request = null;
    this.#open = false;
    request?.destroy();
  }

  #schedule(delayMs: number): void {
    if (this.#disposed || this.#handlers.size === 0) return;
    if (this.#retry !== null) clearTimeout(this.#retry);
    this.#retry = setTimeout(() => {
      this.#retry = null;
      this.#connect();
    }, delayMs);
    this.#retry.unref();
  }

  #backoff(): number {
    const delay = Math.min(
      this.#tuning.backoffBaseMs * 2 ** this.#failures,
      this.#tuning.backoffMaxMs,
    );
    this.#failures++;
    return delay;
  }

  #connect(): void {
    if (this.#disposed || this.#handlers.size === 0) return;
    const bearer = this.#bearer();
    if (bearer === null) {
      // Nobody signed in, and the bridge has no session yet: ask again soon, quietly.
      this.#schedule(this.#tuning.backoffBaseMs * 2);
      return;
    }
    const generation = ++this.#generation;
    void pinnedIPv4(this.#url.hostname)
      .catch(() => null)
      .then((ip) => {
        if (generation !== this.#generation) return;
        if (ip === null) {
          this.#schedule(this.#backoff());
          return;
        }
        this.#stream(generation, ip, bearer);
      });
  }

  #stream(generation: number, ip: string, bearer: string): void {
    const url = this.#url;
    const secure = url.protocol === 'https:';
    const bareHost = url.hostname.replace(/^\[|\]$/g, '');
    this.#connectCount++;
    const request = (secure ? https : http).request({
      protocol: url.protocol,
      hostname: ip,
      port: url.port === '' ? (secure ? 443 : 80) : Number(url.port),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      // 🔴 The bearer rides the HEADER only, never the URL; no `Origin` is ever sent.
      headers: {
        host: url.host,
        authorization: `Bearer ${bearer}`,
        accept: 'text/event-stream',
        'cache-control': 'no-store',
      },
      agent: plainAgentFor(url),
      ...(secure && !net.isIP(bareHost) ? { servername: bareHost } : {}),
    });
    this.#request = request;
    let silence: ReturnType<typeof setTimeout> | null = null;
    const hear = (): void => {
      if (silence !== null) clearTimeout(silence);
      silence = setTimeout(() => {
        request.destroy(new Error(`no bytes for ${String(this.#tuning.silentMs)} ms`));
      }, this.#tuning.silentMs);
      silence.unref();
    };
    const connectBound = setTimeout(() => {
      request.destroy(new Error('no connection within the bound'));
    }, this.#tuning.connectTimeoutMs);
    connectBound.unref();
    const lost = (reason: string, retryMs?: number): void => {
      clearTimeout(connectBound);
      if (silence !== null) clearTimeout(silence);
      if (generation !== this.#generation) return;
      // Once per stream: a later end or error on the same one is not a second loss.
      this.#generation++;
      this.#request = null;
      const wasOpen = this.#open;
      this.#open = false;
      if (wasOpen || this.#failures === 0) {
        this.#log(`Playout meters: stream closed (${reason}) - connecting again`);
      }
      this.#schedule(retryMs ?? this.#backoff());
    };
    request.on('response', (res) => {
      clearTimeout(connectBound);
      if (generation !== this.#generation) {
        res.resume();
        return;
      }
      const status = res.statusCode ?? 0;
      if (status === 404) {
        res.resume();
        if (!this.#notServedLogged) {
          this.#notServedLogged = true;
          this.#log(
            'Playout meters: not served (a Playout before 2.9.2) - the meters stay at the floor',
          );
        }
        lost('not served', this.#tuning.notServedRetryMs);
        return;
      }
      if (status !== 200) {
        res.resume();
        lost(`the Playout answered ${String(status)}`);
        return;
      }
      this.#open = true;
      this.#notServedLogged = false;
      this.#failures = 0;
      hear();
      // The readings of ONE read go out as one list: the Playout's 50 ms tick writes every channel at once.
      let batch: PgmMeterReading[] = [];
      const parser = new SseParser((event, data) => {
        const parsed = parsePlayoutMeterEvent(event, data);
        const reading = parsed === null ? null : this.#join(parsed);
        if (reading !== null) batch.push(reading);
      });
      // A multi-byte character split across two reads is joined, never mangled.
      const text = new StringDecoder('utf8');
      res.on('data', (chunk: Buffer) => {
        if (generation !== this.#generation) return;
        hear();
        const fits = parser.push(text.write(chunk));
        if (batch.length > 0) {
          const readings = batch;
          batch = [];
          for (const handler of [...this.#handlers]) handler(readings);
        }
        if (!fits) request.destroy(new Error('an event too large to be the Playout’s'));
      });
      res.on('end', () => {
        lost('the Playout closed it');
      });
      res.on('error', (err) => {
        lost(err.message);
      });
    });
    request.on('error', (err) => {
      lost(err.message);
    });
    request.end();
  }

  /** A reading on this station's channel, or `null`: the station does not declare it. */
  #join(event: PlayoutMeterEvent): PgmMeterReading | null {
    const channel = this.#channelFor(event.casparHost, event.casparChannel);
    if (channel === null) return null;
    return event.kind === 'audio'
      ? { kind: 'audio', channel, dbfs: [...event.dbfs] }
      : {
          kind: 'loudness',
          channel,
          momentary: event.momentary,
          shortterm: event.shortterm,
          limiterGrDb: event.limiterGrDb,
        };
  }
}

/**
 * The part of the SSE grammar the Playout uses: `event:` and `data:` fields, `:` comments, events ended
 * by a blank line, `\n` or `\r\n`. `push` answers `false` when one event outgrows the bound.
 */
export class SseParser {
  #buffer = '';
  /** A chunk ended on `\r`: it may be the first half of `\r\n`, so it waits for the next one. */
  #pendingCr = false;
  readonly #onEvent: (event: string, data: string) => void;

  constructor(onEvent: (event: string, data: string) => void) {
    this.#onEvent = onEvent;
  }

  push(text: string): boolean {
    let raw = this.#pendingCr ? `\r${text}` : text;
    this.#pendingCr = raw.endsWith('\r');
    if (this.#pendingCr) raw = raw.slice(0, -1);
    this.#buffer += raw.replace(/\r\n?/g, '\n');
    for (;;) {
      const end = this.#buffer.indexOf('\n\n');
      if (end < 0) break;
      const block = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 2);
      this.#dispatch(block);
    }
    return this.#buffer.length <= MAX_EVENT_BYTES;
  }

  #dispatch(block: string): void {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) this.#onEvent(event, data.join('\n'));
  }
}
