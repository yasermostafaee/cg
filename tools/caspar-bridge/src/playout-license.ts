import { z } from 'zod';
import { PlayoutLicenseSchema, type PlayoutLicense } from '@cg/shared-ipc';
import { playoutFetch } from './playout-http.js';
import { resolveCasparHost } from './playout-catalogue.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` D / `R-077` — **THE PLAYOUT'S CG LICENSE (`GET /api/cg/license`, `2.9.2`), READ
 * BY CG BRIDGE WITH ITS OWN SESSION, BESIDE D9.**
 *
 * The Playout's own advice (`PLAYOUT-CG-RESPONSE-LICENSE-v1.md` §3.3): read it beside D9, about every
 * 60 s, look at the last value before every take, and KEEP the last value while the Playout cannot be
 * reached — D9's rule, not D4's. That is the difference from the D4 reader (`playout-catalogue.ts`),
 * which goes ABSENT on any failure because a stale label is a lie; a license that read "not licensed"
 * does not become licensed because the Playout stopped answering.
 *
 * - **At most one read per {@link LICENSE_POLL_MS}**, plus one when this bridge (or a console) gains a
 *   session, through a short floor ({@link LICENSE_SIGN_IN_FLOOR_MS}) so a burst of sign-ins is one read.
 * - **Kept on failure:** unreachable, timed out, `401`, `5xx`, a body we cannot read — the value stays.
 * - **`404` is "not served"** — CG Control switched off in the Playout, or a Playout before `2.9.2` — and
 *   reads as `null`: no license to refuse by, exactly as before this endpoint existed.
 * - **Never in the path of a verb:** a take reads {@link PlayoutLicenseReader.license} synchronously.
 */

/** The Playout's advice: about every 60 s (their §3.3). The one place the period is written. */
export const LICENSE_POLL_MS = 60_000;

/** A sign-in's read comes early, but never more often than this. */
export const LICENSE_SIGN_IN_FLOOR_MS = 5_000;

/** How often the tick LOOKS for a due read (the floor above is the cadence). */
const LICENSE_TICK_MS = 1_000;

/** A short bound, so a hanging Playout cannot hold a tick open. Same as D4's and D9's. */
const HTTP_TIMEOUT_MS = 5_000;

/** The station-level list of channels CG may command (§3.1 `channels`), as the Playout spells it. */
const LicenseChannelsSchema = z
  .array(
    z.object({
      casparHost: z.string().min(1),
      casparChannel: z.number().int().positive(),
    }),
  )
  .optional()
  .catch(undefined);

const LicenseBodySchema = PlayoutLicenseSchema.extend({ channels: LicenseChannelsSchema });

export interface PlayoutLicenseReaderOptions {
  /** TEST-ONLY — {@link playoutFetch} by default: server-side, no `Origin`, no proxy. */
  readonly fetchImpl?: typeof fetch;
  /** TEST-ONLY — `Date.now` by default. */
  readonly now?: () => number;
  /** TEST-ONLY — the tick's period. */
  readonly tickMs?: number;
  /** A loopback `casparHost` in `channels` names the Playout's own machine (D4's A4 rule). */
  readonly playoutHost?: string | undefined;
}

/** What the reader holds: the license, and the station's CG channels resolved to hosts we compare. */
export interface HeldLicense {
  readonly license: PlayoutLicense;
  /** `null` — the Playout sent no list. */
  readonly channels:
    | readonly { readonly casparHost: string; readonly casparChannel: number }[]
    | null;
}

export class PlayoutLicenseReader {
  readonly #url: string;
  readonly #bearer: () => string | null;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #tickMs: number;
  readonly #playoutHost: string | undefined;

  #held: HeldLicense | null = null;
  #lastReadMs = Number.NEGATIVE_INFINITY;
  #inFlight: Promise<void> | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #readCount = 0;
  readonly #handlers = new Set<(license: PlayoutLicense | null) => void>();

  constructor(url: string, bearer: () => string | null, options: PlayoutLicenseReaderOptions = {}) {
    this.#url = url;
    this.#bearer = bearer;
    this.#fetch = options.fetchImpl ?? playoutFetch;
    this.#now = options.now ?? ((): number => Date.now());
    this.#tickMs = options.tickMs ?? LICENSE_TICK_MS;
    this.#playoutHost = options.playoutHost;
  }

  /** The license as last read, or `null` (never read, or not served). Synchronous. */
  license(): PlayoutLicense | null {
    return this.#held?.license ?? null;
  }

  /** The license's station-level channel list, hosts resolved, or `null` when there is none. */
  channels(): HeldLicense['channels'] {
    return this.#held?.channels ?? null;
  }

  /** License requests actually issued — a cadence test's positive control. */
  get readCount(): number {
    return this.#readCount;
  }

  /** Called with the new license whenever what is held CHANGES. Returns an unsubscribe. */
  onChanged(handler: (license: PlayoutLicense | null) => void): () => void {
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

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /**
   * Read now if due: the tick reads once per {@link LICENSE_POLL_MS}; `soon` (a sign-in) reads once
   * {@link LICENSE_SIGN_IN_FLOOR_MS} has passed. No bearer: nothing is read, and what is held STAYS —
   * a license is not unread because nobody is signed in. Never rejects.
   */
  refresh(options: { readonly soon?: boolean } = {}): Promise<void> {
    if (this.#inFlight !== null) return this.#inFlight;
    const bearer = this.#bearer();
    if (bearer === null) return Promise.resolve();
    const floor = options.soon === true ? LICENSE_SIGN_IN_FLOOR_MS : LICENSE_POLL_MS;
    if (this.#now() - this.#lastReadMs < floor) return Promise.resolve();
    this.#lastReadMs = this.#now();
    this.#readCount += 1;
    this.#inFlight = this.#read(bearer).finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #read(bearer: string): Promise<void> {
    let res: Response;
    try {
      res = await this.#fetch(this.#url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch {
      return; // Unreachable or timed out: the last value stands.
    }
    if (res.status === 404) {
      // Not served — CG Control off in the Playout, or a Playout before `2.9.2`. Nothing to refuse by.
      this.#set(null);
      return;
    }
    if (!res.ok) return; // Refused (`401`) or failing (`5xx`): kept.
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return;
    }
    const parsed = LicenseBodySchema.safeParse(body);
    if (!parsed.success) return;
    const { channels, ...license } = parsed.data;
    this.#set({
      license,
      channels:
        channels === undefined
          ? null
          : channels.map((c) => ({
              casparHost: resolveCasparHost(c.casparHost, this.#playoutHost),
              casparChannel: c.casparChannel,
            })),
    });
  }

  #set(next: HeldLicense | null): void {
    if (JSON.stringify(next) === JSON.stringify(this.#held)) return;
    this.#held = next;
    for (const handler of [...this.#handlers]) handler(next?.license ?? null);
  }
}
