import type { VerifiedToken } from './playout-auth.js';

/**
 * 🔴 `C-037` — **ONE SOCKET'S PRINCIPAL. One of these per connection, and never shared.**
 *
 * ── WHY AN OBJECT PER SOCKET AND NOT A FIELD ON THE BRIDGE ──────────────────
 *
 * Two browsers are two people. A "current principal" on the bridge would be the same bug
 * `actor-context.ts` already rejected a mutable "current actor" field for, one axis up: stack
 * operations await their AMCP ack, so two requests interleave and the second would overwrite
 * the first mid-flight — except that here the consequence is not a mislabelled log row but a
 * viewer's request executing as an admin. The principal is a property of the CONNECTION, so
 * it is stored on an object whose lifetime is the connection's.
 *
 * ⚠ The object is created for EVERY socket, including when auth is off. A `null` token then
 * means "there is no such thing here", which is the same shape as "not signed in yet" and
 * needs no second code path — the MODE decides what that means, at the gate, in one place.
 */
export class AuthSession {
  #token: VerifiedToken | null = null;

  /** What this socket proved, or `null`. */
  get token(): VerifiedToken | null {
    return this.#token;
  }

  /** Adopt a verified token. Replaces whatever was there — a fresh `auth` frame re-signs in. */
  adopt(token: VerifiedToken): void {
    this.#token = token;
  }

  /**
   * Drop the principal. The socket stays OPEN.
   *
   * ADR 0010 rule 4: _"the socket is never closed over a token"_. Closing would take the
   * console's live state with it and make signing back in a reconnect rather than a sentence.
   */
  clear(): void {
    this.#token = null;
  }
}
