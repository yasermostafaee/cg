# Session AO — 1.5c UNIT B: the z-order punch reaches the render path

**Read at `beb3f01bfbdca29a8bb49f766fbcced993a118f4`** (`git pull --ff-only` → "Already up to
date"; tree clean). Shipped as **`efe13f6`**, remote verified.

## What was built

`§9a-Z`, in the product. Each element is masked with the union of the rects of the plates ABOVE it
in **paint order**, so a designed opaque backdrop shows the live picture through its plates — and a
caption authored ABOVE a plate still paints over it, which is the half that killed the simpler
"mask everything below" rule.

- **The flattener moved** from `@cg/vcg-format` (module-private) to
  `@cg/shared-schema/scene-flatten.ts`. The render side needed the same geometry and the two
  packages are siblings. This is 6.2a's move made a second time, for the same reason: **the hole
  the page PUNCHES and the hole the bridge FILLS are now one computation.** `collectLiveSources`
  consumes it; its output is unchanged (document sibling order preserved, 108 vcg-format tests
  green, `live-sources.ts` at 100%).
- **The kernel is now a 2×3 affine**, because the punch needs the map BACKWARD — a plate's scene
  rect expressed in the local box of an element below it — and an inverse cannot be spelled in the
  point-mapping form. `localToParent` is DERIVED from it rather than spelled twice; the original
  `off-frame.ts` formula is written out once **in the test**, as the reference the derived kernel
  must agree with on four transforms × five points.
- **Holes are in the masked element's OWN box.** A CSS mask applies before the element's transform
  and before every ancestor's, so scene px would double-count the whole chain. Exact for any
  axis-aligned chain at any depth; where the masked element's own chain ROTATES the pulled-back
  rect is re-bounded — an over-punch, never an under-punch.
- **Keyed by composition-instance PATH**, not bare element id: one hole cannot be right for two
  instances of the same composition.
- `null` means **no mask property is emitted at all**, pinned across all eight properties via
  `LIVE_SOURCE_MASK_PROPERTIES`.
- The punch is **unconditional** and follows the plate's **visibility**, never its assignment.
  **No preview special case.**
- `mask-mode: luminance` + `-webkit-mask-source-type: luminance` travel **inside** the mask value
  and are applied in one place. Without them the identical SVG is a no-op.
- **Containers and compositions are not masked; their children are, individually** — masking a
  container would mask anything the author put above the plate inside it. A sequence/repeater IS
  masked as one element, so its runtime stamps inherit the punch by subtree.

Tests lead with a **positive control** that the mask punches at all. Every later absence assertion
depends on it, and skipping exactly that control is what let a no-op read as "mechanism B fails".

## 🔴 1.5c is NOT ticked, deliberately

Its acceptance is "**assert the punched pixel, never the presence of a `mask-image` style**", and
"the assertion must be against the exported artifact and not the builder". That is UNIT C, which
this session's brief explicitly placed out of scope. UNIT B is what shipped; ticking 1.5c on it
would be a claim, not a discharge.

**No E2E spec was added.** The punch's visible effect requires a compositor layer beneath the page,
which no browser test has — there is nothing under a Playwright page to show through. The built-DOM
assertions are the strongest check available short of the plant. The exported-artifact assertion
(UNIT C) is where this becomes provable without hardware.

## Still owed

- **UNIT B′** — the mutator enumeration, derived mechanically: the mask is computed once at build
  and nothing recomputes it. A take, teardown, position override, resize, lifecycle range,
  retention restore or **z-order reorder** that moves a plate leaves every hole where it was.
  Lifecycle range in particular is named in `§9a-Z` as a scene fact the punch should follow, and
  today only static `visible` does.
- **UNIT C** — the export assertion; `mask-mode` surviving `@cg/single-file-export` is the highest
  single risk in the feature and is untested.
- **UNIT D** — 1.5f / 1.5h: state whether B already discharges them.
- `§9a-Z`'s two open checks (stage background element-or-property; N-masks cost), 1.5d's radius
  control (the seam is built, unexposed), the extended 6.2b contract test.
- **From AK, unchanged**: route:// delivery, CLIP intersection, DEFER/COMMIT scope, PLAY
  substitution, precision kept, frame latency, and R-048's 6.9a tick.

## Gate

`pnpm gate` green, uncached — **85 successful / 85 total, 0 cached**; `openspec validate --all
--strict` 51/51. A Linux `gate:e2e` **is owed** (this changes a render path); its run URL is
recorded beside the ticked item in `tasks.md`.
