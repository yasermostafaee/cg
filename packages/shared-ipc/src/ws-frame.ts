import { z } from 'zod';

/**
 * Browser↔bridge WebSocket **frame envelope** (C-001). Defined once here so
 * both the Node bridge (`@cg/caspar-bridge`) and the browser `WebSocketRuntime`
 * share exactly one wire framing. The envelope only carries the *transport*
 * concern (kind + correlation id + channel name); the inner `payload` is the
 * existing `@cg/shared-ipc` channel request / response / publish schema,
 * validated against that channel at the boundary.
 *
 * This is NOT a low-level AMCP/OSC byte protocol — it is the same typed
 * request/response + publish contract `MockRuntime` already implements,
 * serialized as JSON frames over one socket.
 */

/**
 * What the audit record writes when a console has NOT been given an operator name.
 *
 * 🔴 It is a WORD FOR A STATE, not a role and not a plausible name, and the choice is
 * the point. The previous constant was `operator`, which was honest while it was the
 * only value any row could carry — but the moment SOME rows carry a typed name, a row
 * reading `operator` becomes ambiguous between "this console was never configured" and
 * "somebody named this console operator". An unset value that can be mistaken for a
 * real answer is the `assumed` failure one level out (B-143): the system knows it does
 * not know, and says something that reads as knowing.
 */
export const UNATTRIBUTED_ACTOR = 'unattributed';

/**
 * 🔴 `SELF-STOP-24` / `C-013` — **what the record writes when THE TEMPLATE took its own row
 * off air**, because its content had finished and nobody pressed anything.
 *
 * The first non-operator actor this system has had. Every other append answers either a typed
 * console name or {@link UNATTRIBUTED_ACTOR}, and neither would do here: a console name would be
 * a lie, and "unattributed" would file a graphic ending its own run in the same bucket as
 * housekeeping — while the ONE question this row exists to answer is *why did that row come off
 * air when nobody touched it*.
 *
 * ⚠ **RESERVED, not conventional.** A console's name is typed by a human who is free to type
 * anything, so {@link normalizeActor} REFUSES this value from the wire (see there for why the
 * refusal is after trimming and case-insensitive). Without that a console called `template`
 * would be indistinguishable in the log from the templates themselves.
 *
 * ⚠ The ACTION stays `stop`. It is the same verb reaching air by the same path; only who asked
 * differs, which is exactly what an actor field is for.
 */
export const TEMPLATE_ACTOR = 'template';

/** Longest operator name accepted on the wire; a label, not a free-text field. */
export const MAX_ACTOR_LENGTH = 64;

/**
 * Reduce whatever a console offered to the value the record will carry.
 *
 * Defined HERE, beside the frame it travels in, so the sender and the recorder cannot
 * disagree about it — the browser normalises before sending and the bridge normalises
 * again on arrival, and both get the same answer because it is the same function. A
 * bridge that trusted the wire would let a blank string become an `actor` that reads
 * as attributed while naming nobody.
 *
 * @param raw whatever was configured / received; anything unusable is unattributed
 */
export function normalizeActor(raw: unknown): string {
  if (typeof raw !== 'string') return UNATTRIBUTED_ACTOR;
  const trimmed = raw.trim().slice(0, MAX_ACTOR_LENGTH).trim();
  if (trimmed === '') return UNATTRIBUTED_ACTOR;
  /*
    🔴 `SELF-STOP-24` — {@link TEMPLATE_ACTOR} IS NOT A NAME A CONSOLE MAY CLAIM.

    ⚠ **After the trim, and case-insensitive, and both halves are load-bearing.** Placed before
    the trim it is defeated by a leading space; compared exactly it is defeated by a capital
    letter. Either way a console ends up indistinguishable in the log from the templates
    themselves, which is the one distinction the constant exists to make.

    ⚠ **Whole-name, never a banned substring.** Refusing anything CONTAINING it would take
    "Template Suite 2" away from a gallery that had every right to it, silently and for a reason
    nobody at that console could discover.
  */
  if (trimmed.toLowerCase() === TEMPLATE_ACTOR) return UNATTRIBUTED_ACTOR;
  return trimmed;
}

/**
 * Browser → bridge: invoke a channel; correlate the reply by `id`.
 *
 * ⚠ `actor` stretches this envelope's stated remit (transport only) and does so
 * deliberately. Attribution is per-REQUEST metadata that applies identically to every
 * channel; the alternative is adding the same field to N channel request schemas, which
 * is N chances to forget one and a change to the SPA contract on every one of them. It
 * is OPTIONAL so that an older browser, or any client that declines to say, still gets
 * its request served — and recorded as {@link UNATTRIBUTED_ACTOR}, never dropped.
 *
 * 🔴 It is SELF-DECLARED and UNVERIFIED. The control socket is unauthenticated
 * loopback: this field answers "which console, as labelled", never "which person,
 * proven". Nothing downstream may treat it as identity.
 */
