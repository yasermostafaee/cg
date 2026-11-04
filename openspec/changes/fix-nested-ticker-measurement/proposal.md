# Fix ticker spacing inside hidden or scaled compositions

## Why

The owner reports overlapping Persian crawl text in a large composition while the same ticker
works when opened directly. A live Preview regression reproduces widths of 505–667 screen pixels
with item starts only 72 pixels apart. Static authoring layout is correct and did not expose it.

## What Changes

- Measure each uncached headline in the owning document with the ticker's computed typography,
  outside hidden composition ancestors and their transforms.
- Remove the probe immediately; only actual crawl items remain in the live track.
- Keep bounded width caching, per-cycle font remeasurement, stable-id reconciliation and speed.

## Impact

- FULL lane: shared on-air rendering in `@cg/template-runtime`.
- No schema, wire or authored-data changes.
- Browser regression checks both the static row and the moving nested ticker.
