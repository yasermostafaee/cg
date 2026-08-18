// Public surface of @cg/shared-ipc.

export { defineChannel } from './channel.js';
export type { Channel, AnyChannel, ChannelRequest, ChannelResponse } from './channel.js';

export { invoke } from './invoke.js';
export type { IpcInvoker } from './invoke.js';

export { handle } from './handle.js';
export type { IpcHandler } from './handle.js';

export { definePublishChannel, publish, subscribe } from './publish.js';
export type {
  AnyPublishChannel,
  IpcPublisher,
  IpcSubscriber,
  PublishChannel,
  PublishPayload,
} from './publish.js';

export {
  WsFrameSchema,
  WsRequestFrameSchema,
  WsResponseFrameSchema,
  WsPublishFrameSchema,
  parseWsFrame,
  serializeWsFrame,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DEFAULT_BRIDGE_WS_URL,
  UNATTRIBUTED_ACTOR,
  MAX_ACTOR_LENGTH,
  normalizeActor,
} from './ws-frame.js';
export type { WsFrame, WsRequestFrame, WsResponseFrame, WsPublishFrame } from './ws-frame.js';

export * from './channels/common.js';
export * from './channels/stack.js';
export * from './channels/connections.js';
export * from './channels/layers.js';
export * from './channels/lock.js';
export * from './channels/projects.js';
export * from './channels/assets.js';
export * from './channels/sharedImages.js';
export * from './channels/export.js';
export * from './channels/preview.js';
export * from './channels/templates.js';
export * from './channels/audit.js';
export * from './channels/updates.js';
export * from './channels/settings.js';
export * from './channels/fixedLayers.js';
export * from './channels/playoutLayers.js';
export * from './channels/delimiters.js';
// R-030 — the per-channel output raster (bridge-owned) + the configured-vs-real
// video-mode verdict.
export * from './channels/channelSettings.js';
// R-022 — REHEARSE: a bridge-owned mode with a PLAY-to-air interlock.
export * from './channels/rehearse.js';
// D-137 / C-015 — the installation's symbolic-id → producer mapping, and the
// layer band those producers are placed on. ABSENT means NO MAPPINGS.
export * from './channels/sources.js';
