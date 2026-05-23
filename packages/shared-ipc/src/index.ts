// Public surface of @cg/shared-ipc.

export { defineChannel } from './channel.js';
export type { Channel, AnyChannel, ChannelRequest, ChannelResponse } from './channel.js';

export { invoke } from './invoke.js';
export type { IpcInvoker } from './invoke.js';

export { handle } from './handle.js';
export type { IpcHandler } from './handle.js';

export * from './channels/common.js';
