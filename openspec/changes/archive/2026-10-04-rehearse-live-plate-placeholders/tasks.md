# Tasks — R-049, a labelled placeholder over every live plate in PVW

## 1. Reuse the ONE set of bars

- [x] 1.1 `export` `SMPTE_BARS` and `smpteBarsGradient()` from
      `packages/template-runtime/src/scene-builder.ts`. **Bodies unchanged** — the paired-stop
      comment is the B-066 lesson and must survive verbatim. Exported as a STATEMENT
      (`export { … }`) rather than by prefixing the declarations, because the prefix pushes the bar
      array past `printWidth` and prettier's re-wrap costs **+64 bytes** in every `.vcg`.
- [x] 1.2 Expose them through a `./scene-builder` subpath in `packages/template-runtime/package.json`
      rather than through the entry index. **Measured**: a subpath leaves the inlined on-air bundle
      byte-identical (`cg-runtime-bundles.ts` — 1 309 951 bytes, sha256 `4597a5c8f41ee07f…`, before
      and after), while re-exporting from `src/index.ts` grows the IIFE export table by
      **121 bytes** in every exported `.vcg`. Measurement recorded beside the export.
- [x] 1.2a A `./position` subpath too, and it is not a preference: the entry index reaches
      `adapters/caspar-globals.ts`, whose `declare global` claims `window.cg` for the SERVED PAGE's
      runtime. Importing the index into this app merged that declaration with the app's own
      `window.cg` bridge and broke typecheck across ~15 call sites. Two things legitimately own the
      name; they must not share a compilation.
- [x] 1.3 `@cg/runtime` takes `@cg/template-runtime` as a dependency. **Measured: +3.5 kB** in the
      built SPA (1 271.6 → 1 275.1 kB, stubbing the two imports out and back), not the "whole
      renderer" the older comment in `RehearsalStage.tsx` feared.
- [x] 1.4 Pin the reuse: a test asserting the Designer's `author`-mode Live Source background IS
      `smpteBarsGradient()`'s string, so a second bar table cannot appear without failing.

## 2. The geometry — one arithmetic, one fit scale

- [x] 2.1 `apps/runtime/src/renderer/features/monitors/livePlateGeometry.ts` —
      `platePlacements(liveSources, raster, position, sourceNameOf)`, mapping each declared plate
      rect from SCENE pixels to RASTER pixels via `outputScale` / `outputLetterbox` /
      `outputTranslate` imported from `@cg/template-runtime/position`. **No local re-derivation.**
      (Named `livePlateGeometry`, not `livePlateOverlay`: a case-only difference from the component
      beside it is a compile error on a case-insensitive filesystem.)
      ⚠ **THE SIGNATURE ABOVE IS SUPERSEDED — `sourceNameOf` no longer exists (session BQ,
      `B-157`).** A `(plateId) => name` callback has no LOOK in it, so once per-look input bindings
      shipped the same plate in two looks could only ever yield one name, and PVW named the
      template default while air showed the bound source. The fourth parameter is now a
      `PlateSourceLookup` — the resolution INPUTS — and `platePlacements` calls
      `@cg/shared-ipc`'s `resolvePlateSourcesForLook` with the look it already holds. The rest of
      this item (the arithmetic, the single fit scale, the no-local-re-derivation rule) is
      unchanged and still correct.
- [x] 2.1a `outputTranslate`'s first parameter WIDENED to `Pick<Scene, 'resolution'>` — the body
      only ever read that, every existing caller still satisfies it, and the alternative was a
      caller with no scene fabricating one or copying two lines of arithmetic.
- [x] 2.2 `frameBox(raster, fit)` in `rehearsalFrames.ts` — the ONE expression of the raster-sized
      box and the fit transform, used by BOTH `RehearsalFrame`'s iframe and the overlay.
- [x] 2.3 `overlayZIndex(frameCount)` — the overlay band sits above every frame; the caveats
      disclosure sits above the overlay. Derived from the frame count, because there is no cap on
      rehearsing rows and the bare `3` the caveats carried already tied with the third frame.
- [x] 2.4 The label counter-scales by `1/fit` so it reads at console size while its anchor rides the
      frames' transform. One `fit`, used twice, never a second measurement.

## 3. The overlay

- [x] 3.1 `LivePlateOverlay.tsx` — bars + hazard striping + `PLACEHOLDER` in both states.
- [x] 3.2 ASSIGNED: full saturation, plate name + source name.
- [x] 3.3 UNASSIGNED: `filter: grayscale(1)`, amber frame, explicit `no source assigned`.
- [x] 3.4 A comment at the drawing site stating this does NOT reopen design.md §12.2.
- [x] 3.5 `pointer-events: none` on the layer — it covers the whole rehearsal and must not take a
      click from the transport beneath it.
