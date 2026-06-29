# Tasks — Pen tool + editable bézier path element (D-109)

## 1. Schema (`@cg/shared-schema`)

- [x] `AnchorPointSchema` (`{ id, x, y, in?, out?, smooth }`) + `PathElementSchema` (`type: 'path'`,
      `points.min(2)`, `closed`, `fill?`, stroke inlined) added to the element union (type + input +
      parse). `pathBBox(points)` helper.
- [x] Schema round-trip test (closed/open, corner/smooth, ids preserved, fill/stroke optional, < 2
      rejected; union dispatch).

## 2. Runtime (`@cg/template-runtime`)

- [x] `buildPath` → `<div><svg viewBox=bbox preserveAspectRatio=none><path d></svg></div>`; closed ⇒
      fill + stroke, open ⇒ `fill: none`. `pathD(points, closed)` (exported) — `M`/`C`/`L`/`Z`.
- [x] Path stroke + fill appliers target the inner `<path>` (animate like a shape).
- [x] Unit tests: d-string (open/closed, smooth/corner) + render (closed fill, open none).
- [x] `packages/template-runtime/README.md` — path rendering (engine doc-sync).

## 3. Designer (`@cg/designer`)

- [x] Pen tool in the toolbar + `DesignerTool` `'pen'`; `pathFromScenePoints` + `normalizePathPoints`
      factories.
- [x] `pen-draw.ts` pointer state machine (click corner / drag smooth / click-first close /
      Enter-Esc-dblclick finish), wired into `CanvasOverlay`.
- [x] `PathEditor` edit overlay (drag anchors / handles, mirror + Alt-break, click-segment insert,
      Delete remove + re-stitch / delete-below-2); shown only with the select tool.
- [x] `hit-test.ts` — closed point-in-polygon + open distance-to-stroke (bbox-but-outside misses).
- [x] B-022 gizmo reused (size = points bbox; resize = scale via viewBox, no re-bake).
- [x] Path inspector (fill, D-042 stroke, closed/open toggle, anchor count); D-051 registry marks
      fill/stroke keyframe-able for `path`; timeline color.
- [x] Designer unit tests (factory/normalize + hit-test) + a pen-draw E2E.
- [x] `apps/designer/src/renderer/features/canvas/README.md` — pen tool + path overlay (engine doc-sync).

## 4. Gate

- [ ] `format:check` + `typecheck` + `lint` + `test` + `build` for `@cg/shared-schema` +
      `@cg/template-runtime` + `@cg/designer` (turbo `--force`).
- [ ] `pnpm test:e2e` (pen-path) + `pnpm openspec validate pen-path-element --strict`.
- [ ] Conventional commit; D-109 PRD `[~]`. Do NOT archive.
