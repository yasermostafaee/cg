# Ticker image/logo separator (D-039 ext)

## Why

A ticker's separator is text-only today (a glyph like `•`). Branded crawls — a channel "bug" or
logo between headlines — are a common broadcast look that a text glyph can't express. Letting the
separator be an image/logo (from the project's assets OR the shared library) delivers that look,
reusing the existing image-asset pipeline.

## What Changes

- `TickerElementSchema.separator` widens from `string` to
  `string | { kind: 'image', assetId, source: 'project' | 'shared', size: { w, h } }` (still
  optional). This is a backward-compatible widening — every existing string separator stays valid —
  so **no schema-version bump and no migration** are needed (proven by parse/round-trip tests).
  `size` is an explicit `w`×`h` box (not a single dimension) so the treadmill has a deterministic
  separator width with no asynchronous image measurement.
- The runtime renders an image separator as its own `<img>` node BETWEEN items only (never trailing
  — the D-081 rule already holds for separators), vertically centred, at the authored `size`. Its
  `src` resolves through the same two-source seam as image elements: the node carries
  `data-cg-asset-id` / `data-cg-asset-source` for the host `assetUrls` walk (static authoring row +
  export), and the driver also sets `src` from the resolved URL on the nodes it FEEDS during the
  live crawl (which the one-time walk cannot reach).
- The export collector inlines an image separator's bytes exactly like an image element (same
  collector + two-source resolver), so preflight reports a missing separator image.
- The ticker inspector's separator control becomes Text-or-Image: for Image, pick from the project's
  assets OR the shared library, with a size (w×h) box.

## Impact

- Affected specs: **designer-ticker-element** (ADDED — "Image/logo ticker separator").
- Affected code: `@cg/shared-schema` (`elements.ts` — the union + a named image-separator schema),
  `@cg/template-runtime` (`ticker-driver.ts` image-separator feed + static row, `runtime.ts` URL
  resolution), `@cg/designer` (`TickerSeparatorControl` + the export collector
  `collectImageElements`, and the preview passing `assetUrls` to `createRuntime`).
- **No** schema-version bump / migration (additive widening), no `.vcg` format change beyond the
  already-existing image-inlining path.
