# Tasks — fix-pen-edit-mode-and-bbox (B-058 / B-059 / B-060 / D-124)

## 1. Recon (four-reader parallel sweep, findings in design.md)

- [x] pathBBox blast radius: full call-site map; option (a) disqualified (`.vcg`
      integrity/signing forbids migration; animated/rotated transforms not exactly re-bakeable);
      auto-text gizmo display-override located as the (b) precedent; off-frame export filter
      found sharing the defect.
- [x] Edit-mode state map (`editingTextId` pattern, clear sites, dblclick/empty-click wiring,
      every test asserting mount-on-select listed).
- [x] Complete Esc/contextmenu chain inventory + precedence design (menu capture-stop > owners >
      pen branch > edit-exit > deselect; layer `onContextMenu` wiring point for the draw-cancel).
- [x] Menu-primitive survey: six drifted hand-rolls, no shared primitive; extraction target
      `ui/ContextMenu.css.ts` with the LayerContextMenu values as canonical; the bare-Control
      hover-specificity trap identified.
- [x] Numbers verified post-#276: B-058/B-059/B-060 + D-124 free.

## 2. Spec

- [x] OpenSpec MODIFIED ×3 on `designer-path-element`; `pnpm openspec validate
fix-pen-edit-mode-and-bbox --strict` before implementing.

## 3. Implementation

- [x] B-058: `ui/ContextMenu.css.ts` (canonical chrome + button-reset/hover-override on `item`);
      `AnchorContextMenu` consumes it (own css deleted; keyboard layer kept);
      `LayerContextMenu.css.ts` re-exports the shared pieces.
- [x] B-059: `pathVisualBBox` in shared-schema (exact cubic extrema, runtime control-point
      convention); `path-bounds.ts` display↔stored mapping (closed-form inverse); Gizmo
      display-box override for paths (frame + resize); Inspector W/H visual mapping for paths;
      `off-frame.ts` visual box for paths.
- [x] D-124: `editingPathId` (store-core + selection slice; cleared by selection/composition/
      tool/scene-load); CanvasOverlay dblclick-path entry, PathEditor mount gate, gizmo hidden in
      edit mode, Esc dispatcher step (edit-exit before deselect), empty-click exit; PathEditor
      modifier-gated segments (live Ctrl/Cmd tracking; pointerEvents + cursor only while held;
      insertOnSegment modifier guard).
- [x] B-060: CanvasOverlay layer `onContextMenu` — `tool==='pen' && isPenDrawing()` →
      preventDefault + `cancelPen()` + feedback clear; disambiguation enforced by mount/guards.
- [x] Rider commit: stale B-053/B-054 code refs → B-057/B-056 (pen-draw.ts, PathEditor.tsx,
      canvas README, pen-smooth-placement.test.ts, pen-curve-edit.spec.ts, path-tools.test.ts).

## 4. Tests

- [x] Unit: `pathVisualBBox` extrema (bulge enclosed, concave dip, straight = anchors, closing
      segment, degenerate two-anchor arc); display↔stored mapping round-trip (incl. resized
      paths); edit-mode transitions (dblclick enters; Esc/empty exits keep selection; select-
      other/composition/tool clears); Ctrl-gated insert (no-modifier click inert); right-click
      disambiguation (drawing → cancel; edit-mode anchor → menu); off-frame keeps a bulge-visible
      path.
- [x] E2E: single click = box only (no `[data-cg-anchor]`); dblclick = handles, gizmo hidden;
      Esc/empty-click return to box-only with selection kept; Ctrl-drag inserts a smooth point,
      no-Ctrl click doesn't; selection box encloses a curved arc + Inspector H is the visual
      height; right-click while drawing cancels (no menu); right-click an anchor in edit mode →
      restyled menu → Delete point works. Existing pen specs updated to enter edit mode via the
      new `enterPathEdit` fixture helper.
- [x] Runtime regression: template-runtime tests stay green (render/viewBox untouched); export
      round-trip asserted unchanged in the E2E export check.

## 5. Docs

- [x] PRD: B-058 / B-059 / B-060 filed in `bugs-designer.md`, D-124 in `designer.md`
      (cross-referenced, owner decisions + recon recorded), all `[~]`; ROADMAP updated.
- [x] Engine doc-sync: canvas README (edit mode, modifier-gated insert, visual bounds, menu
      chrome, right-click cancel), state README (`editingPathId`).

## 6. Owner pivot (2026-07-10) — size==visualBBox model + Issues A–D

