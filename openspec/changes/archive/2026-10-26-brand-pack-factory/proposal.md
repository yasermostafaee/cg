# Brand Pack Factory v1

## Why

Customer packs have already been delivered by hand, which proves the service but also exposes the
repeat work: copy a master, replace colours, logos and fonts, export each composition, reopen every
package, capture evidence, and make sure a rebuild updates the same templates instead of creating
duplicates. That process has no machine-readable Brand Kit, no repeatable identity rule and no
single QC result.

The owner's 1 August 2026 contract defines this as an **in-house service**, never a customer-facing
Designer feature. Its Phase-0 hand build now exists outside the repo (the four-template Refaee
delivery), so v1 can be based on observed work rather than a hypothetical UI.

## What changes

- Add `tools/pack-factory`, an internal CLI that validates a customer's external Brand Kit and an
  external build recipe, reads reusable master `.cgproj` files, and emits customer-specific `.vcg`
  packages into an external delivery directory.
- Give every brand/template and brand asset a stable derived UUID, so rebuilding a pack updates the
  same CG Control templates while two customers never collide.
- Apply only explicit semantic colour, font and asset bindings. Exact brand colours are preserved;
  derived support colours are declared and documented rather than silently "improved".
- Refuse raster-only logo sources and unconfirmed font embedding rights. AI/EPS logo masters may be
  recorded, but a browser-renderable SVG/raster derivative is required for a template binding.
- Reuse the product's composition projection, package writer and broadcast-page builder instead of
  growing a second export implementation.
- Verify every built archive, open the actual packaged page in Chromium, exercise play/stop, record
  browser/page failures, and emit phase captures, `contact-sheet.html`, `pack-sheet.md`, and
  `pack-report.json` beside the `.vcg` files.
- Keep all customer assets, recipes, references and generated deliveries outside the product repo.

## Impact

- New internal workspace: `tools/pack-factory`.
- Shared export seams: composition projection in `@cg/vcg-format`; `.vcg` page construction in
  `@cg/single-file-export`; Designer is changed only to call those same seams.
- Product UI, shipped installers, starter templates, Runtime/Bridge protocols and package schema do
  not change.
- `.vcg` import into Designer (`D-143`) and package signing are explicitly out of v1.

## Lane

**FULL lane.** The tool produces artifacts that go to playout, so schema tests, package round trips,
real-browser QC, the full local gate and Linux CI are required even though the tool is internal.
