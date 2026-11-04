# Design

Expose an optional read-only root-frame observer, forward deduplicated Preview iframe reports, and display them beside elapsed time. Static roots retain an authored display projection.

Runtime observation is read-only and exceptions in observers cannot change broadcast playback.
Nested clocks never replace the root frame. A parked Hold stays fixed while its content repaints;
an authored Middle loop advances and wraps the displayed root frame through its actual range.
The current browser/gallery reconciliation is tracked separately in
`../reconcile-current-designer-gallery/`, with its own pending merged-build validation.