Supersedes the option-(b) display-mapping layer of section 3 (B-059 row): the owner decided
resize must ACTUALLY scale anchor coordinates, converging on `transform.size == visual bbox`
with ONE migration for Designer load and runtime `.vcg` ingestion.

- [x] Model: `migratePathGeometry` + `migrateScenePaths` in @cg/shared-schema (pure,
      identity-preserving; bakes legacy size ratio into points/handles, re-anchors to the
      visual bbox, pivot-compensates static rotation/scale, ratio/delta-compensates
      `size.*`/`position.*` keyframes). Wired at Designer `setScene` AND runtime
      `createRuntime` (in-memory — `.vcg` packages are never rewritten, signing intact).
- [x] Renderer converged on the model: scene-builder viewBox + `normalizePathPoints` use
      `pathVisualBBox`; Inspector W/H commits bake scale into points (`bakePathSize`);
      Gizmo / TransformSection / off-frame display-overrides REVERTED to generic
      (`path-bounds.ts` deleted) — size is now simply correct.
- [x] B-061 (Issue A): PathEditor is rotation-aware — `screen()` via `localToScene`,
      drag inverses unrotate/unscale, position mapping via the hit-test `inverseToLocal`.
- [x] B-062 (Issue B): resize-then-edit snap-back gone — resize bakes, so entering edit
      mode re-normalizes to the SAME geometry (no-op).
- [x] B-063 (Issue C): segment hit surfaces are the real flattened cubics
      (`<path data-cg-segment>` per segment, `pointerEvents: stroke`), so the Ctrl/Cmd
      add-point affordance sits on the curved edge.
- [x] Issue D (folded into D-124): right-click a segment in edit mode → shared-chrome menu
      with "Add point" (corner) / "Add curve point" (smooth, tangent-aligned mirrored
      handles); plain left press still falls through.
- [x] Tests: shared-schema `path-visual-bbox` + `path-migration` (legacy render-identity,
      rotated pivot, keyframe compensation, scene identity); designer `path-resize-bake`,
      segment Add-menu unit; E2E B-062 resize→edit no-snap + B-061 rotated-overlay
      tracking; pen suite migrated to `enterPathEdit`.
- [x] Docs: design.md "OWNER PIVOT" addendum (authoritative plan record); spec delta
      rewritten to the model; PRD B-061/B-062/B-063 filed + D-124 expanded; canvas/state
      README doc-sync.

## 6b. Owner re-verify round (2026-07-11) — rotated-drag drift

- [x] Probe (owner-requested): simulated one `applyPoints` tick on a 30°-rotated triangle —
      pivot moved (270,155)→(270,159) from the size change alone and both untouched anchors
      drifted 2.07 scene px. Diagnosis confirmed: the per-edit re-normalize (size tracks bbox)
      moves the rotation pivot; the `position += vmin` compensation is rotation-blind.
- [x] Fix: `normalizePathPoints` compensation made render-neutral under the FULL transform —
      `position' = position + (I − M)(A − A') + M·vmin` (`M = Scale·Rotate`, `A = anchor⊙size`);
      reduces exactly to `position += vmin` at rotation 0 / scale 1. Reconciliation stays
      CONTINUOUS (deferring to gesture end would let the viewBox stretch distort mid-drag) —
      decision recorded in design.md.
- [x] Regression: `tests/path-rotated-edit.test.ts` (30° drag — others stable to 1e-9, dragged
      anchor exactly delta in local space; 90° + non-uniform scale over 3 ticks; rotated handle
      drag; rotation-0 identity limit) + E2E drift assertion (drag one anchor of the rotated
      triangle, other anchors stationary within 1 px); spec scenario added.

## 7. Gate + ship

- [x] Uncached gate (`pnpm turbo run typecheck lint test build --force` for the affected
      workspaces incl. @cg/shared-schema + @cg/template-runtime + root `pnpm format:check`);
      `pnpm test:e2e` (197 passed); `pnpm openspec validate --all --strict` (35/35).
      RE-RUN in full after the 6b drift fix: 21/21 uncached (658 designer unit tests),
      full E2E green (one unrelated multi-select flake passed on re-run), format + validate
      clean; adversarial 3-verifier workflow (math / blast radius / test quality) — no
      blockers.
- [ ] Serve the preview; PAUSE for owner verification of the WHOLE expanded set (five
      original items + model change + Issues A–D). NO commit/push until the owner replies
      "confirmed".
- [ ] Conventional commits, push, verify the remote head, give the compare URL. Flip filed items
      `[~]` → confirmed later; `[x]`/archive after owner confirm + merge.
