# Guide geometry and visibility

The official [EBU R95 v1.1 recommendation](https://tech.ebu.ch/docs/r/r095.pdf),
note 5, gives per-edge Action margins of 3.5% and Graphics margins of 5%.
These are 93% and 90% protected widths and heights. The HD examples in
[SMPTE ST 2046-1:2009](https://pub.smpte.org/pub/st2046-1/st2046-1-2009.pdf),
section 5, match those proportions and round protected sizes to whole samples:
1920×1080 yields 1786×1004 Action and 1728×972 Graphics. Custom rasters use the
same proportional guide; no legacy 80% title area or alternate-aspect protection is implied.

One pure `@cg/ui` helper owns those numbers. Each renderer draws local SVG chrome
with contrasting Action/Graphics strokes and labels. Non-scaling strokes and
screen-sized labels remain readable at different zoom levels. Pointer events are
disabled so the guides cannot intercept editing or source controls.

Designer places the SVG at the displayed frame offset inside the scrolling stage,
using its current composition raster and zoom. Existing authored `scene.safeAreas`
is neither read as a guide profile nor changed. Visibility lives in the session
view slice and creates no document/history mutation.

PVW centres one overlay at the same fitted raster as the checker and rehearsal
frames. A passive observer measures the PreviewPanel stage, so empty and loading
states show the same reference before a template page is available. Black monitor
letterbox is excluded. Its toggle is local PreviewPanel
state. Neither app injects guides into an iframe, serialized scene, template page,
PGM consumer or export. No new configuration or persistence contract is introduced.
