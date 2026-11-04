# Change: Expand New Project format choices

PRD: `D-192` in `docs/prd/designer.md`; `B-384` in `docs/prd/bugs-runtime.md`.

## Why

New Project omits the standard 30 fps rate and gives its canvas presets ambiguous names. The linked
Duration field also draws its unit outside the input, so it does not line up with Total frames. An
architecture audit found that the stored resolution is a graphic footprint inside a fixed
1920×1080 reference, not an independently selectable output raster; presenting UHD/QHD/portrait as
full-frame presets would therefore promise geometry the current Runtime cannot preserve.

## What changes

- Add 30 fps to the shared frame-rate schema and derive the project IPC contract from it.
- Advance the rendering contract to 1.1.0 and read the manifest compatibility header before strict
  scene validation, so a 1.0 Runtime receives an actionable update refusal.
- Clearly name the safe Full HD reference, Small canvas and Square canvas footprints while retaining
  Custom.
- Keep UHD, QHD and portrait-FHD out until the project separates canvas footprint from output
  reference; keep non-square-pixel SD out until it can also express pixel aspect ratio.
- Render Duration with the existing in-field suffix primitive at the same width as Total frames.
- Prove save/reopen and `.vcg` export retain 30 fps and a chosen safe pixel raster.

## Impact

- Affected capability: `designer-shell` and Runtime template import compatibility.
- Affected contracts: shared `FrameRateSchema` and `projects.new` request validation.
- Affected UI: New Project dialog; Runtime's existing compatibility-refusal sentence.
- No migration is required; this is an additive schema value and the persisted resolution shape is
  unchanged.

An already-installed 1.0 Runtime cannot acquire the new manifest-first ordering retroactively and
may still report its strict schema error; the package declares the truthful 1.1.0 floor and updating
that station is the remedy.

## Deferred migration

True multi-format output needs a separately persisted output/reference raster, not another entry in
the existing footprint menu. It must be carried through page placement, Live Source geometry and
its template carrier, Runtime preview and Bridge routing before UHD/QHD/portrait can be labelled as
safe full-frame output. This change records that boundary and does not start the broad migration.
