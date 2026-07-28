# Tasks — azan countdown: time-of-day target + colour zones (D-141)

Phase 0 is this change (design-only, complete). Phases 1–7 are the implementation, filed here so
the sequencing and its test debt are visible before any code is written. **No source file is
touched by this change** — every box below Phase 0 is future work.

## 0. Design (this change)

- [x] 0.1 Read D-141 (`docs/prd/designer.md:3707-3786`) and D-139 (`:3641-3670`) on disk; verify
      the D-139 boundary against the actual text before writing it down (design.md §1).
- [x] 0.2 Settle the schema shape — zones, the per-element override set, the `timeofday` target,
      the `clock-target` binding; confirm the whole widening is additive with no schema-version
      bump (design.md §2).
- [x] 0.3 Settle `timeofday` semantics — next-local-occurrence, absolute base, the once-per-run
      PIN, behaviour at/after zero and on re-target (design.md §3).
- [x] 0.4 Settle the playout data path — `text` field + existing `Time (HH:MM)` pattern (no new
      field type), the driver-routed binding, the `retarget()` contract (design.md §4).
- [x] 0.5 Settle the zone mechanism — accept the scope-root attribute + compiled CSS + transition;
      REPLACE plain CSS rules with inherited custom properties, with the CEF-floor evidence for
      why nearest-wins cannot be done any other way here (design.md §5).
- [x] 0.6 Settle the host ↔ nested key contract (free-form keys, name match, inert mismatch) and
      record the ONE remaining open decision — picker vs free text — with a recommendation
      (design.md §6, §9).
- [x] 0.7 Settle the Designer surface and the preview rehearsal mechanism (design.md §7).
- [x] 0.8 `pnpm openspec validate add-azan-countdown --strict` green; repo `format:check` green.

## 1. Schema (`@cg/shared-schema`)

- [ ] 1.1 `elements.ts`: widen `ClockTargetSchema` with `{ kind: 'timeofday', time }`; the regex
      is the canonical one (the Designer preset stays the authoring aid, not a second source).
- [ ] 1.2 `elements.ts`: `ZoneKeySchema`, `ClockZoneStepSchema`, `ClockZonesSchema`
      (`base?` + `steps.min(1)`), `zones` on `ClockElementSchema`.
- [ ] 1.3 `elements.ts`: extend the existing clock `superRefine` — `zones` present with
      `mode !== 'countdown'` is an error; steps strictly decreasing; keys unique across
      `base` + `steps`.
- [ ] 1.4 `elements.ts`: `ZoneColorSchema` (`HexColor | 'zone'`), `ZoneOverrideSchema`,
      `zoneOverrides` on `ElementBaseSchema` (unique zone keys, ≥1 slot per entry).
- [ ] 1.5 `bindings.ts`: widen `BindingTargetSchema` with `{ kind: 'clock-target', elementId }`.
- [ ] 1.6 **Tests** (`pnpm --filter @cg/shared-schema test`): `timeofday` accepts `HH:mm` and
      `HH:mm:ss` and rejects `24:00` / `9:5` / `20:32:60` / empty; zones reject non-decreasing
      thresholds, an empty `steps`, duplicate keys, and presence on `wall`/`countup`;
      `zoneOverrides` reject duplicate zones and an all-empty entry; **a fixture scene authored
      before this change parses byte-identically** and `CURRENT_SCHEMA_VERSION` is still `1` with
      an empty migration registry.

## 2. Clock driver (`@cg/template-runtime`)

- [ ] 2.1 `clock-driver.ts`: `resolveTimeOfDay(time, nowMs)` — local-field construction,
      `<=` rolls to tomorrow, DST-safe via `setDate(+1)`. Exported (design.md §1 helper 2).
- [ ] 2.2 `clock-driver.ts`: pin the resolved deadline at `start()`/`reset()`; branch
      `remainingMs()`, `clockInitialText()` and `isAbsolute` on the new kind.
