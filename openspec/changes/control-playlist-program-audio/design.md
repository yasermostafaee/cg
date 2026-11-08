## Ownership boundary

`playlistOf` identifies a source as the output of a Playout programme channel. Its Live Source copy
is a second route on a CG-owned layer and remains at zero under contract v1.3. Programme gain belongs
to the original Playout path, so the control requires a Playout endpoint; it is not implemented as
`MIXER ... VOLUME` against the Playout-owned playlist layer.

The first Playout response must settle:

- authenticated read and set endpoints, units/range and ramping;
- whether the value controls the playlist layer, channel master or another programme bus;
- persistence across clip changes, core restart and application restart;
- primary/backup mapping and failover semantics;
- whether programme adjustment remains allowed while a muted frame copy is on air.

Until those answers exist the UI may report the dependency, but it must not expose an enabled control.
