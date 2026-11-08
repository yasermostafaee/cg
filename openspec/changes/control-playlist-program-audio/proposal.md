## Why

Operators need to adjust the Playlist programme output's sound when its picture is not used in any
on-air Live Source frame. The existing frame route must stay muted: the Playout v1.3 contract says a
Playlist `route://N-L` copy above zero duplicates programme audio by approximately +6 dB.

## What Changes

- Add programme-output gain as a Playout-owned, authenticated control.
- Report whether the output is currently referenced by any on-air frame.
- Preserve `VOLUME 0` on every Playlist route-copy layer.

Implementation is gated on a Playout API that defines read/set semantics, range, persistence,
authorization and A/B behaviour. CG Bridge SHALL NOT guess these with AMCP against Playout's layer.

## Capabilities

### Modified Capabilities

- `runtime-ui`
- `runtime-playout-sources`
- `runtime-caspar-bridge`

## Impact

Playout team contract, Bridge client/IPC, CG Control audio surface and on-air ownership guards.
