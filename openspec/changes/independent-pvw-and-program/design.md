# Design

Use an additive Bridge route to enter browser-only PVW. The retained rehearsal record exposes a
preview-only fact; it never mutes or restores the CasparCG layer and does not gate Take. The old route
and its mute/interlock remain available for older clients. Keep local rendering, pending Inspector
state, and the Bridge's applied row data separate. The Take path uses applied data. Keep preview
through Play, Stop and Clear while the row remains bound. Preserve on-air eligibility and ownership
rules. Off-air Update saves a Pan crop for Take. The explicit Update on air path can apply a
verified crop to an existing seat under the Pan routing contract.
