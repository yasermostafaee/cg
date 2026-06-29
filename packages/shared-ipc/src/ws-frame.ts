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

/** Browser → bridge: invoke a channel; correlate the reply by `id`. */
export const WsRequestFrameSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1),
  channel: z.string().min(1),
  payload: z.unknown(),
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
