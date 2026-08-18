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
  return trimmed === '' ? UNATTRIBUTED_ACTOR : trimmed;
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

/** Any frame on the wire. */
export const WsFrameSchema = z.discriminatedUnion('type', [
  WsRequestFrameSchema,
  WsResponseFrameSchema,
  WsPublishFrameSchema,
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

/** Default host the bridge binds and the browser probes. */
export const DEFAULT_BRIDGE_HOST = '127.0.0.1';
/** Default bridge WebSocket port (browser-safe). */
export const DEFAULT_BRIDGE_PORT = 5280;
/** Default bridge WebSocket URL the browser probes at boot. */
export const DEFAULT_BRIDGE_WS_URL = `ws://${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`;
