## 1. Store

- [x] 1.1 `KeyframeRef` type; add `selectedKeyframes` to state + initial/reset
- [x] 1.2 `addKeyframeToSelection` (toggle); `openKeyframeInspector` /
      `setSelectedKeyframe` mirror into `selectedKeyframes`
- [x] 1.3 Selection follows `moveKeyframe`/`moveKeyframeById` and prunes on
      `removeKeyframe` for the whole set

## 2. Timeline

- [x] 2.1 `TrackRow`: single click opens the inspector; shift/ctrl-click
      multi-selects; segment click opens its start point; highlight all selected
- [x] 2.2 Remove the double-click handlers
- [x] 2.3 `TimelineDock`: Delete removes every selected point; thread
      `selectedKeyframes`

## 3. Inspector

- [x] 3.1 `KeyframeInspector` branches: single = element/property/frame/value +
      easing + "Remove keyframe"; multi = easing only (batch) + "Remove keyframes"
- [x] 3.2 `InspectorPanel` opens the inspector when `selectedKeyframes.length > 0`
      and passes the set; `App` threads it

## 4. Gate

- [x] 4.1 typecheck + lint + test + build (designer)
- [x] 4.2 `pnpm openspec validate multi-select-keyframes --strict`
