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
  /**
   * 🔴 **A VERIFICATION IN FLIGHT, so the frames behind it are not judged before it lands.**
   *
   * `socket.on('message', …)` dispatches every frame with `void handleMessage(…)` — nothing
   * serializes them — and `handleAuthFrame` SUSPENDS at `await verify()`, which may fetch a
   * JWKS. The console writes its `auth` frame and then, in the same tick, its whole resync:
   * every retained template and the stack restore. Without this, all of them are gated while
   * the principal is still being verified, every one is refused, and a reconnected console
   * comes back with an empty library and no stack — which is the exact failure the frame
   * ORDER was chosen to avoid.
   *
   * ⚠ It DEFERS, it does not refuse. A frame that arrives during a sign-in has done nothing
   * wrong; judging it early is what would be wrong.
   */
  #verifying: Promise<void> | null = null;

  /** What this socket proved, or `null`. */
  get token(): VerifiedToken | null {
    return this.#token;
  }

  /** Adopt a verified token. Replaces whatever was there — a fresh `auth` frame re-signs in. */
  adopt(token: VerifiedToken): void {
    this.#token = token;
  }

  /**
   * Register an in-flight verification, and resolve it however it ends.
   *
   * ⚠ The tracker is cleared on BOTH paths, success and failure. A refused token that left
   * this latched would deadlock every later frame on the socket — a gate that fails closed by
   * hanging is worse than one that refuses, because nothing says what happened.
   */
  trackVerification(work: Promise<unknown>): void {
    const settled = work.then(
      () => undefined,
      () => undefined,
    );
    this.#verifying = settled;
    void settled.then(() => {
      if (this.#verifying === settled) this.#verifying = null;
    });
  }

  /**
   * Wait for any verification in flight. Resolves immediately when there is none, which is
   * every frame on a socket that is not signing in at that instant — so the cost on the
   * ordinary path is one already-resolved await.
   *
   * A loop rather than a single await: a console may present a token and, on the same socket,
   * present a refreshed one before the first settles.
   */
  async whenSettled(): Promise<void> {
    while (this.#verifying !== null) {
      const current = this.#verifying;
      await current;
      if (this.#verifying === current) this.#verifying = null;
    }
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
