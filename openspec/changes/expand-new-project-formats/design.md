# Design: Standard New Project formats

## Decisions

### 30 fps is a domain value, not a UI-only exception

`FrameRateSchema` is the source of truth for scenes and manifests. The `projects.new` request SHALL
reuse that schema rather than maintaining a second numeric union. Runtime and export frame clocks
already divide/multiply by the stored numeric rate and have no per-rate branch, so 30 needs no
special playback path.

### 30 fps advances the rendering contract

`CG_RUNTIME_VERSION` advances from 1.0.0 to 1.1.0. Although frame clocks are generic, a 1.0
Runtime's strict scene and manifest schemas do not admit the new enum value, so a 30 fps package
requires the new contract and the Designer exporter must say so.

`B-196` originally compared `minRuntimeVersion` after `verify → unpack`. That cannot produce its
actionable message when the older strict parser rejects a newer value first. `B-384` therefore reads
only `manifest.json` and only its name/runtime-floor header before strict verification. This header
reader is deliberately forward-compatible and inflates no assets. When it cannot read a valid
header, Runtime defers to the existing verification path so damaged, non-template and invalid
packages retain their established classification.

The injectable available-version argument is a test seam proving that a 1.0 station would refuse a
30 fps / 1.1 package by name and both versions. A 1.0 binary already installed before this code
cannot be fixed by changing package bytes and may still expose its schema error; updating it is the
only honest remedy. The manifest floor protects current and future contract transitions.

### Presets describe footprints inside the fixed reference

The scene contract stores only integer `width` and `height`; the Designer canvas and exported HTML
interpret those as square CSS pixels. On air, however, `outputTranslate()` places that footprint
inside the fixed 1920×1080 `REFERENCE_FRAME`, and `outputScale()` maps that reference—not the scene
resolution—to the channel raster. A centered 3840×2160 scene would therefore translate negatively
and then scale again on a UHD channel, visibly cropping the result.

The preset list consequently contains only 1920×1080 Full HD reference, 1280×720 Small canvas and
1080×1080 Square canvas, all of which fit the current reference, plus Custom for the existing
explicit-footprint workflow. The smaller choices say “canvas” so an operator does not read them as
a promise to fill a same-sized output channel.
UHD, QHD and 1080×1920 portrait are deliberately absent until a separately persisted output
reference is carried through page, Live Source, Runtime and Bridge geometry. PAL/NTSC SD dimensions
are also omitted because their intended display aspect requires pixel-aspect metadata the project
schema cannot preserve.

FHD remains the default so expanding the menu does not silently change newly created projects.
Preset state uses stable keys rather than array indexes, allowing the list to be reordered without
changing the selected meaning.

### Linked numeric fields reuse the common primitive

Both Total frames and Duration use the shared bare `NumberField`. Its `.cg-field` border contains
the optional suffix, so `s` is inside Duration and both value columns occupy the same grid width.
No new raw number-control implementation is introduced.

## Validation

- Shared-schema and IPC contract tests accept 30 fps.
- Runtime compatibility tests model a 1.0 station and prove a readable manifest-first refusal.
- Designer unit tests cover exact 30 fps duration conversion and all preset mappings.
- ProjectStore and VCG pack tests cover persistence/export of a 30 fps Small canvas.
- A browser test covers visible options, aligned fields, selection and the resulting Studio status.
