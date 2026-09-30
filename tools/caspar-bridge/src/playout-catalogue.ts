import { z } from 'zod';
import { CHANNEL_OUTPUTS, type PlayoutChannels } from '@cg/shared-ipc';
import { playoutFetch } from './playout-http.js';

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
 * 2. **AT MOST ONE READ PER 5 s, with `If-None-Match`.** A `304` keeps what is held and is a
 *    success, not a failure. (It was 30 s; `UI-POLISH-01` G moved it to the 5 s the Playout agreed —
 *    `CATALOGUE_POLL_MS`.)
 * 3. **THE BEARER IS CHECKED AT USE** (`PlayoutAuth.usableBearer`): never a token past `exp`, never
 *    one on the revocation list, and none at all once the principal who supplied it has signed out
 *    or closed the tab. No bearer means no read, and no read means ABSENT.
 * 4. **NEVER IN THE PATH OF A VERB.** Nothing here is awaited by the request gate; the gate does
 *    not read this file at all.
 */

/**
 * 🔴 `UI-POLISH-01` G — **THE FLOOR: AT MOST ONE D4 READ EVERY 5 s, AND NEVER LESS.** The ONE place
 * the period is written. D4 now carries each channel's `output` and `playlist`, which an operator
 * reads as live state, so the contract's original 30 s (`C-039`) was too slow to show a channel
 * going off air; the Playout agreed to 5 s and asked for no less (V13 §1.4: a `304` costs them the
 * same work as a `200`, and 5 s is 12 of their 600 requests a minute per IP). A read on demand —
 * a sign-in, first-run or Change channel… opening — goes through the same floor.
 */
export const CATALOGUE_POLL_MS = 5_000;

/**
 * How often the reader LOOKS for a due read — not how often it reads (that is the floor above).
 *
 * ⚠ **Deliberately much shorter than the floor, and this is a measured fix.** With the two equal,
 * a sign-in's immediate read shifted the phase: the first tick after it landed just under a period
 * later, was refused by the floor, and the next read was a whole period after that — so an outage
 * or a rename took up to two periods to reach the strip while "at most every period" still held. Found
 * by driving the §7 demo; `playout-catalogue.test.ts` pins it. A check that finds nothing due costs
 * a clock read and makes no request.
 */
export const CATALOGUE_TICK_MS = 1000;

/** A short bound, so a hanging Playout cannot hold a tick open. Same as the D9 read's. */
const HTTP_TIMEOUT_MS = 5000;

/** One D4 row, as the contract spells it (`handoff/2026-09-16/channels.json`). */
export const CatalogueRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  casparHost: z.string().min(1),
  casparChannel: z.number().int().positive(),
  /*
    🔴 `UI-POLISH-01` G — the Playout's `output` and `playlist` (`2.8.58`, V13 §1), both OPTIONAL
    and both LENIENT: a value this bridge does not know, or the wrong type, is DROPPED (`.catch`),
    never a failed row — one bad field must not void the catalogue and blank every channel's name.
    A dropped `output` reads as `unknown`; `playlist` keeps any word the Playout sends, because
    an unknown playlist state is shown as its own word.
  */
  output: z.enum(CHANNEL_OUTPUTS).optional().catch(undefined),
  playlist: z.string().trim().min(1).optional().catch(undefined),
  /*
    🔴 `PLAYOUT-SOURCES-01` / v1.3 (V13-INSTALL: `2.9.0` on `.111`) — the RUNNING core's video mode,
    `null` for a channel it does not have yet, beside `pendingRestart: true`. Both LENIENT, the
    `output`/`playlist` rule: a `null`, a missing or an unknown value never voids the row or its name.
  */
  videoMode: z.string().trim().min(1).nullable().optional().catch(undefined),
  pendingRestart: z.boolean().optional().catch(undefined),
  /*
    🔴 `PLAYOUT-FEATURES-01` D (Playout `2.9.2`, LICENSE §3.2) — may CG Control command this channel.
    LENIENT like the rest: a missing or malformed value is dropped, and a dropped one refuses nothing.
  */
  cgLicensed: z.boolean().optional().catch(undefined),
});
export type CatalogueRow = z.infer<typeof CatalogueRowSchema>;

