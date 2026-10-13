import { randomBytes } from 'node:crypto';
import { HTTP_TICKET_TTL_MS } from '@cg/shared-ipc';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D9) — **THE TICKETS THAT OPEN CG BRIDGE'S HTTP RESOURCES.**
 *
 * An `<img>` or a download link carries no token, so a console asks for a ticket over its VERIFIED
 * socket (`pgmReturn.ticket`, `bridge.logs-ticket`), and the HTTP route accepts that and nothing
 * else. A ticket is 24 random bytes, lives {@link HTTP_TICKET_TTL_MS} from issue, and is bound to
 * what it was issued for — a programme return for ONE channel, or the logs. A logs ticket is used
 * once; a programme ticket may be asked for again until it expires (a picture request is retried by
 * the page, and React mounts twice in development). Held in memory only: a restart forgets them,
 * and the console simply asks again.
 */

export type TicketGrant =
  | {
      readonly kind: 'pgm';
      readonly channel: number;
      /** `PLAYOUT-FEATURES-01` E — the sound's ticket opens the sound only. Absent = the picture. */
      readonly stream?: 'picture' | 'audio';
    }
  | { readonly kind: 'logs' };

interface Held {
  readonly grant: TicketGrant;
  readonly expiresAtMs: number;
}

export class HttpTickets {
  readonly #held = new Map<string, Held>();
  readonly #now: () => number;
  readonly #ttlMs: number;

  constructor(now: () => number = Date.now, ttlMs: number = HTTP_TICKET_TTL_MS) {
    this.#now = now;
    this.#ttlMs = ttlMs;
  }

  /** A new ticket for `grant`. */
  issue(grant: TicketGrant): string {
    this.#sweep();
    const ticket = randomBytes(24).toString('base64url');
    this.#held.set(ticket, { grant, expiresAtMs: this.#now() + this.#ttlMs });
    return ticket;
  }

  /**
   * The grant a ticket opens — when it is live and is for what is being asked (`fits`) — or `null`.
   * A logs ticket is spent by its one use.
   */
  redeem(ticket: string | null, fits: (grant: TicketGrant) => boolean): TicketGrant | null {
    if (ticket === null) return null;
    const held = this.#held.get(ticket);
    if (held === undefined) return null;
    if (this.#now() >= held.expiresAtMs) {
      this.#held.delete(ticket);
      return null;
    }
    if (!fits(held.grant)) return null;
    if (held.grant.kind === 'logs') this.#held.delete(ticket);
    return held.grant;
  }

  /** How many are held — for a test. */
  get size(): number {
    return this.#held.size;
  }

  #sweep(): void {
    const now = this.#now();
    for (const [ticket, held] of this.#held) if (now >= held.expiresAtMs) this.#held.delete(ticket);
  }
}
