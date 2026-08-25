# tasks — live-plate-fit-mode

⚠ **`design.md` §3 carries the ordering constraints. These boxes under-state them — read §3.**

## 1. The one function

- [x] 1.1 `packages/shared-schema/src/live-fit.ts` — `LiveFitMode`, `LiveFitModeSchema`,
      `DEFAULT_LIVE_FIT_MODE`, `fitPictureToBox(box, sourceAspect, mode) → { picture, visible }`.
      Pure, total, exported from the package index.
- [x] 1.2 Unit tests (`packages/shared-schema/tests/live-fit.test.ts`): wider-than-box,
      taller-than-box, matching aspect, `null` aspect, zero/negative aspect, degenerate box, and the
      `contain`/`cover` divergence at a fixture that separates them on BOTH position and size.
- [x] 1.3 The equivariance test — fitting in scene px then mapping to raster px equals mapping then
      fitting, over four rasters including two non-16:9. This is what licenses two consumers in two
      spaces (design.md §0).

## 2. The schema field

- [x] 2.1 `fitMode` on the `video-placeholder` element (`elements.ts`), optional, absent ⇒ `contain`.
- [x] 2.2 `fitMode` on `LiveSourceDeclarationSchema` (`live-source.ts`).
- [x] 2.3 `fitMode` on the look-group declared source (`looks.ts`) — where the carrier is
      source-keyed and `expectedAspect` already lives for the same reason.
- [x] 2.4 `fitMode` on `TemplateSourceAssignment` (`@cg/shared-ipc`) — the operator's override.
- [x] 2.5 Both collectors in `@cg/vcg-format` emit it; absent stays absent (no default written here).

## 3. The mixer geometry

- [x] 3.1 `liveSourceFit` takes a mode and delegates to `fitPictureToBox`; `fill` = `picture`,
      `clip` = `visible ∩ stage`.
- [x] 3.2 🔴 The positive control: every existing `live-geometry` assertion holds VALUE-FOR-VALUE
      under `cover` — proved BEFORE any `contain` path was wired (design.md §3.2). Only
      `fitMode: 'cover'` was added to those tests; no number moved.
- [x] 3.3 `liveSourceFit`'s docstring rewritten so it no longer argues against the shipped
      behaviour. It quotes the old "black bars read as a fault" reasoning and names the premise that
      moved: the margin is the template's background, not black, because the hole moved too.

## 4. The mask hole

- [x] 4.1 `sceneMaskHoles` takes per-plate fit facts (`PlateFits`) and punches at the VISIBLE rect.
      The `intersects` overlap test still runs on the BOX — which elements a plate masks is a
      z-order question about the authored layout, not about the source's aspect.
- [x] 4.2 `@cg/template-runtime` threads them from the re-punch; the build-time punch falls back to
      the scene's own statement.

## 5. The bridge→page transport (design.md §1)

- [x] 5.1 `CgControl.plates` — `{ aspect, mode }` per plate id, validated member by member
      (`readPlateFits`), a malformed entry dropped rather than thrown on.
- [x] 5.2 The bridge attaches it at the `CG ADD` chokepoint and at the look tell, in ONE payload
      with the look id.
- [x] 5.3 The page records it (`applyPlateFits`, merged not replaced) and re-punches; falls back to
      the scene when absent; the record is cleared on teardown with `#activeLooks`.

## 6. The mode and the refusal

- [x] 6.1 `resolvePlateFitMode(override, element)` in the bridge — override → element → `contain`.
- [x] 6.2 The refusal is mode-conditional: refuse under `cover`, warn under `contain`. The FACTS are
      written once, above the branch; the CONSEQUENCE clause differs because the shipped one is
      false under `contain` (see design.md §4's recorded correction).
- [x] 6.3 `resolvePlateAspect`'s own chain UNCHANGED, and asserted across both modes so it stays so.
      `fitMode` is REQUIRED on its input, with no default, so the compiler enumerates every caller.

## 7. The Designer control

- [x] 7.1 A `fit` `SelectField` in the Live Source Inspector section (`FitModeRow`), shared
      primitives only, with a shared `Icon` (lucide `Scan` / `Crop`) as its trailing state cue.
- [x] 7.2 RTL checked — the control is a shared `SelectField` in the standard Inspector row, which
      inherits the app's direction handling; the icon is non-directional and so is not `flipRtl`.

## 8. Tests

- [x] 8.1 🔴 The TWO-AXIS test — `packages/template-runtime/tests/live-fit-two-axis.test.ts`. The
      mask hole and the `MIXER FILL`/`CLIP` asserted for ONE input in ONE test, across the package
      boundary, over four rasters and both modes.
- [x] 8.2 The diverging-value fixture — an 800×600 (4:3) box with a 16:9 source, pinned BY VALUE:
      `contain` ⇒ `460,315,800,450`, `cover` ⇒ `460,240,800,600`. A test that passed under both
      would have tested nothing, and the divergence is asserted explicitly.
- [x] 8.3 The byte-identical positive control for an aspect that matches its box — surface AND wire,
      both modes, `toEqual`.
- [x] 8.4 E2E in `apps/designer/tests/e2e/live-source.spec.ts` mapping the designer scenarios; the
      export and parse halves are pinned in `@cg/vcg-format` and `@cg/shared-schema` unit tests
      (named in the spec's own mapping comment).

## 9. Docs

- [x] 9.1 `C-028`'s OPEN note replaced with the decision and its reasoning.
- [x] 9.2 `packages/template-runtime/README.md` — the hole-is-the-picture contract and the
      bridge→page transport.
- [x] 9.3 PRD item `C-028` → `[~]` with the change dir.

## 10. Gate

- [x] 10.1 `pnpm gate` green, uncached.
- [x] 10.2 `CG_GATE_HOOK_E2E=1` run locally once before push.
- [x] 10.3 🔴 Linux `gate:e2e` OWED — **DISCHARGED**, evidence below.

### The `gate:e2e` discharge

**Run URL:** <https://github.com/yasermostafaee/cg/actions/runs/32870092879>

|                                   |                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Commit                            | `6b3433337bb2640b37d8da4448f254273bd852ac` on `dev` — carries the whole change |
| Run                               | `status: completed`, `conclusion: success`                                     |
| `E2E (Playwright)`                | **RAN**, 8m52s, `success`                                                      |
| `Lint • Typecheck • Test • Build` | RAN, 8m21s, `success`                                                          |

🔴 **The `e2e` job was confirmed by its DURATION, not merely by a green tick.** CI skips `e2e` for a
diff it classifies as unable to affect rendering (`P-029`), and a skipped job reports green too — so
a tick alone proves nothing about the suite. 8m52s is a job that ran.