- [x] 3.6 ⭐ **Visible BEFORE Play, unchanged THROUGH it** (owner, 2026-08-12 — raised on observing
      that the markers paint at PVW-open while the template stays blank until Play). Recorded as a
      decision, not left as a side effect: before Play is exactly when an unassigned plate must be
      caught, and the marker persists during play because the hole is still a hole. It does NOT
      reopen D-087 — `cg-pending` is a class on the PAGE's own body and the overlay is not page
      content, so the page still paints nothing before Play. **VERIFIED what happens during play
      rather than assuming**: the marker persists entirely unchanged (same box, state and words);
      nothing fades and nothing disappears, because the component takes no lifecycle input at all.

## 4. The data path

- [x] 4.1 `RehearsalSubject` carries the template's `liveSources` block and the APPLIED
      `plateId → source NAME` map.
- [x] 4.2 `PreviewPanel` joins `useTemplateIndex` + the sources store (`appliedPlateSources`, the
      canonical join — not a second local spelling) and subscribes so a bridge push repaints.
- [x] 4.3 APPLIED, never drafted — a staged assignment still refuses the take.
- [x] 4.4 Only RENDERABLE rows get placeholders: a row whose page this browser does not hold shows
      no frame, and a marker floating over nothing would contradict the "showing N of M" caption.

## 5. Tests

- [x] 5.1 Alignment over 1920×1080 (collapse case), **1440×1080** (pads on Y), **720×576** (pads on
      Y, different scale) and **2048×1080** (pads on X). Anchored on design.md §6's worked example:
      960×540 centred on 1440×1080, hole at x=100 ⇒ raster x=435. Mutation-checked: dropping `pad.x`
      is caught ONLY by the 2048×1080 case, which is why it is in the table.
- [x] 5.2 The override-else-authored-default position chain is honoured.
- [x] 5.3 DOM test: assigned shows plate + source name; unassigned shows `no source assigned` and is
      desaturated; both carry `PLACEHOLDER`.
- [x] 5.4 The exported page is unchanged — `live-source-render.test.ts` stays green and gains the
      reuse assertion from 1.4.
- [x] 5.5 E2E covering the two states AND the alignment, measured in viewport pixels against the
      page's own laid-out hole boxes (`pvw-live-plate-placeholder.spec.ts`) — the claim jsdom cannot
      falsify, since it reports every box as zero.
- [x] 5.6 The before/during/after-Play behaviour of 3.6, pinned at BOTH levels: the E2E drives a
      stand-in page carrying the real `cg-pending` contract and asserts page blank → painting →
      blank with the marker unmoved throughout; the DOM test pins the overlay's invariance under a
      transport click. Without 5.6 the decision in 3.6 is a comment that the next refactor can
      silently contradict.

## 6. Housekeeping carried by this change

- [x] 6.1 Verify the two rehearse comments (`RehearsalStage.tsx` header,
      `packages/shared-ipc/src/channels/rehearse.ts`) — they once claimed a labelled placeholder
      that was never built. **CHECKED: both were already corrected on 2026-08-08 and neither still
      asserted the old thing.** Now that the placeholder EXISTS the corrected text becomes
      almost-true, which is the more dangerous kind of stale comment, so BOTH were restated to say
      exactly what is drawn and by whom: the PAGE paints nothing, the RUNTIME draws a marker.
- [x] 6.2 PVW's on-surface caveats restated to match.
- [x] 6.3 `docs/prd/runtime.md` R-049 raised `medium` → `high`, with the reason recorded (the owner
      hit it in live testing: in CG Control's PVW you cannot tell a live plate exists at all).

## 7. Gate

- [x] 7.1 Full green gate for every touched workspace — including the exporters' suites, since
      `@cg/template-runtime` is shared with them.
- [x] 7.2 **Linux `gate:e2e` — DISCHARGED.** This changes a user-visible render surface, so a green
      Windows run does not discharge the debt; only a COMPLETED, GREEN `e2e` job on GitHub Actions
      for the commit that carries the change does.
      **Run URL: https://github.com/yasermostafaee/cg/actions/runs/31551511995** —
      commit `455318b4559d3099efc866054073032f1c6fe353`, which is the commit carrying the change;
      `status: completed`, `conclusion: success`, and the **`E2E (Playwright)` job RAN** rather than
      being skipped, concluding `success` alongside `Lint • Typecheck • Test • Build`. A run whose
      `e2e` job was SKIPPED would not have discharged this, which is why the job's own conclusion is
      recorded and not merely the run's.
- [x] 7.3 Engine doc-sync: `packages/template-runtime/README.md`'s "Public surface" claimed
      everything consumers use is re-exported from `src/index.ts`, which the two new subpaths made
      untrue. Corrected in the same change, carrying both byte measurements and the `window.cg`
      collision — that section is where the next person adding an export will look.
