# Design — fix-multi-select-inspector-parity

## D1. Extract the field render helpers (single source for both inspectors)

Today `TransformSection.tsx` owns the field primitives privately: `FieldBody`
(icon + `RealtimeNumberInput scrub={false}` + unit `<span class="cg-unit">` +
`fieldScrub` surface), `Seg` (one vector-axis cell) and `SingleField`
(standalone), each taking a `point` (the keyframe diamond). `MultiSelectSection`
duplicates none of this — it uses raw `<input type="number">`. The fix factors
the primitives + the per-property DISPLAY metadata into a new shared module and
has BOTH inspectors consume them:

- `features/inspector/transform-fields.tsx`:
  - `Seg`, `SingleField`, `FieldBody` moved here, with `point?` made OPTIONAL
    (the multi editor passes none) and a new `mixed?` forwarded to the input.
  - `TRANSFORM_FIELD_META: Partial<Record<AnimatableProperty, FieldMeta>>` — the
    SINGLE source of each transform prop's display: `{ icon, ariaLabel, suffix?,
step, min?, max?, toDisplay(stored)→shown, fromDisplay(shown)→stored }`. This
    is where opacity = `◑` + `%` + `×100`, rotation = `↻` + `°`, etc. live.
- `RealtimeNumberInput` (controls.tsx) gains `mixed?: boolean` + `placeholder?`:
  when `mixed`, the buffer shows empty with the placeholder (the neutral mixed
  state) while scrub/keystroke still commit through `onCommit`. No other control
  changes.
- `TransformSection` consumes the shared `Seg`/`SingleField` + `TRANSFORM_FIELD_META`.
  Its rendered output is IDENTICAL (same icons, units, values, diamonds,
  `commitAnimatable`) — verified by the existing single-inspector unit + E2E
  tests. No visual or behavioural change to single selection.

## D2. Rebuild MultiSelectSection on the shared primitives

`MultiSelectSection` renders the shared properties from `sharedEditableProperties`
(unchanged) using the shared helpers:

- Transform props (position X/Y, W/H, rotation, opacity — always shared) render
  via `Seg`/`SingleField` + `TRANSFORM_FIELD_META`, in the SAME layout/order as
  single (X/Y in one input-group, W/H in another, rotation + opacity standalone),
  wrapped in `<CollapseSection title="Transform" pinned>`. No diamonds (`point`
  omitted). A mixed prop passes `mixed` so the field shows the neutral state with
  its unit intact.
- Fill (shared only when every selected element is a shape) renders via the same
  `FillField` single uses, under `<CollapseSection title="Path Style" pinned>`,
  with no diamond; a mixed fill shows a neutral swatch.
- Each field's `onCommit` maps the displayed value back through
  `meta.fromDisplay` and calls `designerStore.applySharedProperty(ids, prop, …)`
  — UNCHANGED group-edit fan-out (`runAsSingleHistoryEntry` →
  `writeStaticAnimatable`, one undo, keyframe-free).

## D3. Per-shape selection boxes (drop the union box)

`MultiGizmo` already computes each element's effective box and draws a per-element
outline PLUS one union box (`s.frame`, `data-testid="multi-select-bbox"`), both
`pointerEvents: none`. The fix draws one solid selection box PER selected shape
(styled like the single gizmo frame, each `data-testid="multi-select-box"`) and
REMOVES the union box. `CanvasOverlay.onPointerDown` and `beginGroupDrag` are
UNCHANGED: a press over a selected member starts the group drag; a press in empty
space hits nothing → `setSelection([])` (it never dragged the group — the union
box was already non-interactive). So removing the box needs no pointer-logic
change; "empty space is not a group-drag handle" is satisfied by the existing
cursor-tool rule.

## D4. Out of scope (recorded)

Keyframe-aware group move/edit is explicitly OUT of scope — group editing and
group move stay keyframe-free here (the keyframe-aware version is a separate
item). No `designer-animation-timeline` change. No schema change. Group
resize/rotate, marquee, and align/distribute remain out (per D-041). The
"Single-selection parity (no regression)" requirement is unchanged and covers the
"exactly one element selected → inspector and gizmo unchanged" acceptance.
