# Design

The local cue is keyed by stack item and is not an applied stack value or a dirty field.
The Inspector writes this cue on and off air. Starting rehearsal captures an initial cue
from the row's authored/applied preset; a programme request preserves that baseline before
it can publish a new applied preset. Acknowledgements never replace a newer or older local cue.

The former Designer-only `followAcceptedLayerPreset` acknowledgement path is removed.
Stopping rehearsal no longer prunes preview selection. Existing authoritative stack-lifecycle
housekeeping removes the cue only when the row actually leaves the confirmed stack.

Row preset buttons remain enabled off air under their existing connection/permission gates.
They store the first preset for the next Take and display `PGM · FIRST`. Live row preset and
Focus actions use their existing programme request/transition path and display `PGM · NOW`.
Neither changes the preview cue. The Inspector's selected tab and PVW use the same local value.
An on-air status also outranks a stale legacy-rehearsal flag, so a live action cannot be
mislabelled as selecting the first preset.

Tests cover both Designer and New live layout controls, pending acknowledgements, re-presses,
Focus, refused updates, stop/play and rehearsal removal/re-entry. An existing browser setup now
waits for the native common seat as well as the page's on-air marker before inspecting it.
