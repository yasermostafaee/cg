import type { AnyChannel, ChannelRequest, ChannelResponse } from './channel.js';

/**
 * Minimal structural type for Electron's `ipcMain.handle`. Same rationale as
 * `IpcInvoker` — keeps this package free of `electron`.
 */
export interface IpcHandler {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
  ): void;
}

/**
 * Main-side: register a typed handler for a channel.
 *
 * The handler receives an already-validated request and is expected to
 * return a value matching the channel's response schema; the value is
 * validated on the way out as a guardrail.
 */
export function handle<C extends AnyChannel>(
  ipcMain: IpcHandler,
  channel: C,
  handler: (request: ChannelRequest<C>) => Promise<ChannelResponse<C>> | ChannelResponse<C>,
): void {
  ipcMain.handle(channel.name, async (_event, payload) => {
    const validatedReq = channel.request.parse(payload) as ChannelRequest<C>;
    const result = await handler(validatedReq);
    return channel.response.parse(result) as ChannelResponse<C>;
  });
}
