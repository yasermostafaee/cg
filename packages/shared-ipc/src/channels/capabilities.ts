import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { AuthModeSchema, type AuthMode } from './auth.js';
import { SetupPhaseSchema } from './setup.js';

/**
 * 🔴 **`B-153` — WHAT THIS BRIDGE PROCESS CAN DO, asked at CONNECT, before the operator can
 * press anything.**
 *
 * ── THE FAILURE THIS EXISTS FOR ─────────────────────────────────────────────
 *
 * `caspar-bridge` is a separate, long-lived process. A browser reload updates the SPA and
 * NOT the bridge, so a page routinely ends up talking to a bridge whose build predates it.
 * Nothing checked. The way an operator found out was pressing a LOOK button during a live
 * show and getting `unknown channel: stack.set-active-look` — a failure discovered at the
 * worst possible moment, on air, by the one person who cannot fix it.
 *
 * ── WHY A CAPABILITY LIST AND NOT A VERSION NUMBER ──────────────────────────
 *
 * A version compare was considered and rejected. It answers the wrong question: two builds
 * can differ in ways that have nothing to do with the channels this page calls, so a version
 * gate either refuses working stations (any bump reads as skew) or has to carry a
 * hand-maintained compatibility range — a number somebody must REMEMBER to bump, which is
 * the class of guard that is already stale by the time it matters.
 *
 * The routed channel list is DERIVED from what the bridge actually wired, and the SPA's
 * requirement is DERIVED from what `@cg/shared-ipc` actually exports. Neither side maintains
 * a list by hand, the comparison names exactly what is missing, and it cannot false-positive
 * on a bump that changed nothing this page uses.
 *
 * ── THE BOOTSTRAP CASE IS THE ANSWER, NOT A HOLE ────────────────────────────
 *
 * ⚠ A bridge older than this channel cannot answer it — it replies `unknown channel:
 * bridge.capabilities`. That is not a gap: it is the strongest possible positive signal that
 * the bridge predates this page, and the SPA reads it exactly that way. There is no version
 * of "too old to check" that this misses.
 */
export const BridgeCapabilitiesChannel = defineChannel(
  'bridge.capabilities',
  z.object({}),
  z.object({
    /**
     * Every request channel this bridge PROCESS actually routes, derived from its own route
     * map rather than declared. A route that was deleted disappears from here by
     * construction — nothing has to remember to update a list.
     */
    channels: z.array(z.string()),
    /**
     * 🔴 `C-037` — **DOES THIS BRIDGE AUTHENTICATE, and where does the browser sign in?**
     *
     * Here rather than anywhere else for the reason this channel exists at all: it is asked
     * at CONNECT, _"before the operator can press anything"_ — and a console that learned
     * only by pressing a button and being refused would learn it in exactly the moment
     * `B-153` was filed about. It is answered to an UNAUTHENTICATED socket, because it is
     * the question such a socket exists to ask.
     *
     * ⚠ **OPTIONAL, and read as `off` when absent.** A bridge that predates auth cannot say,
     * and "cannot say" and "does not authenticate" are the same fact about that process — it
     * has no gate. Making it required would turn every old bridge into an
     * `invalid response for bridge.capabilities`, i.e. it would break the channel-list skew
     * report this same call exists to produce. There is no security cost: the gate is the
     * BRIDGE's, never the console's, so a console that guesses `off` against a bridge that
     * authenticates is simply refused with {@link AUTH_REQUIRED_REFUSAL} and shown the
     * sign-in by the refusal itself.
     */
    auth: AuthModeSchema.optional(),
    /**
     * Where the BROWSER posts its credentials — the Playout's D1 endpoint
     * (`POST /api/cg/auth/token`), absolute, as configured on this bridge.
     *
     * ADR 0010 rule 9: the browser obtains the token and the bridge only verifies, so the
     * bridge never sees a password. It advertises the address rather than the console
     * guessing one, because the console has no other way to know which Playout this bridge
     * trusts — and a console signing in to a DIFFERENT Playout would be refused here with
     * "not for this station" and never find out why.
     *
     * Absent when `auth` is `off`. Never carries a credential.
     */
    signInUrl: z.string().optional(),
    /** Where the browser refreshes (D2, `POST /api/cg/auth/refresh`). Absent when auth is off. */
    refreshUrl: z.string().optional(),
    /**
     * The Playout integration contract this bridge implements (`1.1` today — v1 plus D9).
     * A string, not a number: the contract's own versions are `1` and `1.1`.
     */
    authContractVersion: z.string().optional(),
    /**
     * 🔴 `DESKTOP-APPS-01` — **WHERE THIS STATION IS IN FIRST-RUN**, or absent once it is set up
     * (and always for a bridge that is not an installed station). Here, on the one channel an
     * unauthenticated socket may ask, because the console must know it before anybody can sign
     * in: in the `channel` phase the sign-in IS first-run's step 2.
     */
    setup: SetupPhaseSchema.optional(),
  }),
);

/**
 * ⭐ **THE ONE PLACE `auth` IS READ OFF A CAPABILITIES ANSWER.**
 *
 * Golden rule 6: the absent case has a meaning (a bridge that predates auth — no gate), and a
 * second site deciding what `undefined` means is how the two come to disagree. Everything
 * that asks "does this bridge authenticate" asks here.
 */
export function capabilitiesAuthMode(
  caps: { readonly auth?: AuthMode | undefined } | null,
): AuthMode {
  return caps?.auth ?? 'off';
}

/**
 * The namespaces the DESIGNER owns. `@cg/shared-ipc` is shared by both SPAs, so these
 * channels are exported here but are deliberately not part of the playout bridge.
 *
 * 🔴 **A default-DENY list**: anything outside it is required to be routed, so a new runtime
 * channel is covered the moment it is exported and the author has to either route it or
 * consciously declare it Designer-only.
 */
export const DESIGNER_ONLY_NAMESPACES = [
  'projects.',
  'assets.',
  'sharedImages.',
  'export.',
  'preview.',
] as const;

/** A request/response channel — `definePublishChannel` products have `payload`, not `request`. */
interface RequestChannelLike {
  readonly name: string;
  readonly request: unknown;
  readonly response: unknown;
}

function isRequestChannel(value: unknown): value is RequestChannelLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof (value as { name: unknown }).name === 'string' &&
    'request' in value &&
    'response' in value
  );
}

/**
 * 🔴 **Every request channel the RUNTIME owns, derived from this package's own exports.**
 *
 * ⚠ **It takes the module namespace as an ARGUMENT rather than importing the index**, and
 * that is deliberate: this module is part of the index, so importing it back would be a
 * cycle. Passing `import * as ipc from '@cg/shared-ipc'` in keeps ONE derivation for the two
 * callers that need it —
 *
 *   - `tools/caspar-bridge/tests/route-coverage.test.ts`, the BUILD-time guard: does the
 *     bridge source route every channel the SPA can call?
 *   - the Runtime's connect-time skew check (`B-153`), the RUN-time guard: does the bridge
 *     PROCESS I am actually talking to route them?
 *
 * The two ask the same question of different things, and they must not answer it from two
 * different lists — a build-time guard that passed while the run-time one used a narrower
 * rule would be worse than having neither.
 */
export function runtimeRequestChannelNames(ipcModule: Record<string, unknown>): string[] {
  return Object.values(ipcModule)
    .filter(isRequestChannel)
    .map((c) => c.name)
    .filter((name) => !DESIGNER_ONLY_NAMESPACES.some((ns) => name.startsWith(ns)))
    .sort();
}
