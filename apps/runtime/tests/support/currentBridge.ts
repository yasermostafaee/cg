import * as ipc from '@cg/shared-ipc';

/**
 * `CENTRAL-BRIDGE-01` — what a CURRENT bridge answers `bridge.capabilities`: every channel this page
 * calls, and this console's own release. A fake that stands for today's bridge answers with this; one
 * that answers nothing is read as an older release, and the console then sends nothing (the version
 * gate) — which is right for a real old bridge and wrong for a fake that means to be current.
 */
export function currentBridgeCapabilities(): ipc.ChannelResponse<
  typeof ipc.BridgeCapabilitiesChannel
> {
  return { channels: ipc.runtimeRequestChannelNames(ipc), bridgeVersion: __CG_BUILD__.version };
}
