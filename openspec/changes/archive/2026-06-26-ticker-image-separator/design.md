# Design — Ticker image/logo separator (D-039 ext)

## Non-breaking, no migration

`separator` widens from `string` to `string | image` (still optional). The union still accepts
every existing string separator, so old tickers parse and render unchanged. Per the explicit
decision on this branch there is **no `CURRENT_SCHEMA_VERSION` bump and no migration entry** —
proven by parse/round-trip tests (old string separator stays valid; new image separator preserves
its fields).

## Why `size` is `{ w, h }`, not a single dimension

The treadmill measures every node's width to lay out the crawl. A single `size` (a height) would
force width = naturalAspect × height, which needs the image to have LOADED (async, and untestable
in jsdom). An explicit `w`×`h` box gives the driver a deterministic separator width with zero image
measurement — the feed math (`cycleWidth`, `placeFed`) treats it exactly like a measured text width.
`object-fit: contain` fits the logo within the box.

## src resolution — two surfaces, one seam

Image elements emit `<img data-cg-asset-id>` and a single `applyAssetUrls` walk sets `src` from a
host `assetUrls` map (assetId→URL; the source is baked into the map host-side). The separator reuses
this:

- **Static authoring row** (scene-builder, built once): the separator `<img>` carries
  `data-cg-asset-id` / `-source`, so the existing walk (Designer canvas + export) wires `src` — no
  URL needed at build, exactly like an image element.
- **Live crawl** (driver-fed nodes, created mid-crawl): the one-time walk can't reach them, so
  `runtime.ts` resolves the URL from `options.assetUrls` and passes it to the driver, which sets
  `img.src` directly on each fed separator. The node still carries `data-cg-asset-id` so a host
  re-walk wires it when no URL was known yet (the Designer preview, which now also passes its
  `assetUrls` to `createRuntime`). This mirrors the existing dynamic-image (repeater) handling.

## Pool isolation

The driver pools `<span>` item nodes and reuses them on recycle. Image-separator `<img>` nodes must
never re-enter the span pool (an item `acquire()` would then get an `<img>`), so `release` routes by
tag name into a SEPARATE `imgPool`. A regression test sweeps past several recycles and asserts every
item node stays a `<span>` and every separator stays an `<img>`.

## Export inlining

`collectImageElements` (the single "which images does this export need" source for packaging /
inlining / preflight) gains a `ticker` branch: an image separator contributes an `ImageRef`
(`assetId` + `source`), keyed `${ticker.id}:sep`, so export inlines its bytes and preflight reports
a missing one — exactly like an image element.
