import type { z } from 'zod';

/**
 * A typed Electron IPC channel: a stable name plus Zod schemas for the
 * request and response payloads.
 *
 * Channels are defined once, then consumed by both sides:
 *   - Main process calls `handle(ipcMain, channel, async (req) => res)`.
 *   - Renderer (via preload) calls `invoke(ipcRenderer, channel, req)`.
 *
 * Both sides validate against the same schemas, so type drift between
 * processes is caught at the boundary, not deep inside business logic.
 */
export interface Channel<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny> {
  /** Wire name. Convention: `<area>.<verb>` (e.g., `stack.take`, `templates.list`). */
  readonly name: string;
  readonly request: Req;
  readonly response: Res;
}

/** Convenience alias for "any channel" — used in generic helper signatures. */
export type AnyChannel = Channel<z.ZodTypeAny, z.ZodTypeAny>;

/** Inferred request type for a channel. */
export type ChannelRequest<C extends AnyChannel> = z.infer<C['request']>;

/** Inferred response type for a channel. */
export type ChannelResponse<C extends AnyChannel> = z.infer<C['response']>;

/**
 * Factory for type-safe channels. Pin the schemas at the call site so
 * downstream `invoke`/`handle` get full inference:
 *
 * ```ts
 * const Hello = defineChannel(
 *   'hello.greet',
 *   z.object({ name: z.string() }),
 *   z.object({ message: z.string() }),
 * );
 * ```
 */
export function defineChannel<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(
  name: string,
  request: Req,
  response: Res,
): Channel<Req, Res> {
  return { name, request, response };
}