const CatalogueBodySchema = z.object({ channels: z.array(CatalogueRowSchema) });

/**
 * `UI-POLISH-01` G — a row's `output` and `playlist`, each present only when the Playout sent one
 * this reader kept, so a published answer never carries a key whose value is `undefined`.
 */
export function airOf(
  row: Pick<CatalogueRow, 'output' | 'playlist' | 'videoMode' | 'pendingRestart' | 'cgLicensed'>,
): Pick<CatalogueRow, 'output' | 'playlist' | 'videoMode' | 'pendingRestart' | 'cgLicensed'> {
  return {
    ...(row.output !== undefined ? { output: row.output } : {}),
    ...(row.playlist !== undefined ? { playlist: row.playlist } : {}),
    // `PLAYOUT-SOURCES-01` — v1.3's two, published beside them; `null` is a value and rides.
    ...(row.videoMode !== undefined ? { videoMode: row.videoMode } : {}),
    ...(row.pendingRestart !== undefined ? { pendingRestart: row.pendingRestart } : {}),
    // `PLAYOUT-FEATURES-01` D — `2.9.2`'s per-channel CG license rides with them.
    ...(row.cgLicensed !== undefined ? { cgLicensed: row.cgLicensed } : {}),
  };
}

export interface PlayoutCatalogueOptions {
  /** TEST-ONLY — {@link playoutFetch} by default: server-side, no `Origin`, no proxy (B1.4). */
  readonly fetchImpl?: typeof fetch;
  /** TEST-ONLY — `Date.now` by default; drives the 5 s floor without sleeping. */
  readonly now?: () => number;
  /**
   * TEST-ONLY — the background tick's period; {@link CATALOGUE_TICK_MS} by default. It sets how
   * often a due read is LOOKED FOR; the 5 s floor between reads is the contract's and is not an
   * option.
   */
  readonly tickMs?: number;
  /**
   * 🔴 `DESKTOP-APPS-01-A` A4 — the host of the configured Playout address. A row whose
   * `casparHost` is loopback carries the ENGINE's view of itself — the engine runs on the
   * Playout's machine — so it is rewritten to this host HERE, inside the one reader, and every
   * consumer (first-run, `channels.list`'s join, the host rule) sees one value.
   */
  readonly playoutHost?: string | undefined;
}

/** `127.0.0.0/8`, `localhost`, `::1` — the engine naming its own machine. */
export function isLoopbackCasparHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === 'localhost' || h === '::1' || h === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

/**
 * A4 — a `casparHost` as a CONSUMER must see it: a loopback one becomes the Playout's host; any other
 * passes through byte for byte. With no Playout host, or a Playout that is itself on loopback,
 * nothing is rewritten — loopback already names that one machine.
 *
 * 🔴 `PLAYOUT-SOURCES-01` §0.9 — THE ONE HOST RULE, generalised off D4's row so D10's inputs and
 * v1.3's `compatibleChannels` are rewritten by exactly the rule D4's rows are.
 */
export function resolveCasparHost(host: string, playoutHost: string | undefined): string {
  if (playoutHost === undefined || isLoopbackCasparHost(playoutHost)) return host;
  return isLoopbackCasparHost(host) ? playoutHost : host;
}

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 9 — **A TOKEN'S GRANTS, BY THE SAME RULE.** A grant's `host` is the
 * Playout's `casparHost` again — the contract makes the two one spelling, because the pair is the join
 * key (`PLAYOUT-INTEGRATION-CONTRACT-v1` §3.2 and §4.4) — so a loopback one names the Playout's
 * machine exactly as a D4 row's does, and is rewritten here by {@link resolveCasparHost} and nothing
 * else.
 *
 * ⚠ Found by §5's separate-server test (`B-297`): on `.111` the Playout spells `casparHost`
 * `127.0.0.1` (the bridge-host letter §3), so every explicit grant said `127.0.0.1`. A CG Bridge on
 * the Playout's own machine drives `127.0.0.1` and matched; one on a separate server drives the
 * Playout's network address, rewrote D4's rows to it, and refused every operator every command —
 * `cg-admin` too, once `2.9.2` turns its `"*"` into a list. A grant naming another machine passes
 * byte for byte, so it still authorises nothing here; `"*"` is left as it is.
 */
