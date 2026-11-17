# Read provenance and independent targets

`RoutedSourceReads` partitions each logical-source request between two existing
preview/audio clients. Each client retains its own target, bearer, lease lifecycle
and rate limits. The Bridge prepares selectors from observed catalogue data before
dispatch. B inputs use the reserve D10 logical mapping and B-local input ID;
Playlist selectors use the mapped B physical pair and require a current D10 epoch.
Media uses a fingerprint-matched B-local D11 ID. Names and A producer IDs are not joins.

Verified monitor topology selects the preferred read server. Explicitly missing
sources can fall back to a confirmed available peer. Native media and poster reads
try independently resolved targets in preference order. Unknown presence does not
pretend that a source is missing. Unsupported C/D targets are not guessed as A/B.
All requests remain under the actor's declared-channel and lock fence, with B's
independent station session. Upstream-token budgets are shared across console owners
that use the same B session. Cached selectors and route choices are bounded.

Live checks reserve their latest per-owner intent before awaiting source resolution.
Stop cancels only the matching pending handle; logout, disconnect and disposal cancel
all of that owner's preparation. PVW uses a separate latest-view generation, so a
slow earlier lookup cannot replace a newer view. Cancellation is threaded into
selector-cache publication. Passive thumbnails and meters do not advance PVW's
generation and therefore cannot starve its source preparation.

The read-only `sourcePreviewable` predicate is distinct from `sourceSeatable`:
a source unavailable or departed on A can still be resolved and previewed on B.
Output seating continues to use the existing source-seating policy.

Frame and media metadata identifies the delivering engine. Availability colors
continue to describe presence. Each rendered surface emphasizes the existing A/B
badge border only when its image/video actually decodes. A retained A frame keeps
its A emphasis while B is connecting. Decode failure or a placeholder clears that
surface's provenance; another surface's player cannot relabel the retained poster.

There is no programme take, source binding, active-server transfer or output write
in this read fallback. Selection continues through the existing Select action.
