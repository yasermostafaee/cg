# Central Keyframe-ability + Inspector-field Registry (D-051)

## Why

Keyframe-ability (does a property show a diamond?) and inspector-field presence
are decided ad-hoc in **four** places that drift apart: the right inspector
(`StyleSection.tsx` hand-writes each kind's fields and chooses `animPointIcon`
vs `pointIcon` vs nothing), the timeline-left inspector (`timelineGroupsFor` in
`keyframe-helpers.ts` hand-writes a second per-kind row list), the multi-select
editor (`shared-properties.ts` hand-writes a third per-kind descriptor table),
and the schema's `AnimatablePropertySchema` enum (the only canonical list). Both
`StyleSection.tsx` and `shared-properties.ts` carry explicit `⚠️ SYNC-WITH`
warnings — this is the D-050 "short-path duplication" tech debt. The drift has
already produced wrong diamonds (clock `digits`/`mode` render a dead no-op
diamond; a gradient-filled shape shows a clickable diamond in the timeline-left
but a dead one in the right inspector) and right/left-panel inconsistency, and
every new element kind re-introduces the risk.

## What Changes

- **One central registry** (`apps/designer/src/renderer/features/inspector/field-registry.ts`,
  a pure leaf module typed against `@cg/shared-schema`): per element kind, an
  ordered list of property descriptors — `property` (the `AnimatableProperty`
  id), `label`, `section`, `fieldKind`, `read` (static-value accessor),
  `keyframeable` (per-instance predicate), `multiSelect` (does the multi editor
  expose it), and display metadata (`step`/`min`/`max`/`unit`/`factor`).
  Keyframe-ability is **derived from the schema** — a descriptor can only be
  keyframe-able if its `property` is a member of `AnimatablePropertySchema`. No
  schema change.
- **All three consumers route through it:** `StyleSection.tsx` /
  `TextStyleSection.tsx` / `TransformSection.tsx` ask the registry whether a
  property is keyframe-able for the element (replacing the inline
  `animPointIcon`/`pointIcon` decisions and the per-call read closures);
  `timelineGroupsFor` (`keyframe-helpers.ts`) is **generated** from the registry;
  `shared-properties.ts` (`descriptorsFor`) is **generated** from the registry's
  `multiSelect` subset. Right/left diamond parity falls out because both panels
  read the same registry. This retires the `⚠️ SYNC-WITH` duplication.
- **Diamond-set corrections (the only intended behavior change):** a keyframe
  diamond renders **iff** the property is keyframe-able for that kind. All dead
  no-op glyphs are removed — clock `digits`/`mode`, image `fit`, ticker
  `direction`/`speed`/`gap`, and the gradient-fill fallback. A gradient fill,
  text colour, or background shows **no** diamond on either panel (gradients
  cannot interpolate), which also fixes the existing right/left gradient parity
  break.
- **Scope (settled):** ticker / clock / sequence / repeater **style**
  keyframe-ability (their text, shadow, padding, border-radius) is **deferred to
  a new runtime item, D-052**, because the runtime apply-step
  (`@cg/template-runtime/animation-applier.ts`) gates `text.color` /
  `backgroundColor` to `type==='text'`, mis-applies their shadow, and ignores
  the ticker's inner-viewport padding — adding those diamonds without the runtime
  work would author keyframes the engine silently drops. The registry is shaped
  so D-052 enables them with one declaration each.

## Capabilities

### Added Capabilities

- `designer-inspector-registry`: a new capability owning the central per-kind
  inspector-field registry — the single source of keyframe-ability and field
  presence/section read by the right inspector, the timeline-left inspector, and
  the multi-select editor; the diamond-renders-iff-keyframe-able rule; the
  behavior-preserving refactor guarantee; and the explicit deferral of
  time-driven element styling (D-052).

`designer-animation-timeline`'s behavior is **not** altered (no keyframe-model
change); the registry only changes how the timeline-left's row list is sourced.
`designer-multi-select`'s behavior is preserved (the editor's exposed set and
keyframe-free writes are unchanged; only the source of its descriptors moves to
the registry).

## Impact

- **Registry:** new `features/inspector/field-registry.ts` (single source).
- **Right inspector:** `StyleSection.tsx`, `TextStyleSection.tsx`,
  `TransformSection.tsx` (diamond decision via the registry; remove inline
  `animPointIcon`/`pointIcon` reads; drop dead glyphs in the corrections commit).
- **Timeline-left:** `keyframe-helpers.ts` (`timelineGroupsFor` + `TIMELINE_ROWS`
  - the group builders generated from the registry); `TrackRow.tsx` unchanged in
    behavior.
- **Multi-select:** `shared-properties.ts` (`UNIVERSAL`/`BY_KIND`/`descriptorsFor`
  generated from the registry's `multiSelect` subset); `MultiSelectSection.tsx`
  unchanged in behavior.
- **Tests:** designer units — a per-kind truth-table test (the keyframe-able set
  - section per kind), a right/left parity test, the diamond corrections
    (clock digits/mode, gradient fill, dead-glyph removal); existing
    animation/multi-select tests stay green. E2E — extend an inspector/timeline
    spec (clock digits/mode no diamond; shape border-radius diamond in BOTH panels;
    gradient fill no diamond).
- **Docs:** engine doc-sync in this change — `state/README.md`,
  `timeline/README.md`, and the inspector docs note the registry as the single
  source for keyframe-ability + field presence, and that new kinds/properties
  declare there.
- **PRD:** add `D-052` (deferred runtime item) to `docs/prd/designer.md`.

## Out of scope

- Per-corner border-radius keyframe-ability (D-042) — the registry is shaped to
  support it (per-corner sub-property descriptors) but it is not implemented here.
- Making ticker / clock / sequence / repeater text/shadow/padding/border-radius
  keyframe-able — deferred to **D-052** (requires `@cg/template-runtime`
  apply-step work + runtime tests; out of this renderer-only refactor).
- Any change to the keyframe data model, evaluation, or `.vcg` format.
