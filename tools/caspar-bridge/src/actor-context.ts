import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeActor, UNATTRIBUTED_ACTOR } from '@cg/shared-ipc';

/**
 * B-141 follow-up — WHO the bridge records as having acted, for the duration of one
 * control request.
 *
 * ## What this is worth, stated where it is implemented
 *
 * 🔴 **SELF-DECLARED AND UNVERIFIED.** The name comes from a per-console setting typed
 * by whoever is at that console, over an unauthenticated loopback socket. So the record
 * answers **"which console, as labelled"** and NOT **"which person, proven"**. Anyone
 * can type anything, and a console shared across a shift change keeps yesterday's name
 * until somebody changes it. That limit is written into the operator-facing surface too
 * (the Audit panel), not only here — a caveat only the implementer can read is not a
 * caveat, which is the `assumed` lesson one level out.
 *
 * It is still worth having: on a gallery with three consoles, "which console" is most
 * of what a next-day question is actually asking, and it is strictly more than a
 * constant. If PROVEN identity is wanted later, a PIN-backed sign-in is ADDITIVE — it
 * would populate this same seam with a verified value and every reader stays put.
 *
 * ## Why AsyncLocalStorage rather than a parameter
 *
 * The audit sites are spread across ~9 entry points on `CasparRuntime`, several of them
 * deep inside methods that already carry an `AuditDetail`. Threading an actor through
 * every signature is the change most likely to miss one — and a missed one does not
 * fail, it silently records the wrong console. ALS binds the value to the request's
 * async execution, so `operatorActor()` is correct at every depth and across every
 * `await` without any call site knowing it exists.
 *
 * A mutable "current actor" field would NOT work here and it is worth saying why: stack
 * operations await their AMCP ack, so two requests from two browsers interleave, and
 * the second would overwrite the first's actor mid-flight. ALS is the primitive that
 * does not have that bug.
 */
const actorStore = new AsyncLocalStorage<string>();

/**
 * Run `fn` with `raw` as the acting console for everything it awaits.
 *
 * Normalised on ENTRY, with the same function the browser used before sending: a blank
 * or absent value becomes {@link UNATTRIBUTED_ACTOR} here rather than reaching an
 * append site as an empty string. The bridge does not trust the wire — a client is free
 * to send anything, and `actor` is the one field a client controls outright.
 */
export function runAsActor<T>(raw: unknown, fn: () => T): T {
  return actorStore.run(normalizeActor(raw), fn);
}

/**
 * ⭐ **THE ONE SITE THAT LEARNS WHO ACTED.** Every `actor:` in this package reads it,
 * and nothing else decides the answer — so the day identity becomes provable, this
 * function is the only thing that changes.
 *
 * Outside a request (a bridge-initiated append, a test calling the runtime directly)
 * there is no console to name, and it returns {@link UNATTRIBUTED_ACTOR}. That is the
 * honest answer rather than a fallback: nobody at a console caused it.
 */
export function operatorActor(): string {
  return actorStore.getStore() ?? UNATTRIBUTED_ACTOR;
}
