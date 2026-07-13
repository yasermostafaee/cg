# D-110 path morph — tasks

## 1. Schema (`@cg/shared-schema`)

- [x] 1.1 New leaf module `src/path-points.ts`: move `AnchorPointSchema`/`AnchorPoint` (verbatim + doc) out of `elements.ts`; re-export from `index.ts`; `elements.ts` imports it (public
      surface unchanged).
- [x] 1.2 `PathKeyframeValueSchema` (`{ kind: 'path', points: AnchorPoint[].min(2) }`) +
      `isPathKeyframeValue` guard; extend `KeyframeValueSchema` union; add `'path'` to
      `AnimatablePropertySchema`.
- [x] 1.3 `lerpPathSnapshot(a, b, t)` — leading-order, id-matched lerp of x/y + in/out deltas
      (absent handle = zero vector; both absent stays absent; `smooth` from leading; leading-only
      ids held, trailing-only ids omitted). `pathKeyframeValuesEqual(a, b)` with numeric epsilon.
- [x] 1.4 Unit tests: schema validation + JSON round-trip (`tests/path-points.test.ts`),
      `lerpPathSnapshot` pure-move / corner↔smooth-from-zero / non-matching-id hold / order
      preservation, equality helper; full-scene `SceneSchema.parse` round-trip lives in the
      designer suite (`store-path-morph.test.ts`, real store output).

## 2. Runtime (`@cg/template-runtime`)

- [x] 2.1 `keyframe-eval.ts` `lerpValue`: path-snapshot branch → `lerpPathSnapshot` (mixed kinds
      still snap to `a`).
- [x] 2.2 `animation-applier.ts`: `'path'` apply branch (path elements only) — interpolate,
      guard, write `d = pathD(value.points, source.closed)` on the inner `<path>`; extend
      `sameKeyframeValue` via `pathKeyframeValuesEqual`.
- [x] 2.3 `buildPath` already ships `overflow: visible` on the path `<svg>` (D-109) — verified
      by a regression test rather than a code change (fixed local space, morph may exceed the
      static bbox).
- [x] 2.4 Unit tests (`tests/path-morph.test.ts`, 11 cases): mid-frame interpolation → expected
      point set + `d` string; non-linear easing shapes the morph (ease-in + custom bézier ≠
      linear t); `step` holds; non-matching-id fallback (no crash, documented set); closed path
      keeps fill+`Z` mid-morph; before-first/after-last clamp; static viewBox; overflow visible.

## 3. Designer

- [x] 3.1 `field-registry.ts`: `PATH_MORPH` descriptor (property `'path'`, new section `'Path'`,
      deep-cloning `read`, not multi-selectable) prepended to `FIELD_REGISTRY.path`; widened
      `PropertyDescriptor.read` (and `TimelineRow.read`) to `KeyframeValue`; right-inspector
      parity row (Path section + `KeyframeDot`) in `StyleSection.PathSections`.
- [x] 3.2 `keyframe-helpers.ts`: `interpolateTrack`/`lerpKeyframeValue` path branch (delegate to
      `lerpPathSnapshot`); widened `effectiveAnimatableValue`/`effectiveRowValue` types; new
      `effectivePathPoints(el, frame)` helper.
- [x] 3.3 `TrackRow.tsx` `ValueCell` + `KeyframeInspector` value field: read-only `N pts` branch
      for snapshot values (numeric/color editing untouched). (Keyframe Inspector heading shows
      the property name — "PATH" — via the existing fallback; no registry lookup needed.)
- [x] 3.4 `state/slices/timeline.ts`: widened keyframe value signatures to `KeyframeValue`;
      `writeStaticAnimatable` `path` case (normalize route, path elements only);
      `bakePathSize` also scales every path-track snapshot per-axis.
- [x] 3.5 `PathEditor.tsx`: renders/drags from `effectivePathPoints` (screen mapping stays on
      the STATIC bbox); `applyPoints` routes track-aware — static route unchanged without a
      track; with a track `commitAnimatable(id, 'path', snapshot)` with RAW points (no
      normalize). (The original current-frame-only structural-edit rule here was SUPERSEDED by
      the 7.3 structure lock.)
- [x] 3.6 Canvas hit-test clone substitutes effective points for keyframed paths (morphed
      outline selects as rendered).
- [x] 3.7 `Exporter.preflight`: `path-morph-anchor-mismatch` WARNING for adjacent path keyframes
      with differing id sets (post-7.3: reachable only from hand-edited/legacy external input —
      kept as the defensive validation).
- [x] 3.8 Unit tests (`tests/store-path-morph.test.ts`): `commitAnimatable('path', …)`
      update-on-keyframe / auto-record-off-keyframe / static-when-no-track; `bakePathSize`
      scales snapshots; registry — path kind exposes exactly one `path` descriptor (first, per
      the Loopic order), non-path kinds none; diamond capture deep-clones; scene-schema
      round-trip with easing; preflight warning fires on mismatched adjacent snapshots only.

## 4. E2E (Playwright, `apps/designer/tests/e2e/`)

