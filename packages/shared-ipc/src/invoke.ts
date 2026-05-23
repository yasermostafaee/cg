import type { AnyChannel, ChannelRequest, ChannelResponse } from './channel.js';

/**
 * Minimal structural type for Electron's `ipcRenderer.invoke`. The package
 * deliberately does not import `electron` directly — consumers wire it from
 * their preload script. This keeps `@cg/shared-ipc` runnable in plain Node
 * (for tests) and free of Electron's load order quirks.
 */
export interface IpcInvoker {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Renderer-side: send a request and await a typed, validated response.
 *
 * Validation happens on both ends of the wire: the request is parsed
 * before send (catches developer bugs early) and the response is parsed
 * on arrival (catches drift if Main returns the wrong shape).
 */
export async function invoke<C extends AnyChannel>(
  ipcRenderer: IpcInvoker,
  channel: C,
  request: ChannelRequest<C>,
): Promise<ChannelResponse<C>> {
  const validatedReq = channel.request.parse(request) as ChannelRequest<C>;
  const raw = await ipcRenderer.invoke(channel.name, validatedReq);
  return channel.response.parse(raw) as ChannelResponse<C>;
}
