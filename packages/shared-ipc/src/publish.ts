import type { z } from 'zod';

/**
 * Main → Renderer push channel: a stable name + a Zod schema for the
 * payload. Unlike request/response channels (`Channel`), pushes are
 * one-way and have no return value.
 *
 * Usage:
 *
 * ```ts
 * const StackStateChanged = definePublishChannel(
 *   'stack.state-changed',
 *   StackItemStateSchema.array(),
 * );
 *
 * // Main:    publish(webContents, StackStateChanged, snapshot);
 * // Preload: subscribe(ipcRenderer, StackStateChanged, (snapshot) => ...);
 * ```
 */
export interface PublishChannel<Payload extends z.ZodTypeAny> {
  readonly name: string;
  readonly payload: Payload;
}

export type AnyPublishChannel = PublishChannel<z.ZodTypeAny>;
export type PublishPayload<C extends AnyPublishChannel> = z.infer<C['payload']>;

export function definePublishChannel<Payload extends z.ZodTypeAny>(
  name: string,
  payload: Payload,
): PublishChannel<Payload> {
  return { name, payload };
}

/** Structural type for `WebContents` and `BrowserWindow#webContents`. */
export interface IpcPublisher {
  send(channel: string, ...args: unknown[]): void;
}

/** Structural type for `ipcRenderer`. */
export interface IpcSubscriber {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  off(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

/**
 * Main-side: validate `payload` against the channel's schema and push it
 * to a single WebContents. The schema parse is a guardrail against
 * accidental shape drift.
 */
export function publish<C extends AnyPublishChannel>(
  target: IpcPublisher,
  channel: C,
  payload: PublishPayload<C>,
): void {
  const validated = channel.payload.parse(payload) as PublishPayload<C>;
  target.send(channel.name, validated);
}

/**
 * Renderer-side: subscribe to a push channel. Returns an `unsubscribe`
 * function. The payload is validated on arrival; malformed payloads are
 * swallowed (with the optional `onError` callback) rather than crashing
 * the renderer.
 */
export function subscribe<C extends AnyPublishChannel>(
  source: IpcSubscriber,
  channel: C,
  listener: (payload: PublishPayload<C>) => void,
  onError?: (err: unknown) => void,
): () => void {
  const wrapped = (_event: unknown, raw: unknown): void => {
    try {
      const parsed = channel.payload.parse(raw) as PublishPayload<C>;
      listener(parsed);
    } catch (err) {
      if (onError !== undefined) onError(err);
    }
  };
  source.on(channel.name, wrapped);
  return () => {
    source.off(channel.name, wrapped);
  };
}
