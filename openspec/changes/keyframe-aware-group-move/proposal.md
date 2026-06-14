# Keyframe-Aware Group Move + Diamonds in Multi-Select (D-054)

## Why

D-041/049/050/053 kept group editing keyframe-free (diamonds hidden; group move
and group field edits write the static base) to avoid regressing the
single-element drag (D-006) and the B-005/006/007 keyframe read-path fixes. The
owner wants multi-select to behave like single selection, fanned out: a dragged
member that has a track on the moved axis keyframes at the playhead (as if
dragged alone), the multi inspector shows working keyframe diamonds, and a group
field edit follows the same keyframe-aware rule as a canvas drag — so the same
property never behaves differently between a field edit and a drag, and the
diamond never lies about what an edit will do.

The recon (Phase 1, signed off) confirmed the reuse seam: `commitAnimatable`
(`timeline.ts`) ALREADY routes keyframe-at-playhead-vs-static internally, and the
group paths already feed it absolute, evaluated-at-playhead values. So D-054 is
almost entirely NEW CALLERS of existing helpers — no edits to `commitAnimatable`,
`togglePropertyKeyframe`, `upsertKeyframe`, or the single-drag handlers.

## What Changes

- **Keyframe-aware group move (canvas):** in `beginGroupDrag` (`CanvasOverlay.tsx`)
  the two per-member `writeStaticAnimatable('position.x'|'position.y', …)` calls
  become `commitAnimatable(…)`. Each member then keyframes at `currentFrame` iff
  it has a track on that axis, else writes its static base — the single-drag rule.
  `m.x/m.y` are already `effectiveTransformAt(el, currentFrame)`, so the keyframe
  holds the evaluated start + delta (B-005-safe). Leading/trailing
  `markHistoryBoundary` are unchanged → still one undo. Group move stays
  position-only (resize/rotate group remains out of scope).
- **Keyframe-aware group field edits (Option B):** a new store action
  `applySharedPropertyLiveKeyframed(ids, property, value)` — identical to D-053's
  `applySharedPropertyLive` but loops `commitAnimatable` instead of
  `writeStaticAnimatable` (NO per-tick boundary; `commitAnimatable`'s upsert at a
  fixed frame coalesces across ticks exactly as the static write did).
  `MultiSelectSection`'s number fields route through it, keeping D-053's
  `onCommitBoundary` (drag-release/Enter/blur) so edits stay realtime + ONE undo.
- **Diamonds in the multi inspector:** `MultiSelectSection` renders a
  `KeyframeIndicator` for each shared property that is keyframe-able for ALL
  selected kinds (gated via the D-051 registry `isKeyframeable`). A THIRD
  `KeyframeIndicator` variant `partial` (distinct colour) is added; the aggregate
  rule is: all selected have a keyframe at `currentFrame` → `at-frame`; none →
  `empty`; mixed → `partial`. Clicking fans a toggle over the selection in ONE
  `runAsSingleHistoryEntry`: if all have a keyframe there, remove from all; else
  add to every member lacking one (via the existing `togglePropertyKeyframe`
  evaluated-at-playhead path, B-005-safe).

## Capabilities

### Modified Capabilities

- `designer-multi-select`: (a) **Group move by a shared delta in one undo step** —
  now keyframe-aware (member with a track keyframes at the playhead; else static
  base), no longer "static positions only". (b) **Mixed-value display and one-undo
  group edit** — group field edits become keyframe-aware (Option B) while
  preserving D-053's realtime + one-undo. (c) **Shared-property multi editor across
  the selected kinds** — its "diamonds are hidden" scenario flips: diamonds are now
  shown per the new requirement (other scenarios preserved verbatim).
  `designer-animation-timeline` is NOT touched — the keyframe model, single-drag,
  and B-005/006/007 read path are unchanged; D-054 only adds new callers.

### Added Capabilities

- `designer-multi-select`: **Keyframe diamonds in the multi editor** — presence via
  the D-051 registry (keyframe-able for every selected kind), the aggregate
  empty/at-frame/partial variant, and the one-undo fan-out toggle.

## Impact

- **State:** `state/slices/elements.ts` (+`applySharedPropertyLiveKeyframed`; loops
  the existing `commitAnimatable`). A multi diamond-toggle helper wrapping
  `togglePropertyKeyframe` over the selection in one `runAsSingleHistoryEntry`.
- **Canvas:** `CanvasOverlay.tsx` `beginGroupDrag` — two calls swapped to
  `commitAnimatable`.
- **Inspector:** `MultiSelectSection.tsx` (route fields to the keyframed action;
  render aggregate diamonds + wire the toggle), `KeyframeIndicator.tsx` (+`partial`
  variant), shared-properties/registry read-only for the gate.
- **Tests:** regression backbone unchanged (single drag, B-005/006/007, D-053
  realtime fields); new units (keyframe-aware group move; keyframe-aware field
  edit; aggregate-variant + fan-out toggle; presence gating incl. mixed-kind) +
  E2E (`multi-select.spec.ts`).
- **Docs:** `state/README.md`, the canvas/timeline/inspector READMEs (diamonds in
  multi; the third variant; multi == single).

## Out of scope

Group resize/rotate keyframing (group move stays position-only). The single
selection path, `commitAnimatable`, `togglePropertyKeyframe`, and `upsertKeyframe`
are not modified — only new callers are added.