- [ ] 2.3 `clock-driver.ts`: promote `remainingMsOf` to a public read (helper 1) and add
      `pickByThreshold(steps, remainingMs)` comparing on the DISPLAYED one-second quantum
      (helper 3).
- [ ] 2.4 `clock-driver.ts`: zone publication inside `paint()` behind a `lastZoneKey` latch;
      clear on `reset()`, remove on `destroy()`; accept the scope root via driver options.
- [ ] 2.5 `clock-driver.ts`: `retarget(target)` per the design.md §4.3 table — re-pin, re-arm
      completion only when the new deadline is future, force a repaint, re-evaluate the zone,
      leave the run untouched.
- [ ] 2.6 **Tests** 2.6–2.14 all run on a fake `RuntimeClock` via
      `pnpm --filter @cg/template-runtime test`. Next-occurrence today vs tomorrow, and the
      `now == target` edge (arrived, not a fresh full day).
- [ ] 2.7 A DST spring-forward / fall-back day resolves to the right local instant.
- [ ] 2.8 The deadline does NOT roll forward at zero — the display stays `00:00`,
      `whenComplete()` resolves exactly ONCE, and the driver stops.
- [ ] 2.9 Pause/resume does not delay the deadline (absolute base).
- [ ] 2.10 **Zone-flip boundary exactness**: at the threshold ms and at ±1 ms either side, with
      the selected key asserted against the PAINTED digits (the shared quantum).
- [ ] 2.11 A run through all four zones performs exactly THREE attribute writes (latch proof),
      and at/after zero the lowest step stays selected.
- [ ] 2.12 `reset()` clears the zone and a second loop cycle re-establishes it from the new run.
- [ ] 2.13 `retarget()` on a LIVE countdown: new remaining, no replay, run state preserved, zone
      re-evaluated in one write; an unchanged deadline is a no-op.
- [ ] 2.14 `retarget()` after completion re-arms the display and does NOT re-open the closed hold.

## 3. Zone CSS compiler (`@cg/template-runtime`)

- [ ] 3.1 New `zone-css.ts`: walk the scene, assign a deterministic per-scene INDEX per opted-in
      element, emit the publication rules (per zone key), the consumption rules (`var()` with the
      authored value as fallback) and the transition rule.
- [ ] 3.2 `zoneColorTargets(element)` — the §2.4 kind → CSS-property map, sharing the property
      choices with the existing `color` binding target (helper 4).
- [ ] 3.3 Escape zone keys in selector values; drop an unescapable key with a build warning;
      validate colours before they reach a declaration.
- [ ] 3.4 Inject as `<style id="cg-zones">` beside `ensureBaselineCss`, idempotent.
- [ ] 3.5 `scene-builder.ts`: stamp `data-cg-zone-root` on a scope container owning a zoned
      countdown, and `data-cg-zone-el="<index>"` on opted-in elements.
- [ ] 3.6 **Tests**: emitted CSS is stable and snapshot-clean; an element id containing quotes /
      spaces / a backslash produces well-formed CSS and still styles correctly; **no post-baseline
      CSS feature appears** (no `@scope`, no `:is(`, no `:where(`); an element with no overrides
      emits no rules.

## 4. Runtime wiring (`@cg/template-runtime`)

- [ ] 4.1 `bindings.ts`: `clock-target` returns from the DOM walk with the driver-seam comment,
      exactly as `sequence-item-text` does.
- [ ] 4.2 `runtime.ts`: `reapplyClockTargets()` beside `reapplySequenceItemFields`, called from
      BOTH `play()` and `update()`; parse-failure keeps the current target and reports once.
