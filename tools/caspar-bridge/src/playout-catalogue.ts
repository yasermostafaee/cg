import { z } from 'zod';

/**
 * 🔴 `C-039` / `CHANNEL-AUTHORITY-01` — **THE PLAYOUT'S CHANNEL CATALOGUE (D4), READ AS A LABEL
 * SOURCE AND NOTHING MORE.**
 *
 * `GET /api/cg/channels` answers `{ channels: [{ id, name, casparHost, casparChannel }] }` — the
 * channels the Playout knows of, with the NAMES an operator uses for them. That is two facts about
 * a channel: that it EXISTS, and what it is CALLED. It is not the fact that decides where this
 * bridge writes — the declared bank is (`#isDeclaredChannel`), and the request gate's station fence
 * refuses every channel the bank does not declare whatever this file holds. So a row here can name
 * a channel and can never make one writable. That ordering is why the fence landed first.
 *
 * ── THE FOUR RULES, EACH FOR A MEASURED OR CONTRACTED REASON ────────────────
 *
 * 1. **ABSENT ON ANY FAILURE, and ABSENT is `null`** — never the last good answer, never an alarm,
 *    never a verdict (ADR 0010 rule 8). Unlike D9 there is nothing to protect by keeping a stale
 *    copy: a label that has gone stale is a label saying something the Playout no longer says, and
 *    the strip's own fallback (`CHANNEL <n>`) is always true.
 * 2. **AT MOST ONE READ PER 30 s, with `If-None-Match`.** A `304` keeps what is held and is a
 *    success, not a failure.
 * 3. **THE BEARER IS CHECKED AT USE** (`PlayoutAuth.usableBearer`): never a token past `exp`, never
 *    one on the revocation list, and none at all once the principal who supplied it has signed out
 *    or closed the tab. No bearer means no read, and no read means ABSENT.
 * 4. **NEVER IN THE PATH OF A VERB.** Nothing here is awaited by the request gate; the gate does
 *    not read this file at all.
 */

/** `C-039` — the contract's own floor: polled at most every 30 s. */
export const CATALOGUE_POLL_MS = 30_000;

/** A short bound, so a hanging Playout cannot hold a tick open. Same as the D9 read's. */
const HTTP_TIMEOUT_MS = 5000;

/** One D4 row, as the contract spells it (`handoff/2026-09-16/channels.json`). */
export const CatalogueRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  casparHost: z.string().min(1),
  casparChannel: z.number().int().positive(),
});
export type CatalogueRow = z.infer<typeof CatalogueRowSchema>;

const CatalogueBodySchema = z.object({ channels: z.array(CatalogueRowSchema) });

export interface PlayoutCatalogueOptions {
  /** TEST-ONLY — the global `fetch` by default. */
  readonly fetchImpl?: typeof fetch;
  /** TEST-ONLY — `Date.now` by default; drives the 30 s floor without sleeping. */
  readonly now?: () => number;
  /**
   * TEST-ONLY — the background tick's period; {@link CATALOGUE_POLL_MS} by default. It sets how
   * often a read is ATTEMPTED; the 30 s floor between reads is the contract's and is not an option.
   */
  readonly tickMs?: number;
}

export class PlayoutCatalogue {
  readonly #url: string;
  readonly #bearer: () => string | null;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #tickMs: number;

  /** The last answer, or `null` — ABSENT. */
  #rows: readonly CatalogueRow[] | null = null;
  #etag: string | null = null;
  #lastReadMs = Number.NEGATIVE_INFINITY;
  #inFlight: Promise<void> | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #readCount = 0;
  readonly #handlers = new Set<(rows: readonly CatalogueRow[] | null) => void>();

  constructor(url: string, bearer: () => string | null, options: PlayoutCatalogueOptions = {}) {
    this.#url = url;
    this.#bearer = bearer;
    this.#fetch = options.fetchImpl ?? ((...args) => fetch(...args));
    this.#now = options.now ?? ((): number => Date.now());
    this.#tickMs = options.tickMs ?? CATALOGUE_POLL_MS;
  }

  /** The catalogue as last read, or `null` when ABSENT. Synchronous — nothing waits on the Playout. */
  rows(): readonly CatalogueRow[] | null {
    return this.#rows;
  }

  /** D4 requests actually issued — a cadence test's positive control. */
  get readCount(): number {
    return this.#readCount;
  }

  /** Called with the new rows (or `null`) whenever what is held CHANGES. Returns an unsubscribe. */
  onChanged(handler: (rows: readonly CatalogueRow[] | null) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Arm the background tick. `unref`'d, so it never holds the process open. */
  start(): void {
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(() => {
      void this.refresh();
    }, this.#tickMs);
    this.#ticker.unref();
  }

  /** Stop the tick. Called from the bridge's own `close()`. */
  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /**
   * Read D4 now if the floor allows — called by the tick, and on a sign-in so a console's names
   * arrive with its principal rather than up to 30 s later. Resolves when this read (or the one
   * already in flight) has settled; never rejects.
   *
   * ⚠ No bearer is not a reason to WAIT: it is ABSENT at once. A catalogue read on behalf of
   * nobody would be a read with a credential somebody else left behind, which is rule 3.
   */
  refresh(): Promise<void> {
    if (this.#inFlight !== null) return this.#inFlight;
    const bearer = this.#bearer();
    if (bearer === null) {
      this.#etag = null;
      this.#set(null);
      return Promise.resolve();
    }
    // The contract's floor, fixed — the TICK period is injectable for tests, the floor is not.
    if (this.#now() - this.#lastReadMs < CATALOGUE_POLL_MS) return Promise.resolve();
    this.#lastReadMs = this.#now();
    this.#readCount += 1;
    this.#inFlight = this.#read(bearer).finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #read(bearer: string): Promise<void> {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
      if (this.#etag !== null && this.#rows !== null) headers['If-None-Match'] = this.#etag;
      const res = await this.#fetch(this.#url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      // 304 — unchanged since the answer we hold. Holding it IS the answer.
      if (res.status === 304) return;
      if (!res.ok) throw new Error(`D4 answered ${String(res.status)}`);
      const parsed = CatalogueBodySchema.safeParse(await res.json());
      if (!parsed.success) throw new Error('D4 answered a body that is not a catalogue');
      this.#etag = res.headers.get('etag');
      this.#set(parsed.data.channels);
    } catch {
      // Unreachable, refused, timed out, malformed: ABSENT. No alarm — rule 1.
      this.#etag = null;
      this.#set(null);
    }
  }

  #set(next: readonly CatalogueRow[] | null): void {
    if (JSON.stringify(next) === JSON.stringify(this.#rows)) return;
    this.#rows = next;
    for (const handler of [...this.#handlers]) handler(next);
  }
}
