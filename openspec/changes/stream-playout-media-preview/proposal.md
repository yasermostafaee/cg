# Stream Playout media previews in the source picker

## Why

Operators need to watch and listen to a library clip before assigning it. Playout
2.19.0-externalcg.16 provides verified file, proxy and poster resources. The existing
position-aware snapshot player provides a fallback for older servers.

## What Changes

- Add typed media-open and media-close requests to the Runtime Bridge.
- Resolve a known library item on the serving A or B Engine with that Engine's
  authenticated session, channel mapping and verified media identity.
- Stream file, proxy and poster resources through a renewable, socket-owned Bridge
  grant. Forward byte-range semantics and cancellation through the streaming transport.
- Use a native video player in the source picker's existing Grid and List preview
  surfaces, with local playback, seeking and optional listening.
- Preserve the sampled player when the Bridge or Playout media API is unsupported.
- Release previews when their owner closes, signs out, loses authorization, changes
  the source, or covers the dialog.

## Impact

- `runtime-playout-sources` gains compatible streamed media playback in its source picker.
- `runtime-caspar-bridge` gains verified media manifests and resource-scoped HTTP relays.
- Runtime's media CSP permits the configured Bridge's HTTP(S) media transport.
- No persisted user data migration is required.