export const WsRequestFrameSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1),
  channel: z.string().min(1),
  payload: z.unknown(),
  actor: z.string().max(MAX_ACTOR_LENGTH).optional(),
});
export type WsRequestFrame = z.infer<typeof WsRequestFrameSchema>;

/** Bridge → browser: the reply to a `request`, carrying a payload or an error. */
export const WsResponseFrameSchema = z.object({
  type: z.literal('response'),
  id: z.string().min(1),
  payload: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});
export type WsResponseFrame = z.infer<typeof WsResponseFrameSchema>;

/** Bridge → browser: an unsolicited push (maps to a `definePublishChannel`). */
export const WsPublishFrameSchema = z.object({
  type: z.literal('publish'),
  channel: z.string().min(1),
  payload: z.unknown(),
});
export type WsPublishFrame = z.infer<typeof WsPublishFrameSchema>;

/**
 * 🔴 `C-037` / ADR 0010 rule 1 — **Browser → bridge: ESTABLISH THIS SOCKET'S PRINCIPAL.**
 *
 * The fourth member, and the first one that is not a channel call. It carries a
 * Playout-issued JWT; the bridge verifies it OFFLINE (ES256 against the Playout's cached
 * JWKS) and holds the resulting principal for the life of THIS socket. The reply is an
 * ordinary {@link WsResponseFrameSchema} correlated by `id`, carrying the `auth.state`
 * payload on success and an error sentence on refusal — so a console needs no second
 * mechanism to learn the answer.
 *
 * ── WHY A FRAME AND NOT A CHANNEL ───────────────────────────────────────────
 *
 * Because the gate that will refuse every channel has to be able to run BEFORE this arrives,
 * and a door spelled as one of the things behind the door is a carve-out somebody has to
 * remember. As a frame type it is outside the route table by construction: the census that
 * walks every route cannot miss it, because it is not a route. `auth.state` and
 * `auth.sign-out` ARE channels, because they are reads and writes of a principal that by
 * then exists.
 *
 * 🔴 **The SCHEMA is the boundary.** `token` is a non-empty string here, so a frame carrying
 * a number, an object, or nothing at all is refused by {@link parseWsFrame} before a single
 * byte of it reaches a verifier. Cryptographic code should never be the first thing to see a
 * malformed input.
 *
 * ⚠ It replaces nothing. `actor` on a request frame stays exactly what it was — self-declared
 * and unverified — and when a principal exists the bridge simply stops consulting it.
 */
export const WsAuthFrameSchema = z.object({
  type: z.literal('auth'),
  /** Correlation id for the reply, exactly as a `request` frame's. */
  id: z.string().min(1),
  /** The compact-serialized JWT. Never logged, never persisted bridge-side. */
  token: z.string().min(1),
});
export type WsAuthFrame = z.infer<typeof WsAuthFrameSchema>;

/** Any frame on the wire. */
export const WsFrameSchema = z.discriminatedUnion('type', [
  WsRequestFrameSchema,
  WsResponseFrameSchema,
  WsPublishFrameSchema,
  WsAuthFrameSchema,
]);
export type WsFrame = z.infer<typeof WsFrameSchema>;

/** Parse + validate a raw wire string into a typed frame, or `null` if invalid. */
export function parseWsFrame(raw: string): WsFrame | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = WsFrameSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Serialize a frame for `WebSocket.send`. */
export function serializeWsFrame(frame: WsFrame): string {
  return JSON.stringify(frame);
}

// ── Bridge endpoint defaults ──────────────────────────────────────────────
//
// Loopback-only by default (enforced at the bridge's socket bind). The port is
// deliberately browser-**safe** — the Runtime SPA dev server's own default of
// 6000 is on Chrome's ERR_UNSAFE_PORT blocklist; 5280 is not.

/**
 * Default host the bridge BINDS. ⚠ Not the host the browser probes: since `P-041` the
 * Runtime derives its bridge host from the page's own origin (`apps/runtime/src/platform/
 * bridgeUrl.ts`) and uses this only as the loopback fallback when there is no page origin
 * to follow. Client code importing it is refused by `cg/no-hardcoded-origin`.
 */
export const DEFAULT_BRIDGE_HOST = '127.0.0.1';
/** Default bridge WebSocket port (browser-safe). The browser keeps this and swaps the host. */
export const DEFAULT_BRIDGE_PORT = 5280;
/**
 * The bridge's default bind URL — what a SAME-HOST client reaches it at. A browser on
 * another machine must not probe this (its own loopback); see `bridgeUrlFor`.
 */
export const DEFAULT_BRIDGE_WS_URL = `ws://${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`;
