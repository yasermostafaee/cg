# Design — complete-multi-select-shared-props

## D1. Widen the intersection by mirroring the single inspector

There is NO central per-kind property-metadata table — the single inspector
hand-writes its sections (`TransformSection`, `ShapeSections`/`StyleSection`).
So `shared-properties.ts` adds descriptors that MIRROR those fields' `prop` ids +
read accessors:

- `UNIVERSAL` (on `ElementBase`): + `scale.x`, `scale.y`, and the nine CSS
  `filter.*` (blur/brightness/contrast/grayscale/hueRotate/invert/opacity/
  saturate/sepia, with the same defaults/units/steps the single `FilterSection`
  uses — stored value == displayed value).
- `BY_KIND.shape`: + `stroke.color`, `stroke.width`, `stroke.dash`,
  `cornerRadius` (the UNIFORM radius — a per-corner tuple reads as "mixed" until
  set uniform, since D-042 widened the schema), `shadow.offsetX/offsetY/blur/color`.

Each descriptor gains a `section` (the CollapseSection it groups under) and an
optional `suffix` (unit for non-transform number fields; transform units still
come from `TRANSFORM_FIELD_META`). The intersection logic is unchanged — two
shapes now intersect to the full shape set, a shape+text to the universal set
(transform + filter), agree/mixed computed per property as in D-049.

### Tech debt (accepted short path)

This is a deliberate DUPLICATION: the shape property list lives in both
`StyleSection.tsx` and `shared-properties.ts`. A `⚠️ SYNC` comment is added at
both sites (when a shape property is added/changed, update both). A refactor to a
single per-kind metadata table is a separate quality item, parked near D-035 —
NOT done here (it would touch the whole single inspector).

## D2. Render the full sections with the existing primitives

`MultiSelectSection` renders the Transform section explicitly via `Seg`/
`SingleField` (+ `TRANSFORM_FIELD_META`, now including scale), then groups the
remaining shared descriptors by `section` (`Path Style`, `Border Radius`, `Drop
Shadow`, `Filter`, in the single-inspector order) and renders each via
`NumberField` / `ColorField` / `FillField` (the single-inspector primitives) —
no bespoke widgets. Pinned/collapsible matches single (Transform + Path Style
pinned; the rest collapsible). Diamonds are never rendered.

## D3. Single-undo panel edits — defer commit to Enter/blur

The bug: the multi number field wired `onCommit = applySharedProperty`, and
`RealtimeNumberInput` fires `onCommit` on every `onChange` keystroke, while
`applySharedProperty` wraps each in `runAsSingleHistoryEntry` (a history boundary
before AND after) → one undo entry PER KEYSTROKE.

The fix is purely in the input's commit timing — `applySharedProperty` (the
`onCommit`) is unchanged:

- `RealtimeNumberInput` gains `commitMode: 'change' | 'blur'`. `'blur'` (used by
  the multi fields via `deferCommit`): `onChange` updates only the visible buffer
  (no history), and `onCommit` fires ONCE on Enter/blur. Escape discards. So a
  typed multi edit is ONE `runAsSingleHistoryEntry` per committed value, and one
  undo reverts it across all selected elements. Single selection keeps
  `'change'` (live commit + time-coalescing) — unchanged.
- The drag-scrub surface (`fieldScrub`) is dropped on `deferCommit` fields
  (type-to-edit), so a scrub gesture can't fan out per tick either. Trade-off:
  the multi fields lose drag-scrub (a D-049 nicety) — acceptable; scrub-with-
  deferred-commit can return with the keyframe-aware item. Single fields keep it.

## D4. Thicker box + out of scope

`multiBox` border `1px → 2px` (Gizmo.css; per-shape box only). Group-MOVE undo
and keyframe-aware multi editing (diamonds, one-undo group drag) are OUT of scope
— the separate keyframe-aware item. No schema change, no
`designer-animation-timeline` change. The "Single-selection parity (no
regression)" requirement is unchanged and covers "exactly one selected →
inspector/gizmo/undo unchanged".
