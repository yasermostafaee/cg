# The Designer fix bundle the owner decided on 2026-10-14 (`DESIGNER-FIX-02`)

## Why

`REPORT-DESIGNER-TRIAGE-01` (2026-10-14) found twelve Designer items that reach air, break templates or mislead the
author; the owner answered its questions the same day (`DESIGNER-DECISIONS-2026-10-14.md`). This change carries
those decisions out.

## What Changes

1. **`B-148`** — two copies of one box composition in a template without a look group are refused at export, naming
   both copies.
2. **`B-128`** — the ticker separator picker offers images only; a saved separator pointing at a font or video is
   repaired on open (dropped, the author told once).
3. **`B-106`** — repeater `maxItems` is enforced in the Designer's row editor and at play.
4. **`B-249`** — a per-composition export never writes an `entryCompositionId` the package does not contain.
5. **`B-147` interim** (⚠ SUPERSEDED by `add-text-fit`: the real Shrink to Fit replaced it) — Auto Squeeze shows as unavailable with one short reason (a fact, not a disabled control);
   saved values are kept.
6. **`B-099`** — probed: a nested clock or sequence during the intro; fixed if frozen.
7. **`B-030`** — a timed auto-out child under a content-driven parent no longer strands the parent on air.
8. **`B-103`** — every sequence's first item enters with its transition (shipped in `0ea672fa` under `D-163`);
   **`B-105`** — "Hide-show" is renamed **Cut**, pinned by a test.
9. **`B-187`** — a new Live Source box gets the next free automatic name in its look, shown as **auto** until
   confirmed or renamed.
10. **`B-138`** — a video whose file is missing shows the image "missing" picture as its still frame.
11. **`D-156`** — **Alt** bypasses snapping in every gesture.
12. **`R-040` + `R-037`** — sequence-item field headings read `<composition> — item N`, a short stub only on a
    collision, each name in its own `<bdi>`.

## Impact

Designer (`apps/designer`), the template runtime (items 3, 6, 7, 8), `@cg/vcg-format` (items 1, 4), CG Control's
field headings (item 12). Items 1–7 change the template page: such templates must be re-exported and re-imported
(`C-034`) until `PAGE-REBUILD-01` lands.
