# Shared profile and reference geometry

The shared `@cg/ui` profile is version 1 with `aspect` (`auto`, `16:9`, `4:3`),
`standardVisible`, and up to 64 custom lines. Each line has a stable bounded ID,
an optional name up to 80 characters, `axis` (`x` vertical or `y` horizontal), a
finite 0–100 percentage and `visible`. A pure parser rejects unsupported versions,
unknown ratios, duplicate IDs, oversized sets and invalid positions. Parsing strips
unknown fields. Invalid saved JSON reads as the default without rewriting it.

Auto uses the active raster. Explicit landscape references are centred and
contained in that raster; they cannot extend into monitor letterbox. Both broadcast
boxes and custom percentages reference that rectangle. EBU R95 is the formal 16:9
reference; the same Action/Graphics margins at other ratios are proportional
composition guides, not a claim of an alternate EBU format standard.

The shared storage helper provides a stable subscribed snapshot, explicit validated
updates and refresh. Local-storage errors leave in-memory editing usable. The
Designer and Runtime keys are deliberately independent app-local preferences,
unrelated to a project, channel, station output or bridge configuration. Storage is
bounded before JSON parsing. No old key is renamed or removed, and malformed data
is overwritten only by a later explicit valid user edit.

Each app uses existing dark controls and popover mechanics. The current Safe areas
button remains the default-off session master switch. Settings expose a ratio,
broadcast-box checkbox and compact custom rows with visibility, name, percentage
and remove controls. Add horizontal/vertical actions create a 50% line. Editing a
profile enables its local preview so the adjustment is immediately visible.

Both overlays stay outside all template iframes and output/export paths. A reference
outline makes an explicit alternate ratio visible; custom labels remain screen-sized
while line positions follow active-picture fitting, zoom and pan.
