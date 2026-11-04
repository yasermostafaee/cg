# Measurement independent of the composition lifecycle

The nested scope can start its crawl while the parent remains `display:none` during its entrance.
The prior measuring span lived in that track, so layout returned zero and the cache retained it.
Later display restored the real text width without restoring the spacing bookkeeping.

The probe now temporarily joins the owning document body, copies the band's font and spacing
properties, uses intrinsic `max-content` width and is removed synchronously after measurement.
It is hidden and absolutely positioned, so it neither paints nor contributes normal-flow layout.
The injected measurement hook remains available for deterministic unit tests. Local layout pixels
remain the coordinate system; a parent scale never scales the width twice.

The browser regression starts the actual exported parent composition's crawl. Geometry is measured
in Chrome, not jsdom. Unit tests verify ownership, typography copying, cleanup and reconciliation.