- [ ] 4.3 `runtime.ts`: pass each scope's container to its clock drivers as the zone scope root.
- [ ] 4.4 **Tests**: a bound `HH:mm` value re-targets on `update()` without replay; an
      unparseable value applies NOTHING and the previous target keeps running; a namespaced
      nested binding routes to the right instance's clock (two instances of one child re-target
      independently); **nested-instance reach** — a host countdown's boundary restyles an opted-in
      element inside a nested composition instance; **nearest-wins** — host and nested countdowns
      in different zones each govern their own subtree; an override with no enclosing zone renders
      the authored style.

## 5. Designer UI (`apps/designer`)

- [ ] 5.1 `StyleSection.tsx`: `timeofday` as a third target kind with its `HH:mm[:ss]` input,
      beside the existing duration / datetime inputs.
- [ ] 5.2 Zones editor (countdown-only): reorderable step list, live validation marking the
      offending row, optional base row.
- [ ] 5.3 The 4-zone preset — one action, ONE undo entry, seeding both `zones` and the clock's own
      `zoneOverrides`.
- [ ] 5.4 The clock's Dynamic / Data affordance for its target (field + `clock-target` binding),
      defaulting the field's `pattern` to the existing `Time (HH:MM)` preset.
- [ ] 5.5 Per-element zone-override section, shown ONLY when the open composition has a zoned
      countdown; only the slots the element's kind owns; `'zone'` default with a resolved swatch.
- [ ] 5.6 The key-mismatch warning (empty intersection with the enclosing countdown's keys).
- [ ] 5.7 Preview: the time-compression rehearsal control (session-only, through the injectable
      clock) and the static zone selector.
- [ ] 5.8 **Resolve open decision §9.1** (zone-key picker vs free text) with the owner before this
      phase ships; the recommendation is the picker with a Custom escape.
- [ ] 5.9 **Tests** (`pnpm --filter @cg/designer test`): the preset writes steps + clock overrides
      as one undo entry; validation marks the offending row only; the override section is hidden
      with no zoned countdown; switching a clock away from `countdown` clears/refuses zones.

## 6. Export parity

- [ ] 6.1 **Tests** (`@cg/single-file-export`, `@cg/vcg-format`): a bound target field appears in
      the GDD as a `single-line` string carrying its `pattern`, with NO new `gddType` and NO
      preflight warning; an UNBOUND clock still leaves the GDD unchanged; the exported HTML
      contains the compiled zone stylesheet and it matches the preview's byte-for-byte.
- [ ] 6.2 Confirm by test that NEITHER exporter needed a zone-specific code path.

## 7. E2E + gate

- [ ] 7.1 Extend `apps/designer/tests/e2e/clock.spec.ts` (or a sibling `azan-countdown.spec.ts`):
      author a `timeofday` countdown, apply the 4-zone preset, add an opted-in shape and a nested
      composition containing another opted-in element, then rehearse — assert the zone flips once
      per boundary and that BOTH the top-level and the nested element restyle.
- [ ] 7.2 A second E2E for the operator path: bind the target to a field, update it live, assert
      the countdown re-targets without replaying.
- [ ] 7.3 `pnpm test:e2e` green (turbo builds first — never against a stale `dist/`).
- [ ] 7.4 Full green gate: `pnpm gate` (plain, never `--force`), with the test task having run
      uncached at least once.
- [ ] 7.5 `pnpm gate:e2e` — and note explicitly that this change alters UI, layout AND rendering,
      so **a Linux `gate:e2e` is OWED**; a green Windows run does not discharge it.
- [ ] 7.6 Engine doc-sync: `packages/template-runtime/README.md` gains the zone mechanism (a new
      extension point + the scope-root contract); `docs/engines/overview.md` updated if the
      compiler counts as a new engine surface.

## 8. Before archive

- [ ] 8.1 Open decision §9.1 answered and the spec text reconciled with the answer.
- [ ] 8.2 The owed Linux `gate:e2e` (7.5) run and reported.
- [ ] 8.3 `docs/prd/designer.md` D-141 flipped, and the D-139 item cross-referenced with the
      helpers it should reuse (design.md §1) so the boundary survives into D-139's own design.
