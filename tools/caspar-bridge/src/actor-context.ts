import { AsyncLocalStorage } from 'node:async_hooks';
import { CONSOLE_ACTOR, TEMPLATE_ACTOR, UNATTRIBUTED_ACTOR } from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';

/**
 * B-141 follow-up — WHO the bridge records as having acted, for the duration of one
 * control request.
 *
 * ## What this is worth, stated where it is implemented
 *
 * ⚠ **SUPERSEDED — the self-declared console name is gone.** This header used to describe a
 * per-console name typed by whoever sat there; `OPERATOR-NAME-SWEEP-01` retired it and
 * `BRIDGE-TRUTH-01` §4 stopped the bridge reading the wire field at all. Three values remain:
 * the verified principal's name, {@link CONSOLE_ACTOR} for a console's act with no principal,
 * and {@link UNATTRIBUTED_ACTOR} for anything no console caused. See {@link runAsActor}.
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
/**
 * 🔴 `C-037` — **WHAT ONE CONTROL REQUEST IS RUNNING AS.**
 *
 * The docblock above ends _"the day identity becomes provable, this function is the only
 * thing that changes"_. That day is `C-037`, and this is the change: the store holds a
 * CONTEXT rather than a bare name, so a request carries the verified `sub` beside the display
 * name and can reach its own socket's principal.
 *
 * ⭐ **`operatorActor()` still returns a string, and every one of its readers is untouched.**
 * That was the promise; the seam kept it.
 */
export interface ActorContext {
  /** The value the audit record writes — verified when there is a principal, self-declared when not. */
  readonly actor: string;
  /** The token's `sub`, kept beside the name (ADR 0010 rule 3). `null` while auth is off. */
  readonly sub: string | null;
  /** The acting socket's principal holder, so `auth.*` routes can read and clear it. */
  readonly session: AuthSession | null;
}

const actorStore = new AsyncLocalStorage<ActorContext>();

/**
 * Run `fn` as the console that sent this request, for everything it awaits.
 *
 * 🔴 `BRIDGE-TRUTH-01` §4 — **A REQUEST ON A CONTROL SOCKET IS A CONSOLE'S ACT.** With a verified
 * principal the record names the person; without one it records {@link CONSOLE_ACTOR} — a console
 * did this, and nobody proved who was at it. {@link UNATTRIBUTED_ACTOR} is left to what it means:
 * nothing at a console caused this (a bridge-initiated append, outside any request).
 *
 * ⚠ **The wire's `actor` field is no longer read at all.** It was the self-declared console name
 * `OPERATOR-NAME-SWEEP-01` retired; no console sends it, and a client that still did could
 * otherwise write any name it liked into the record. The frame schema keeps the field optional
 * so an old client's frame still parses — the bridge simply does not believe it.
 */
export function runAsActor<T>(session: AuthSession | null, fn: () => T): T {
  /*
    🔴 `C-037` — **ONE DECISION, NOT TWO PATHS THAT AGREE.**

    A verified principal names the person; with no principal the row says a console did it.
    Written as one expression rather than an auth-on branch and an auth-off branch, for golden
    rule 10's reason: two paths that must agree are two paths that eventually do not, and the
    one that drifts is the one nobody exercises.

    ⚠ The verified name has ALREADY been through `normalizeActor`, at verification time, so
    that the name the console shows and the name the record writes are the same string rather
    than two reductions of one claim. It is not re-normalised here.
  */
  const verified = session?.token?.principal ?? null;
  return actorStore.run(
    verified === null
      ? { actor: CONSOLE_ACTOR, sub: null, session }
      : { actor: verified.name, sub: verified.sub, session },
    fn,
  );
}

/**
 * 🔴 `SELF-STOP-24` / `C-013` — run `fn` with THE TEMPLATE as the acting party.
 *
 * The one caller is the completion route: a served page has reported that its own run finished,
 * and the stop that follows was asked for by no console.
 *
 * ⚠ **It sets the value DIRECTLY rather than through {@link runAsActor}, and that is not a way
 * around the guard — it is the other side of it.** `normalizeActor` REFUSES
 * {@link TEMPLATE_ACTOR} because the wire is a place a human types a console name and could
 * otherwise claim to be a template. This function is not the wire: it is the bridge attributing
 * an action to itself, in-process, with no client anywhere in the call. Routing it through the
 * wire's normaliser would mean the bridge could not name the one actor the constant exists for.
 */
export function runAsTemplate<T>(fn: () => T): T {
  return actorStore.run({ actor: TEMPLATE_ACTOR, sub: null, session: null }, fn);
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
  return actorStore.getStore()?.actor ?? UNATTRIBUTED_ACTOR;
}

/**
 * 🔴 `C-037` / ADR 0010 rule 3 — the VERIFIED `sub` behind {@link operatorActor}'s name,
 * or `null` when there is no proven identity (auth off, or a request outside one).
 *
 * `B-211`'s rule: the name is what a human reads and the id is what survives a rename, so the
 * record keeps both. This is the half that never appears in a sentence (golden rule 11).
 */
export function operatorSub(): string | null {
  return actorStore.getStore()?.sub ?? null;
}

/**
 * The acting socket's principal holder — `null` outside a request, or on a bridge with no
 * auth. The `auth.*` routes read and clear through it, which is what lets them be ordinary
 * routes (censused like every other) instead of a carve-out in the message handler.
 */
export function currentAuthSession(): AuthSession | null {
  return actorStore.getStore()?.session ?? null;
}
