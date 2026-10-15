# Tasks — add-text-fit (TEXT-FIT-01, B-147)

Lane: **FULL** — a registered scene migration (schema), the on-air page's text layout.

## 1. One spelling

- [x] 1.1 `fitMode: 'shrink-to-fit'` is the one spelling; `migrateTextFit` rewrites `autoSqueeze` and
      `overflow: 'shrink'` (fixed box → shrink-to-fit; autosize box → only the key goes); a text that
      asked for none is the same object. (`ba494463`; `text-fit-migration.test.ts`)
- [x] 1.2 REGISTERED in `SCENE_MIGRATIONS` (second, after paths), run by the Designer's load and by
      `createRuntime`. (`ba494463`)
- [x] 1.3 The migration runs on the CEF floor — `Object.fromEntries` (Chromium 73) replaced; caught by
      `cef-compat.test.ts` before it was pushed. (`c6df4c2f`)

## 2. The page

- [x] 2.1 `text-fit.ts`: shrink until the laid-out, shaped run fits (1 px for sub-pixel rounding), down to
      `TEXT_FIT_MIN_SCALE` (½); then clip or a one-line ellipsis. (`ba494463`; `text-fit.test.ts`)
- [x] 2.2 Re-fit in the same task a binding writes text; on the box's size; on a font load; a keyframed
      font size keeps the fit's scale. (`ba494463`)

## 3. The Inspector

- [x] 3.1 `Shrink to Fit [Yes | No]` on a fixed box; `Overflow [Clip | Ellipsis]` while shrinking; Sizing
      reads Fixed; no prose; the interim fact gone. (`9e83ffe6`; `text-fit-inspector.dom.test.ts`)
- [x] 3.2 `designer-fix-02`'s interim requirement ("Auto Squeeze is stated as unavailable") withdrawn
      from that change, and its task marked superseded.

## 4. Parity and measurement

- [x] 4.1 e2e `text-fit.spec.ts`: the Designer preview fits a long Persian name (smaller than 48 px,
      never below half, the run inside the box), re-fits a short one back, and the EXPORTED page fed
      the same name through `window.update` fits it to the same size. (`851a0bad`; local Windows:
      passed)
- [x] 4.2 Measured on local CasparCG 2.5.0: before 1220 px of text in a 900 px box (spills); after
      47.28 px, 901 / 900; short name 59.97 px; long again 47.28 px; taken off air after
      (`201 INFO OK`, 0 layers). Screenshots: `Claude outputs/TEXT-FIT-01-casparcg-*.png`.
- [ ] 4.3 Linux `e2e` RAN on a commit carrying the change — the A–H push `15be0821` carries
      `ba494463` / `9e83ffe6` / `851a0bad`: run URL here once read.

## 5. Docs

- [x] 5.1 `B-147` → `[~]` with this change; `docs/prd/bugs-designer.md`.
- [x] 5.2 Engine doc: `packages/template-runtime/README.md` names `text-fit.ts` and the migration registry.
