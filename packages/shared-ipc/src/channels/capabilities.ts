import { z } from 'zod';
import { defineChannel } from '../channel.js';

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
  }),
);

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