- [x] 4.1 `path-morph.spec.ts`: draw a path → add the first Path keyframe via the timeline
      diamond → scrub to a later frame → drag an anchor in edit mode → a second keyframe
      auto-records; timeline shows exactly ONE Path row (never per-anchor); scrubbing to a
      mid-frame renders an interpolated `d` (differs from both endpoint shapes); endpoints
      reproduce exactly. Run green.

## 5. Docs / spec

- [x] 5.1 Engine doc-sync: `packages/template-runtime/README.md` (evaluator value kinds + path
      apply + extension point), timeline README (value space, keyframe capture), canvas README
      (PathEditor track-aware commit + frame-awareness), state README (keyframe value union +
      path routing + bake rule), `docs/engines/overview.md`.
- [x] 5.2 PRD `docs/prd/designer.md` D-110 `[~]` + acceptance (done). (`docs/ROADMAP.md` Done
      entry lands with the archive commit, per convention.)
- [x] 5.3 `pnpm openspec validate add-path-morph --strict` green.

## 6. Gate

- [x] 6.1 Full uncached green gate: `pnpm turbo run typecheck lint test build --force` (79/79
      tasks, 0 cached) + `pnpm format:check`; `pnpm test:e2e` (198 designer + 19 runtime specs);
      `pnpm openspec validate --all --strict` (33/33).
- [x] 6.2 Serve the preview; owner verified the morph + single Path row + export parity
      (2026-07-11) — with two decision reversals filed as section 7 below.

## 7. Owner-verification follow-up (2026-07-11 decisions — live bounds + structure lock)

- [x] 7.1 Spec/docs reversal: proposal + spec delta + design.md (D5 superseded; D8 live bounds;
      D9 structure lock) + PRD wording updated; `pnpm openspec validate add-path-morph --strict`.
- [x] 7.2 Live bounds: `effectivePathLocalRect` (keyframe-helpers); `gizmoCornersOfRect` +
      `computeRectResize` (geometry.ts, rotation-correct); Gizmo renders/resizes the live rect
      for keyframed paths; Inspector W/H displays live extents and converts typed values
      live→base; other kinds untouched.
- [x] 7.3 Structure lock: pure `state/path-structure.ts` (per-set segment split at t, corner /
      smooth-drag / smooth-tangent, remove, smooth-flag patch); store actions
      `insertPathAnchorAll` / `removePathAnchorAll` / `setPathAnchorShapeAll` (static + every
      snapshot + re-normalize with snapshot shift, one undo each); PathEditor routes
      insert/delete/Alt-break through them (`nearestOnSegment` returns t); below-2 still deletes
      the element.
- [x] 7.4 Unit tests: insert adds one shared id to static + both keyframes at the same t and it
      tweens; smooth-drag handles equal everywhere; menu smooth-tangent per-set handles; delete
      removes everywhere; below-2 deletes element; move/handle-drag stays current-only;
      Alt-break flag propagates with per-keyframe handles kept; re-normalize keeps
      size==visualBBox with snapshots shifted consistently; live rect grow case;
      rotated+morphing gizmo corners; `computeRectResize` anchors the fixed live corner under
      rotation.
- [x] 7.5 E2E: insert on a 2-keyframe path → anchor count grows at BOTH keyframes, shape stays
      well-formed across the range (no pop); the gizmo frame at a mid-frame tracks the morphed
      extent (grow); delete → gone from both keyframes.
- [x] 7.6 Engine doc-sync: canvas README (structure lock + live bounds; static-bounds note
      removed), state README (new actions), timeline/template-runtime READMEs (defensive-only
      fallback framing).
- [x] 7.7 Live hit-testing (owner follow-up, same root as 7.2): the CanvasOverlay hit clone
      substitutes `effectivePathBoxPoints` (box-space evaluated anchors) and `hitsPath` uses the
      identity mapping for keyframed paths — single-click select AND double-click-to-edit follow
      the morphed outline (grown regions hit); unit tests + E2E (dblclick the grown-only
      region); spec scenario added.
- [x] 7.8 Cross-app schema boundary (owner-reported .vcg rejection; design.md D10): root cause
      audited (single schema source; all consumers resolve the compiled `dist/`; the runtime
      app bundle BAKES the schema at build time — a stale build/loaded session rejects new
      tracks). Guards: `apps/runtime/tests/import-path-morph-vcg.test.ts` (real
      verify→unpack→render path with a `pack()`-built morph .vcg) + the runtime E2E fixture
      scene now carries a morph track (`import-vcg-template.spec.ts` exercises the BUILT app
      bundle). Fresh re-test `.vcg` produced for the owner.
- [x] 7.9 Full uncached gate (`turbo run typecheck lint test build --force`, 79/79, 0 cached) +
      `pnpm format:check`; E2E: designer suite 199/199 and runtime suite 19/19 (each green in a
      solo run; combined turbo runs intermittently flake ONE unrelated timing-sensitive spec on
      this machine — different spec each time, every one green on retry and in isolation);
      `pnpm openspec validate --all --strict` (33/33). Preview re-served; owner verification
      PAUSE active (no commit/push until "confirmed").
