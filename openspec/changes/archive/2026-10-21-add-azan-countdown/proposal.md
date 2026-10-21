# Countdown to a time of day — steps that change any element, and a target the operator sets (D-141)

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

The change was designed first (design.md §1–7) and implemented in phases 1–8. In
`RUN-NEXT-VERSION-01` (2026-10-15) the owner's deltas **A … H** reshaped it: colour ZONES became
STEPS that change any element, the target became a typed date and time the operator sets, the
countdown gained an after-zero choice, and step editing moved into a Steps dialog. design.md §8
records those decisions; the text below describes the change as it now stands.

## What Changes

- **A `timeofday` countdown target** — `{ kind: 'timeofday', time: 'HH:mm' | 'HH:mm:ss' }`
  widening `ClockTargetSchema`. It resolves to the NEXT LOCAL occurrence (today if still ahead,
  else tomorrow) on the rendering machine's clock, and is **pinned to an absolute epoch deadline
  once per run** — an absolute time base like `datetime`, so a pause never delays it and
  `whenComplete()` still fires exactly once.

- **Steps on a countdown** (delta A, replacing D-141 v1's colour zones) — Before, steps at
  thresholds on REMAINING time, At zero and steps after zero, each a list of CHANGES: _this element →
  this property (show / hide, opacity, text colour, background, fill, stroke, blink, picture) → this
  value_, with a cut or a fade (300 ms by default). A change reverts when its step is left unless
  the next step sets it. A countdown reaches its own composition and the instances inside it; a
  nested composition with steps of its own governs its own subtree. The preset is three steps at
  60 / 30 / 10 minutes turning the digits yellow, orange and red. No product copy names an event.

- **Composition instances on a step** (delta F) — show / hide on an instance plays its OWN entrance
  and exit through the existing nested lifecycle; an instance may **start hidden**. No step changes
  geometry directly.

- **After zero** (deltas D and E) — hold at zero (default), count past zero (`−00:12`), hide the
  digits, or close the graphic through the existing content-driven completion (`CG … STOP`, no new
  wire line). Steps after zero are reached in time order.

- **The target is the operator's** (deltas B and C) — the `clock-target` binding takes a time of
  day OR an ISO date and time (the value decides), any digit set. A time-of-day or date-and-time
  countdown exposes it by default as `Target time` (`targetTime`), the author's target its default.
  Both apps type it through ONE shared date and time control — typed segments, three calendars
  (Solar Hijri by default, Gregorian, Lunar Hijri with a −2 … +2 day adjustment), the stored value
  always ISO or `HH:mm[:ss]`. CG Control sets it per row; on air that is the row's existing
  `CG UPDATE` and nothing else, with no page on the layer it is state only, and a passed target is
  stated, never refused.

- **Steps are compiled by the RUNTIME from the scene** — one attribute per step crossing on the
  scope root and one stylesheet of inherited custom properties (`step-css.ts`), plus JS cues for a
  picture swap and an instance (`step-effects.ts`). Preview and export run the same compiler; the
  bridge sends nothing new. D-141 v1 zones migrate into steps on load (`migrateCountdownZones`).

- **The Designer surface** (deltas B and H) — the Inspector shows a summary (After zero, one line
  per step, `Edit steps…`; on an element, the steps that change it and `Edit in steps…`); every
  editor lives in the Steps dialog, with a rehearse strip driving the canvas. The Preview rehearses
  by time compression or a forced step. None of it is saved or exported.

## Out of scope (recorded, not built here)

- **A prayer-time schedule / table import** — the yearly official per-city table auto-filling the
  field daily (R-track, D-141 Notes). The operator enters the OFFICIAL announced time; computed
  times must never be the broadcast default.
- **Channel-wide step state across separate templates / Caspar layers** — a runtime/bridge
  shared-state concept (R-track, D-141 Notes).
- **Steps for `wall` / `countup` clocks** — countdown-only by acceptance.
- **D-139's rule engine.** The change records are independent of their source so D-139 can produce
  them; this change does not design D-139.
- **A per-row after-zero override in CG Control** — an owner question (delta E), not built.
- **Steps that change geometry** — the owner's decision (delta F), recorded in the PRD.

## Impact

- **Affected specs:** `designer-clock-element` (MODIFIED × 3 + ADDED × 3),
  `designer-countdown-steps` (NEW capability; it replaces the `designer-zone-styling` capability
  this change first proposed, which never reached `openspec/specs/`), and CG Control's
  `runtime-template-library` (the operator's target field) and `runtime-ui` (the date and time
  control; Station setup · Calendar).
- **Affected code:** `@cg/shared-schema` (`elements.ts`, `element-changes.ts`, `countdown.ts`,
  `fields.ts`, `bindings.ts`, `scene-migrations.ts`), `@cg/text-shaping` (`calendar.ts`,
  `date-segments.ts`, `numerals.ts`), `@cg/template-runtime` (`clock-driver.ts`, `step-css.ts`,
  `step-effects.ts`, `scene-builder.ts`, `runtime.ts`), `@cg/single-file-export`
  (`image-export.ts` collects a step's picture), `apps/designer` (the countdown and element
  Inspector sections, the Steps dialog, the date and time control), `apps/runtime` and the bridge
  (the operator's target field, the station's Lunar day adjustment, the bridge host's clock).
- **Schema version:** stays `1`. Every new field is optional; the zones' legacy keys stay
  parseable and a registered scene migration rewrites them into steps.
