import { playoutFetch } from './playout-http.js';

/**
 * 🔴 `R-084` (`RELEASE-0111-01-A` A1) — **THE PLAYOUT'S OWN VERSION, READ BY CG BRIDGE.**
 *
 * The Playout team's answer of 2026-10-04 (`PLAYOUT-CG-RESPONSE-0110-111-v1.md` §3.1):
 *
 * - `GET /api/v1/system/version` on the Playout's API port, with NO token — every Playout from `2.1.0`
 *   serves it (`.111` answers `2.9.2`);
 * - read `version` (semver) and nothing else — `changelog` is long, Persian and changes every build, and
 *   there is no separate build number: `version` IS the build;
 * - read it from CG Bridge, never from a browser: it answers any origin today, and that may tighten;
 * - it is NOT part of the contract (they will warn before its shape changes) — so a Playout that does
 *   not answer it is `not served`, and that is never a refusal of anything.
 *
 * Like every other Playout request it goes through {@link playoutFetch}: no `Origin`, no proxy, the one
 * IPv4. It carries no `Authorization` at all.
 */
export const PLAYOUT_VERSION_PATH = '/api/v1/system/version';

/** The version endpoint of the Playout at `address` (a normalised Playout address). */
export function playoutVersionUrl(address: string): string {
  return `${address.replace(/\/+$/, '')}${PLAYOUT_VERSION_PATH}`;
}

/** `major.minor.patch`, with an optional pre-release or build suffix — what `version` holds. */
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** The `version` of a version answer, or `null` when the body has none we can read. */
export function playoutVersionOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const version = (body as { version?: unknown }).version;
  return typeof version === 'string' && SEMVER.test(version.trim()) ? version.trim() : null;
}

/**
 * The station's Playout version: read at start and then at most once per {@link VERSION_POLL_MS} — with
 * D9's cadence, as the delta asks. `null` while unread, and whenever the Playout does not answer it
 * (unreachable, a `404`, a body without a version): `not served`. A change is told once.
 */
export const VERSION_POLL_MS = 60_000;

/** A short bound, so a hanging Playout cannot hold a read open. Same as D4's and D9's. */
const HTTP_TIMEOUT_MS = 5_000;

export interface PlayoutVersionReaderOptions {
  /** TEST-ONLY — {@link playoutFetch} by default: server-side, no `Origin`, no proxy. */
  readonly fetchImpl?: typeof fetch;
  /** TEST-ONLY — the period between reads, {@link VERSION_POLL_MS} by default. */
  readonly pollMs?: number;
}

export class PlayoutVersionReader {
  readonly #url: string;
  readonly #fetch: typeof fetch;
  readonly #pollMs: number;
  #version: string | null = null;
  /**
   * `RELEASE-0112-01` — did the last read get ANY HTTP answer? `true` — the engine's API answers
   * (whatever it said); `false` — the request itself failed (refused, timed out); `null` — not read yet.
   * It is how each engine's line says `unreachable` without a token.
   */
  #reachable: boolean | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #inFlight: Promise<void> | null = null;
  #reads = 0;
  readonly #handlers = new Set<(version: string | null) => void>();
  readonly #reachHandlers = new Set<(reachable: boolean) => void>();

  constructor(url: string, options: PlayoutVersionReaderOptions = {}) {
    this.#url = url;
    this.#fetch = options.fetchImpl ?? playoutFetch;
    this.#pollMs = options.pollMs ?? VERSION_POLL_MS;
  }

  /** The version as last read, or `null` — not read yet, or not served. Synchronous. */
  version(): string | null {
    return this.#version;
  }

  /** `RELEASE-0112-01` — the engine's API answered the last read (`null`: not read yet). */
  reachable(): boolean | null {
    return this.#reachable;
  }

  /** Called whenever {@link reachable} CHANGES. Returns an unsubscribe. */
  onReachChanged(handler: (reachable: boolean) => void): () => void {
    this.#reachHandlers.add(handler);
    return () => {
      this.#reachHandlers.delete(handler);
    };
  }

  /** Version requests actually issued — a cadence test's positive control. */
  get readCount(): number {
    return this.#reads;
  }

  /** Called with the new version whenever what is held CHANGES. Returns an unsubscribe. */
  onChanged(handler: (version: string | null) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Read now, then once per period. `unref`'d, so it never holds the process open. */
  start(): void {
    if (this.#ticker !== null) return;
    void this.refresh();
    this.#ticker = setInterval(() => {
      void this.refresh();
    }, this.#pollMs);
    this.#ticker.unref();
  }

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /** One read (a read in flight is shared). Never rejects. */
  refresh(): Promise<void> {
    if (this.#inFlight !== null) return this.#inFlight;
    this.#reads += 1;
    this.#inFlight = this.#read().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #read(): Promise<void> {
    let version: string | null = null;
    let reachable = false;
    try {
      const res = await this.#fetch(this.#url, {
        method: 'GET',
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      reachable = true;
      if (res.ok) version = playoutVersionOf(await res.json());
    } catch {
      version = null; // Unreachable, timed out, or not JSON: not served.
    }
    if (reachable !== this.#reachable) {
      this.#reachable = reachable;
      for (const handler of [...this.#reachHandlers]) handler(reachable);
    }
    if (version === this.#version) return;
    this.#version = version;
    for (const handler of [...this.#handlers]) handler(version);
  }
}
