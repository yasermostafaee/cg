## Why

Operators need to adjust the Playlist programme output's sound when its picture is not used in any
on-air Live Source frame. The existing frame route must stay muted: the Playout v1.3 contract says a
Playlist `route://N-L` copy above zero duplicates programme audio by approximately +6 dB.

## What Changes

- Add programme-output gain as a Playout-owned, authenticated control.
- Report whether the output is currently referenced by any on-air frame.
- Preserve `VOLUME 0` on every Playlist route-copy layer.

The [2.18.17 Playout API](../../../docs/integration/playout/source-previews-2.18.17-adoption.md)
defines read/set semantics, range, persistence, authorization and peer replication. CG Bridge
will use that API and preserve the existing routing and mixer ownership boundary.

## Capabilities

### Modified Capabilities

- `runtime-ui`
- `runtime-playout-sources`
- `runtime-caspar-bridge`

## Impact

Playout team contract, Bridge client/IPC, CG Control audio surface and on-air ownership guards.
