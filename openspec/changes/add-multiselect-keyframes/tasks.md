## 1. Store

- [x] 1.1 Add `selectedKeyframes` (mirrors `selectedKeyframe` as primary) + `KeyframeRef`
- [x] 1.2 `openKeyframeInspector` selects one + opens; `addKeyframeToSelection`
  toggles + keeps open; setSelectedKeyframe mirrors the array
- [x] 1.3 Move/remove/clear keep the whole set in sync (`syncSelectionAfterMove`,
  remove drops matching refs)

## 2. Timeline

- [x] 2.1 `TrackRow` highlights every selected point (diamonds + segments)
- [x] 2.2 Click opens the inspector; shift/ctrl-click multi-selects; segment click
  opens the start point; double-click handlers removed
- [x] 2.3 `TimelineDock` Delete removes all selected; threads `selectedKeyframes`

## 3. Inspector

- [x] 3.1 `KeyframeInspector` branches: one → full detail; many → shared easing +
  "Remove keyframes"
- [x] 3.2 `InspectorPanel` / `App` thread `selectedKeyframes`; inspector opens when
  the selection is non-empty

## 4. Misc + gate

- [x] 4.1 Shortcuts modal: click opens; shift/ctrl-click adds
- [x] 4.2 `store-animation.test.ts` — open/add/toggle, move keeps set, remove drops
- [x] 4.3 Green gate: typecheck + lint + test + build (`@cg/designer`)
- [x] 4.4 `pnpm openspec validate add-multiselect-keyframes --strict`
