# Azan countdown — time-of-day target + composition-deep colour zones (D-141)

## Why

Prayer-time programming needs an on-air countdown whose urgency is readable at a glance across
the WHOLE template, not just on the digits. The client fakes this today outside the designer
with a PNG sequence an operator clicks through (recorded in D-139's Why,
`docs/prd/designer.md:3649-3650`). Two capabilities are missing:

1. A countdown cannot target a **wall-clock time of day**. `ClockTargetSchema` offers only a
   relative `duration` and an absolute `datetime` ISO instant
   (`packages/shared-schema/src/elements.ts:242-248`), so "count down to 20:32, every day, from
   the same template" is unauthorable — a `datetime` target names ONE calendar day and is stale
   tomorrow.
2. Nothing can broadcast a countdown's urgency to other elements. The clock has no dynamic
   fields at all (`openspec/specs/designer-clock-element/spec.md:130,151`), and no element
   carries state that reacts to another element's time.

Mainstream CG products ship no native equivalent (Viz / Singular / vMix reach for per-template
scripting); stage-timer products standardised it as "wrap-up colours". Making both first-class
and DECLARATIVE fits this product's no-user-scripting philosophy.

**This change is DESIGN-ONLY.** It settles the schema shape, the runtime mechanism, the playout
data path, and the Designer surface, and files the implementation phases. No production code,
no schema edit, no runtime or exporter change lands here.

## What Changes

- **A `timeofday` countdown target** — `{ kind: 'timeofday', time: 'HH:mm' | 'HH:mm:ss' }`
  widening `ClockTargetSchema`. It resolves to the NEXT LOCAL occurrence (today if still ahead,
  else tomorrow) on the rendering machine's clock, and is **pinned to an absolute epoch deadline
  once per run** — an absolute time base like `datetime`, so a pause never delays it and
  `whenComplete()` still fires exactly once.

- **Colour zones on a countdown** — an ordered, strictly-decreasing list of thresholds on
  REMAINING time, each opening a NAMED zone with a colour, plus an optional base zone above the
  highest threshold. The client's 4-zone 60/30/10-minute preset is offered. Countdown-only:
  rejected by schema refinement on `wall`/`countup`, and ignored by the runtime as defence in
  depth.

- **Zone-reactive elements, composition-deep** — an optional `zoneOverrides` on
  `ElementBaseSchema` lets ANY element opt into per-zone colours (text colour, background
  colour, shape fill, shape stroke). The runtime publishes the active zone at the scope root of
  the composition owning the zoned countdown and the overrides resolve through **CSS custom
  property inheritance**, which gives "nearest enclosing zoned scope wins" and "inert when no
  zone encloses me" for free — see design.md §5. Nested composition instances are reached because
  `buildComposition` appends them into the SAME document
  (`packages/template-runtime/src/scene-builder.ts:275`).

- **The target is operator-editable at playout** — a new `{ kind: 'clock-target', elementId }`
  binding target, driven by an ordinary **`text` field with the existing `Time (HH:MM)` pattern
  preset** (`apps/designer/src/renderer/features/inspector/pattern-presets.ts:65`). A live
  `CG UPDATE` re-targets a RUNNING countdown without replaying it, through a new `retarget()`
  driver seam wired exactly like `reapplySequenceItemFields`
  (`packages/template-runtime/src/runtime.ts:1541-1544,1713,1794`).

- **Zone CSS is emitted by the RUNTIME from the scene**, beside `ensureBaselineCss`
  (`packages/template-runtime/src/runtime.ts:397`). Because the single-file export embeds the
  scene JSON and boots `CG.createRuntime(scene, …)`
  (`packages/single-file-export/src/exporter-single-file.ts:421-423`), preview and export get
  byte-identical rules and **neither exporter changes at all**.

- **Preview rehearsal** — a session-only time-compression factor on the already-injectable
  `RuntimeClock` (`packages/template-runtime/src/types.ts:291-298`) runs the real driver through
  every real boundary in order, plus a static zone picker for pure styling work. Neither is
  persisted; neither reaches an exporter.

## Out of scope (recorded, not built here)

- **Azan schedule / table import** — the yearly official per-city table auto-filling the field
  daily (R-track, D-141 Notes). The operator enters the OFFICIAL announced time; computed prayer
  times must never be the broadcast default.
- **Channel-wide zone state across separate templates / Caspar layers** — a runtime/bridge
  shared-state concept (R-track, D-141 Notes).
- **Zones for `wall` / `countup` clocks** — countdown-only by acceptance.
- **D-139's rule engine.** design.md §1 draws the boundary and names the pieces D-139 must
  REUSE; it does not authorise designing D-139.
- **A `datetime`-valued binding.** The `clock-target` binding accepts `HH:mm[:ss]` in v1; a full
  ISO instant is a later widening of the same target kind.

## Impact

- **Affected specs:** `designer-clock-element` (MODIFIED × 3 + ADDED × 3),
  `designer-zone-styling` (NEW capability).
- **Affected code (at implementation time, not here):** `@cg/shared-schema`
  (`elements.ts`, `bindings.ts`), `@cg/template-runtime` (`clock-driver.ts`, `scene-builder.ts`,
  `runtime.ts`, `bindings.ts`, new `zone-css.ts`), `apps/designer` inspector
  (`StyleSection.tsx` clock section + a zone-overrides section). **No `apps/runtime` change** —
  a `text` field already renders in the Runtime Inspector. **No exporter change** — both
  exporters carry the scene and the runtime emits the CSS.
- **Schema version:** stays `1`. Every new field is optional and both union widenings are
  additive; `CURRENT_SCHEMA_VERSION` and the empty migration registry are untouched
  (`packages/shared-schema/src/migrations/index.ts:19-31`). See design.md §2 for the one honest
  caveat.
