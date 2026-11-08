# Design — live-plate foreground overlays (D-201)

## Why a second HTML page is required

The broadcast HTML page and an external route/decklink/media producer are separate CasparCG layers.
DOM `z-index` cannot place one element of the page above that external producer while leaving the
rest of the same page below it. The output is therefore split from one authored scene into:

1. a background pass on the item's ordinary CG layer, below the live-source band; and
2. a transparent foreground pass on one extra layer above every producer used by the item.

The scene stores only `liveForeground: true` on an element. A marked composition keeps its subtree;
a marked leaf keeps the composition ancestors required to position it. The background removes
marked roots. Direct package/browser use has no pass query and retains the historical full render.

## Synchronization and ownership

Both pages load the same immutable served package and initial field payload. Their URLs carry a
private item key and an explicit `background` or `foreground` pass. CasparCG directly plays both
pages. Afterwards the background page forwards update, stop, next, remove and coordinated-out calls
over a page-local `BroadcastChannel`; the foreground runtime applies the same lifecycle operation.
Only the background page receives a completion token, so one visual run can emit only one stop/out.

The foreground page is always volume zero. It is played at opacity zero before any live input is
seated and revealed only after the live producers and background CG PLAY have succeeded. Clear and
Remove hide it first, then clear its producer and mixer state.

## Layer planning and look travel

The foreground page consumes one layer from the same live-source band. The Bridge tries candidates
highest-first and admits live seats only below the chosen candidate. Capacity for inputs plus the
foreground page is decided before any AMCP command; insufficient capacity refuses the take
atomically. Foreground coordinates participate in the same ownership/orphan exclusions as live
seats.

Titles travel with frames by scene ownership, not by copying field data: the author keeps the title
inside the same composition/look unit as its plate. When look geometry moves that unit, both passes
evaluate the same transform and field values, while only the marked visual is painted above input.

## Compatibility

All new schema fields are optional. A carrier emits `foregroundOverlay` only when authored content
requests it. Templates without that signal keep their existing URL, one CG page and prior layer
demand. The paired pass uses `BroadcastChannel`, available in the supported CEF baseline.