export function resolveGrantHosts(
  channels: PlayoutChannels,
  playoutHost: string | undefined,
): PlayoutChannels {
  if (channels === '*') return channels;
  let rewritten = false;
  const resolved = channels.map((grant) => {
    const host = resolveCasparHost(grant.host, playoutHost);
    if (host === grant.host) return grant;
    rewritten = true;
    return { ...grant, host };
  });
  return rewritten ? resolved : channels;
}

/** A4 — a D4 row as a consumer must see it (see {@link resolveCasparHost}). */
export function resolveCatalogueHost(
  row: CatalogueRow,
  playoutHost: string | undefined,
): CatalogueRow {
  const casparHost = resolveCasparHost(row.casparHost, playoutHost);
  return casparHost === row.casparHost ? row : { ...row, casparHost };
}

/**
 * 🔴 `PLAYOUT-SOURCES-01` §0.9 — **THE ONE JOIN: does a Playout row's (already rewritten) `casparHost`
 * name a server this station drives?** It was an inline `hosts.includes(row.casparHost)` in
 * `stationChannelsFor`; D10's inputs and `compatibleChannels` now ask the same question, so it lives
 * once, here, and a second spelling cannot drift from it.
 */
export function hostJoinsStation(casparHost: string, configuredHosts: readonly string[]): boolean {
  return configuredHosts.includes(casparHost);
}

export class PlayoutCatalogue {
  readonly #url: string;
  readonly #bearer: () => string | null;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #tickMs: number;
  readonly #playoutHost: string | undefined;

  /** The last answer, or `null` — ABSENT. */
  #rows: readonly CatalogueRow[] | null = null;
  #etag: string | null = null;
  #lastReadMs = Number.NEGATIVE_INFINITY;
  /** When the Playout last ANSWERED D4 (a catalogue, or `304` for the one held). */
  #lastGoodMs: number | null = null;
  #inFlight: Promise<void> | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #readCount = 0;
  readonly #handlers = new Set<(rows: readonly CatalogueRow[] | null) => void>();

  constructor(url: string, bearer: () => string | null, options: PlayoutCatalogueOptions = {}) {
    this.#url = url;
    this.#bearer = bearer;
    this.#fetch = options.fetchImpl ?? playoutFetch;
    this.#now = options.now ?? ((): number => Date.now());
    this.#tickMs = options.tickMs ?? CATALOGUE_TICK_MS;
    this.#playoutHost = options.playoutHost;
  }

  /** The catalogue as last read, or `null` when ABSENT. Synchronous — nothing waits on the Playout. */
  rows(): readonly CatalogueRow[] | null {
    return this.#rows;
  }

  /** D4 requests actually issued — a cadence test's positive control. */
  get readCount(): number {
    return this.#readCount;
  }

  /**
   * `CENTRAL-BRIDGE-01` (D10) — when the Playout last answered D4, epoch ms, or `null` when it has not
   * since start: `/health`'s `playout.lastReadAt`. A read that failed leaves it where it was.
   */
  lastGoodReadAtMs(): number | null {
    return this.#lastGoodMs;
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
   * Read D4 now if the floor allows — called by the tick, on a sign-in so a console's names arrive
   * with its principal rather than a period later, and when first-run or Change channel… asks for
   * the list (`channels.catalogue`). Resolves when this read (or the one
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
      if (res.status === 304) {
        this.#lastGoodMs = this.#now();
        return;
      }
      if (!res.ok) throw new Error(`D4 answered ${String(res.status)}`);
      const parsed = CatalogueBodySchema.safeParse(await res.json());
      if (!parsed.success) throw new Error('D4 answered a body that is not a catalogue');
      this.#lastGoodMs = this.#now();
      this.#etag = res.headers.get('etag');
      this.#set(parsed.data.channels.map((row) => resolveCatalogueHost(row, this.#playoutHost)));
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
