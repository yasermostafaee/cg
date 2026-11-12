# Design

Use an additive Bridge route to enter browser-only PVW. The retained rehearsal record exposes a
preview-only fact; it never mutes or restores the CasparCG layer and does not gate Take. The old route
and its mute/interlock remain available for older clients. Keep local rendering, pending Inspector
state, and the Bridge's applied row data separate. The Take path uses applied data. Keep preview
through Play, Stop and Clear while the row remains bound. Preserve on-air eligibility and ownership
rules. Off-air Update saves a Pan crop for Take. The explicit Update on air path can apply a
verified crop to an existing seat under the Pan routing contract.

The resident managed HTML page advertises support for live positioning. Bridge publishes positive
eligibility on a single-primary station after verifying the page, any paired foreground and
its visible live seats. The console stages the anchor and pixel offsets like field values.
Explicit Update on air sends one field update with a typed position control. The output runtime
reuses its stage translation and the paired foreground receives the same position. Bridge
stages corresponding FILL and CLIP changes on the existing visible seats and commits them after
the page update. The authored canvas, crop and running producers are preserved. Saved crops
follow the position across authored Looks, and parked seats receive no commands for the move.

Bridge validates the translated geometry and the same seat identities before sending. It
refuses a move that places a visible seat entirely outside the channel raster. An unsupported
move, stale capability or a refused send leaves the position draft available. When
the Update also changes source bindings or a crop, the console applies changed fields and
bindings first, then the draft from **Crop input** against the current guide, then Position
against the resulting verified seats.
Rejected and unsent drafts remain available. The off-air route continues to store the override
for Take.

Layers and Inspector compare each Position draft with the same applied placement. A Position-only
edit lights the existing row draft badge and enables its Update action. The badge remains while
the draft differs from the applied placement and clears when all drafts are resolved.

Place ON PVW before Play in the column headings and each row. The Layers toolbar has Stop All and
Clear All. Remove remains an individual row action, with the existing guards and confirmation.
