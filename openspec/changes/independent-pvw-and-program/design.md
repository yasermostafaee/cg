# Design

Use an additive Bridge route to enter browser-only PVW. The retained rehearsal record exposes a
preview-only fact; it never mutes or restores the CasparCG layer and does not gate Take. The old route
and its mute/interlock remain available for older clients. Keep local rendering, pending Inspector
state, and the Bridge's applied row data separate. The Take path uses applied data. Keep preview
through Play, Stop and Clear while the row remains bound. Preserve on-air eligibility and ownership
rules. Off-air Update saves a Pan crop for Take. The explicit Update on air path can apply a
verified crop to an existing seat under the Pan routing contract.

The resident managed HTML page advertises support for live positioning. Bridge publishes positive
eligibility for that row while its producer is confirmed on air and the composition has no Live Source
plates or paired foreground, and the station has a single CasparCG server. The console stages anchor and pixel offsets like field values. Explicit
Update on air sends one field update with a typed position control. The output runtime reuses the
existing stage translation. The authored canvas and running lifecycle are preserved. Missing or stale
capability, unconfirmed ownership, or a refused send leaves the position draft available. The off-air
position route continues to store the override for the next Take.

Place ON PVW before Play in the column headings and each row. The Layers toolbar has Stop All and
Clear All. Remove remains an individual row action, with the existing guards and confirmation.
