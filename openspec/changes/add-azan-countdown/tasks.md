# Tasks — azan countdown: time-of-day target + colour zones (D-141)

Phase 0 was the design. Phases 1–4 (schema, clock driver, zone CSS compiler, runtime wiring) were
built in `edf8dcba`; phases 5–8 (the Designer UI, export parity, the e2e and the docs) by
`AZAN-DESIGNER-01` (2026-10-15). ~~No source file is touched by this change~~ — superseded: that
sentence described Phase 0 alone.

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
- [x] 0.9 **Owner closed the open decision: the PICKER**, canonical keys
      `normal` / `caution` / `warning` / `critical` with a "Custom…" escape. Folded into
      design.md §6 (now CLOSED) and §7.2; schema and runtime unchanged — the picker is an
      authoring affordance over a still-free-form key, not a validation boundary. → task 5.6.
- [x] 0.10 **Owner added the author-time unmatched-key warning** (design.md §7.3). Runtime
      inert-on-mismatch stays exactly as §5.5 specifies — never fail on air — but the Designer
      stops being silent: a typo is free to fix while authoring and an invisible no-op discovered
      at 2 a.m. otherwise. Specified PER KEY, because the earlier empty-intersection formulation
      misses `{warning, dangre}` under `{warning, danger}`. No schema, no runtime, no exporter
      change. → tasks 5.7, 5.11.
- [x] 0.11 **Reconciled the `designer-zone-styling` delta with design.md §7.3 in the SAME change**
      — requirement sentence and scenario widened from empty-intersection to PER KEY, plus
      scenarios for the rename-orphans case, the non-blocking guarantee, and the
      standalone-preview exclusion. Done here rather than deferred to a "before archive" task:
      a correct fix scoped to one artefact with the sibling deferred is the exact shape that
      produced [[B-111]] and [[B-112]] (D-060 §F audited and repaired one workspace, its task
      list named only that workspace, and the sibling it left behind became the bug), and
      "before archive" is precisely when such an item gets missed.
- [x] 0.12 Re-validated after folding all three — strict validate of this change green, and
      `pnpm openspec validate --all --strict` 41/41; repo `format:check` green.

## 1. Schema (`@cg/shared-schema`)

- [x] 1.1 `elements.ts`: widen `ClockTargetSchema` with `{ kind: 'timeofday', time }`; the regex
      is the canonical one (the Designer preset stays the authoring aid, not a second source).
- [x] 1.2 `elements.ts`: `ZoneKeySchema`, `ClockZoneStepSchema`, `ClockZonesSchema`
      (`base?` + `steps.min(1)`), `zones` on `ClockElementSchema`.
- [x] 1.3 `elements.ts`: extend the existing clock `superRefine` — `zones` present with
      `mode !== 'countdown'` is an error; steps strictly decreasing; keys unique across
      `base` + `steps`. (Placement per design.md §2.2: the mode gate is on the clock's own
      `superRefine`; strictly-decreasing + key-uniqueness are on `ClockZonesSchema`, where §2.2's
      code sketch puts them, so the issue path names the offending STEP.)
- [x] 1.4 `elements.ts`: `ZoneColorSchema` (`HexColor | 'zone'`), `ZoneOverrideSchema`,
      `zoneOverrides` on `ElementBaseSchema` (unique zone keys, ≥1 slot per entry). Uniqueness
      rides on the ARRAY schema, because `ElementBaseSchema` must stay a `ZodObject` — every
      element kind `.extend()`s it and a `superRefine` there would break all of them.
- [x] 1.5 `bindings.ts`: widen `BindingTargetSchema` with `{ kind: 'clock-target', elementId }`.
- [x] 1.6 **Tests** (`pnpm --filter @cg/shared-schema test`): `timeofday` accepts `HH:mm` and
      `HH:mm:ss` and rejects `24:00` / `9:5` / `20:32:60` / empty; zones reject non-decreasing
      thresholds, an empty `steps`, duplicate keys, and presence on `wall`/`countup`;
      `zoneOverrides` reject duplicate zones and an all-empty entry; **a fixture scene authored
      before this change parses byte-identically** and `CURRENT_SCHEMA_VERSION` is still `1` with
      an empty migration registry.

## 2. Clock driver (`@cg/template-runtime`)

- [x] 2.1 `clock-driver.ts`: `resolveTimeOfDay(time, nowMs)` — local-field construction,
      DST-safe via `setDate(+1)`. Exported (design.md §1 helper 2). **The comparison is `<`, not
      the `<=` in design.md §3.1's pseudo-code:** an occurrence exactly equal to now counts as
      ARRIVED, per the spec delta ("SHALL count as ARRIVED, not as a fresh full day"), task 2.6
      below, and §3.1's own prose. See the PR's Findings — design.md §3.1/§3.3 need correcting.
- [x] 2.2 `clock-driver.ts`: pin the resolved deadline at `start()`/`reset()`; branch
      `remainingMs()`, `clockInitialText()` and `isAbsolute` on the new kind.
- [x] 2.3 `clock-driver.ts`: promote `remainingMsOf` to a public read (helper 1) and add
      `pickByThreshold(steps, remainingMs)` comparing on the DISPLAYED one-second quantum
      (helper 3). **The TIGHTEST covering step wins** (the last match over a strictly-decreasing
      list), not the first: first-match-wins would select the 60-minute zone for every remaining
      time under an hour and contradicts "at and after zero the LOWEST step stays selected".
      See the PR's Findings — design.md §5.3 needs correcting.
- [x] 2.4 `clock-driver.ts`: zone publication inside `paint()` behind a `lastZoneKey` latch;
      clear on `reset()`, remove on `destroy()`; accept the scope root via driver options.
- [x] 2.5 `clock-driver.ts`: `retarget(target)` per the design.md §4.3 table — re-pin, re-arm
      completion only when the new deadline is future, force a repaint, re-evaluate the zone,
      leave the run untouched. A FRESH promise is minted only when the previous one already
      RESOLVED: replacing a still-pending one would strand the hold the scope is awaiting.
- [x] 2.6 **Tests** 2.6–2.14 all run on a fake `RuntimeClock` via
      `pnpm --filter @cg/template-runtime test`. Next-occurrence today vs tomorrow, and the
      `now == target` edge (arrived, not a fresh full day).
- [x] 2.7 A DST spring-forward / fall-back day resolves to the right local instant.
- [x] 2.8 The deadline does NOT roll forward at zero — the display stays `00:00`,
      `whenComplete()` resolves exactly ONCE, and the driver stops.
- [x] 2.9 Pause/resume does not delay the deadline (absolute base).
- [x] 2.10 **Zone-flip boundary exactness**: at the threshold ms and at ±1 ms either side, with
      the selected key asserted against the PAINTED digits (the shared quantum).
- [x] 2.11 A run through all four zones performs exactly THREE attribute writes (latch proof),
      and at/after zero the lowest step stays selected. The three are the BOUNDARY CROSSINGS; the
      run's own establishing write (entering `base`) is asserted separately, since a zone cannot
      be published without writing it once.
- [x] 2.12 `reset()` clears the zone and a second loop cycle re-establishes it from the new run.
- [x] 2.13 `retarget()` on a LIVE countdown: new remaining, no replay, run state preserved, zone
      re-evaluated in one write; an unchanged deadline is a no-op.
- [x] 2.14 `retarget()` after completion re-arms the display and does NOT re-open the closed hold.

## 3. Zone CSS compiler (`@cg/template-runtime`)

- [x] 3.1 New `zone-css.ts`: walk the scene, assign a deterministic per-scene INDEX per opted-in
      element, emit the publication rules (per zone key), the consumption rules (`var()` with the
      authored value as fallback) and the transition rule. **Plus a RESET rule** keyed on
      `data-cg-zone-root`, emitted first: without it a host's published value inherits straight
      through a nested zoned root that happens not to publish that slot, and the nested countdown
      silently fails to govern its own subtree (design.md §5.2's walkthrough only covers the case
      where both zones publish the same slot). Consumption declarations carry `!important`,
      because the scene-builder writes every authored colour as an INLINE style — without it the
      compiled rules could never win. Both noted in the PR.
- [x] 3.2 `zoneColorTargets(element)` — the §2.4 kind → CSS-property map, sharing the property
      choices with the existing `color` binding target (helper 4). Two narrowings vs. §2.4's
      summary table, both following D-056 and the renderer as it is: `ticker`/`clock`/`sequence`
      own ONLY `textColor` (design.md §2.3 states this for the clock in words), and a slot whose
      AUTHORED value is a gradient is omitted rather than flattened.
- [x] 3.3 Escape zone keys in selector values; drop an unescapable key with a build warning;
      validate colours before they reach a declaration.
- [x] 3.4 Inject as `<style id="cg-zones">` beside `ensureBaselineCss`, idempotent.
- [x] 3.5 `scene-builder.ts`: stamp `data-cg-zone-root` on a scope container owning a zoned
      countdown, and `data-cg-zone-el="<index>"` on opted-in elements. All four scope containers
      are stamped — root stage, composition instance, sequence composition item, repeater row.
- [x] 3.6 **Tests**: emitted CSS is stable and snapshot-clean; an element id containing quotes /
      spaces / a backslash produces well-formed CSS and still styles correctly; **no post-baseline
      CSS feature appears** (no `@scope`, no `:is(`, no `:where(`); an element with no overrides
      emits no rules.

## 4. Runtime wiring (`@cg/template-runtime`)

- [x] 4.1 `bindings.ts`: `clock-target` returns from the DOM walk with the driver-seam comment,
      exactly as `sequence-item-text` does.
- [x] 4.2 `runtime.ts`: `reapplyClockTargets()` beside `reapplySequenceItemFields`, called from
      BOTH `play()` and `update()`; parse-failure keeps the current target and reports once
      (an `error` event, `code: 'clock-target-unparseable'`, deduped per element + value).
- [x] 4.3 `runtime.ts`: pass each scope's container to its clock drivers as the zone scope root.
- [x] 4.4 **Tests**: a bound `HH:mm` value re-targets on `update()` without replay; an
      unparseable value applies NOTHING and the previous target keeps running; a namespaced
      nested binding routes to the right instance's clock (two instances of one child re-target
      independently); **nested-instance reach** — a host countdown's boundary restyles an opted-in
      element inside a nested composition instance; **nearest-wins** — host and nested countdowns
      in different zones each govern their own subtree; an override with no enclosing zone renders
      the authored style. NOTE: jsdom resolves neither `var()` nor the cascade, so the three
      zone-reach tests assert the full CHAIN (which scope root publishes which key, which element
      carries which slot index, what the compiled stylesheet declares for that key) rather than a
      computed colour. The pixel proof is owed to the phase-7 E2E and is NOT claimed here.

## 5. Designer UI (`apps/designer`)

- [x] 5.1 `StyleSection.tsx`: `timeofday` as a third target kind with its `HH:mm[:ss]` input,
      beside the existing duration / datetime inputs. (`b57602ff`; `B-344` fixed with it — `azan-zones.dom.test.ts`, red on the old select)
- [x] 5.2 Zones editor (countdown-only): reorderable step list, live validation marking the
      offending row, optional base row. (`ClockZonesSection.tsx`; a draft with an issue is never stored) ⚠ **SUPERSEDED by §9** — delta A replaced zones with steps; the editor and its file are gone (9.4, 9.9).
- [x] 5.3 The 4-zone preset — one action, ONE undo entry, seeding both `zones` and the clock's own
      `zoneOverrides`. (`applyAzanPreset`, `runAsSingleHistoryEntry`) ⚠ **SUPERSEDED by §9** — the preset is now three STEPS turning the digits yellow / orange / red, named by no event (9.4).
- [x] 5.4 The clock's Dynamic / Data affordance for its target (field + `clock-target` binding),
      defaulting the field's `pattern` to the existing `Time (HH:MM)` preset. (`clock-data-key.ts` / `ClockTargetDataKey.tsx`; one undo entry) ⚠ **SUPERSEDED by §9** — the pattern now follows the value (`Time (HH:MM[:SS])` / ISO) and the field is exposed by default as `Target time` (9.6).
- [x] 5.5 Per-element zone-override section, shown ONLY when the open composition has a zoned
      countdown; only the slots the element's kind owns; `'zone'` default with a resolved swatch. (`ZoneOverridesSection.tsx`; enclosing = the open composition and every one instancing it; slots through `@cg/template-runtime/zone-css`) ⚠ **SUPERSEDED by §9** — the element's door is now the steps summary and `Edit in steps…` (9.4, 9.9).
- [x] 5.6 The zone-key PICKER (design.md §6, owner-closed): `normal` / `caution` / `warning` /
      `critical` plus a "Custom…" escape, on both the zones editor and the override section.
      Custom is a DISPLAY state, not a stored value — a stored key that is not one of the four
      loads as Custom with its string intact. The picker does NOT narrow the schema: a custom key
      stays valid, parses and renders. (`ZoneKeyPicker`) ⚠ **SUPERSEDED by §9** — steps have no keys to pick (9.1).
- [x] 5.7 The unmatched-zone-key authoring warning (design.md §7.3): non-blocking, PER KEY (not
      per element / not empty-intersection), shown at the override that declared it, naming the
      unmatched key and listing the keys the enclosing countdown defines. Also raised on the
      zones editor when RENAMING a zone key would orphan existing overrides. Never blocks save,
      export or play; never becomes a schema error; NOT raised for a composition previewed
      standalone (no enclosing countdown at all is a supported authoring state, not a mistake).
      Designer-only — no schema field, no runtime branch, no exporter change. (per key at the override; on the zones editor as the orphaned keys a rename leaves) ⚠ **SUPERSEDED by §9** — a step names its element directly, so no key can be unmatched (9.1).
- [x] 5.8 Preview: the time-compression rehearsal control (session-only, through the injectable
      clock) and the static zone selector. (`clock-rate` ×10 / ×60 / ×600 and `force-zone` in `preview.ts`; session-only) ⚠ **SUPERSEDED by §9** — the static selector forces a STEP (`rehearse-step`), and the Steps dialog drives the canvas too (9.4, 9.9).
- [x] 5.9 **Tests** (`pnpm --filter @cg/designer test`): the preset writes steps + clock overrides
      as one undo entry; validation marks the offending row only; the override section is hidden
      with no zoned countdown; switching a clock away from `countdown` clears/refuses zones. (`apps/designer/tests/azan-zones.dom.test.ts`, 13 tests) ⚠ **SUPERSEDED by §9** — renamed `countdown-steps.dom.test.ts` and rewritten for steps (9.4).
- [x] 5.10 **Tests for the picker**: each canonical key round-trips; a stored custom key displays
      as Custom with its string intact and is not rewritten on load; the picker never rejects or
      normalises a custom key (schema unchanged). (same file) ⚠ **SUPERSEDED by §9** — removed with the picker (9.1).
- [x] 5.11 **Tests for the warning**: overrides `{warning, dangre}` under a countdown defining
      `{warning, danger}` raise EXACTLY ONE warning, naming `dangre` — the per-key case an
      empty-intersection check would miss; a fully matched element raises none; renaming a
      countdown's zone key raises the warning on the now-orphaned overrides; a standalone-previewed
      composition raises none; the warning blocks nothing (save, export and play still succeed)
      and the RUNTIME still renders the unmatched element with its authored style (inert, §5.5). (same file; the runtime half — an unmatched key renders authored — is `zone-css.test.ts`) ⚠ **SUPERSEDED by §9** — removed with the keys; `zone-css.test.ts` became `step-css.test.ts` (9.2).

## 6. Export parity

- [x] 6.1 **Tests** (`@cg/single-file-export`, `@cg/vcg-format`): a bound target field appears in
      the GDD as a `single-line` string carrying its `pattern`, with NO new `gddType` and NO
      preflight warning; an UNBOUND clock still leaves the GDD unchanged; the exported HTML
      contains the compiled zone stylesheet and it matches the preview's byte-for-byte. (`packages/single-file-export/tests/zone-export-parity.test.ts`, `414c1377`) ⚠ **SUPERSEDED by §9** — now `step-export-parity.test.ts`, run on steps AND on a migrated zoned scene (9.2).
- [x] 6.2 Confirm by test that NEITHER exporter needed a zone-specific code path. (same file: a zoned and an unzoned scene export to the same page bar the embedded scene; the GDD is identical)

## 7. E2E + gate

- [x] 7.1 Extend `apps/designer/tests/e2e/clock.spec.ts` (or a sibling `azan-countdown.spec.ts`):
      author a `timeofday` countdown, apply the 4-zone preset, add an opted-in shape and a nested
      composition containing another opted-in element, then rehearse — assert the zone flips once
      per boundary and that BOTH the top-level and the nested element restyle. (`apps/designer/tests/e2e/azan-countdown.spec.ts`, `94dee038`; local Windows: passed) ⚠ **SUPERSEDED by §9** — now `countdown-steps.spec.ts`, through the Steps dialog (9.4, 9.9).
- [x] 7.2 A second E2E for the operator path: bind the target to a field, update it live, assert
      the countdown re-targets without replaying. (same spec; local Windows: passed)
- [x] 7.3 `pnpm test:e2e` green (turbo builds first — never against a stale `dist/`). (CI `pnpm test:e2e` on `5c5422ff`, https://github.com/yasermostafaee/cg/actions/runs/38645221172 — the E2E step RAN: designer 321 passed / 13 skipped, runtime 344 passed / 2 skipped; both `azan-countdown.spec.ts` tests among them)
- [x] 7.4 Full green gate: `pnpm gate` (plain, never `--force`), with the test task having run
      uncached at least once. (the pre-push `pnpm gate` for `5c5422ff`, uncached; CI `ci` job green on the same run)
- [x] 7.5 `pnpm gate:e2e` — and note explicitly that this change alters UI, layout AND rendering,
      so **a Linux `gate:e2e` is OWED**; a green Windows run does not discharge it. (UI, layout AND rendering changed, so a Linux `gate:e2e` was OWED; DISCHARGED by https://github.com/yasermostafaee/cg/actions/runs/38645221172, `completed` / `success`, the E2E step RAN — not a Windows pass)
- [x] 7.6 Engine doc-sync: `packages/template-runtime/README.md` gains the zone mechanism (a new
      extension point + the scope-root contract); `docs/engines/overview.md` updated if the
      compiler counts as a new engine surface. (`packages/template-runtime/README.md` "Countdown ZONES" + the `zone-css` subpath; `docs/engines/overview.md`) ⚠ **SUPERSEDED by §9** — both now describe STEPS; the subpath is gone (9.12).

## 8. Before archive

- [x] 8.1 The owed Linux `gate:e2e` (7.5) run and reported. (https://github.com/yasermostafaee/cg/actions/runs/38645221172)
- [x] 8.2 `docs/prd/designer.md` D-141 flipped (`[~]`; `[x]` at archive), and the D-139 item cross-referenced with the
      helpers it should reuse (design.md §1) so the boundary survives into D-139's own design.

## 9. `RUN-NEXT-VERSION-01` deltas A–H (2026-10-15)

Lanes: A, C, D, E, F and G **FULL** (schema, a predicate, the path to air); B and H **FAST** for
their layout, FULL where they touch the store or the canvas page (the target field's exposure, the
rehearse strip's `rehearse-step` message). No wire line, schema version or persisted key changed in B
or H.

- [x] 9.1 Schema (-A, -D, -F): `CountdownStepsSchema` (Before, thresholds strictly decreasing across
      zero, the row named by its path), `ElementChangeSchema` (eight properties, one per property per
      element per step), `ChangeTransitionSchema` (cut / fade, 300 ms default), `afterZero`,
      `startsHidden`, the derived `countdown` marker on a text field. (`af99d0c2`; tests
      `countdown-steps.test.ts`)
- [x] 9.2 Runtime (-A, -D, -E, -F): `step-css.ts` (one attribute per crossing, inheriting custom
      properties, the wrapper), `step-effects.ts` (picture swap, instance cues), `afterZero` in the
      driver, `rehearseStep`; the single-file exporter collects a step's picture. (`bf44b535`; tests
      `step-css.test.ts`, `countdown-after-zero.test.ts`, `countdown-steps-runtime.test.ts` — its
      cascade-skip ablation goes red twice —, `step-export-parity.test.ts`,
      `step-image-export.test.ts`)
- [x] 9.3 Migration (-A): `migrateCountdownZones`, registered third in `SCENE_MIGRATIONS`; same
      on-air result bar the two stated deviations (design.md §10.2); CEF-safe (`c6df4c2f`).
- [x] 9.4 Designer, both doors (-A, -B, -D, -E, -F): steps from the countdown and from the element,
      After zero with the Close fact, Starts hidden, the Preview's forced step. (`67101c3d`; tests
      `countdown-steps.dom.test.ts`, e2e `countdown-steps.spec.ts`)
- [x] 9.5 No user-visible "Azan" (-A §1). Sweep, two axes, every pathspec proved to match:
      STRING (`azan`, `Azan`, `AZAN`, `adhan`, `اذان`, `أذان`, case-insensitive; files per pathspec
      267 / 259 / 551 / 701 / 295 / 385) and COMPONENT (`ClockZonesSection`, `ZoneOverridesSection`,
      `ZoneKeyPicker`, `applyAzanPreset`, `AZAN_PRESET`, `zones-azan-preset`, `zone-css`).
      Before (`2bdd5ffa`): 16 hits in the Designer's source, ONE user-visible (the button
      "Azan preset (60 / 30 / 10)"); 24 component hits. After: 0 user-visible; source keeps one
      comment naming this change's directory; component hits 0 in code (two prose mentions in the
      runtime README and a test header, both historical). Test fixtures keep an author's template
      name `ساعت اذان` and a data key `azan` as DATA, not product copy; a test pins the absence in
      the steps UI.
- [x] 9.6 The target the operator sets, Designer half (-B, -C): the typed date and time control
      (`ui/DateTimeInput.tsx`, three calendars, the Lunar adjustment per browser), `Target time` by
      default, the default following the target, the pattern following the value. Measured in
      Chrome: the date overflowed the Inspector at 200 % text until each box became a `.cg-field`.
      (`a81b694c`; tests `date-time-input.dom.test.ts`, `countdown-steps.dom.test.ts` — 4 red under
      ablation of the exposure and the sync —, e2e `date-time-input.spec.ts`)
- [x] 9.7 The page re-targets from a time OR an ISO instant, any digit set (-C). (`8bede2c2`)
- [x] 9.8 CG Control half (-C): the import marks the target field (`b4d785c7`); the shared control
      (`f7a10a9f`); the station's Lunar day adjustment in Station setup · Calendar (`19092af5`); the
      bridge host's clock in `bridge.capabilities` (`5e9a5641`); the Inspector's control, the
      passed-target fact and the two clocks (`b81e94f7`); the wire pinned on an amcp-mock trace —
      on air ONE `CG 1-<layer> UPDATE 0 "{\"targetTime\":\"2026-10-15T21:50:00+03:30\"}"`, nothing
      else; after OUT nothing until the take re-ADDs with the new value; a loaded, never-taken row
      gets the same one `CG UPDATE` (its page is on the layer) and no playout command
      (`d52b95b5`, `countdown-target-update.integration.test.ts`); e2e in three calendars
      (`8e2ee28d`) and at 200 % zoom / RTL with a positive control (`4b90ce42`). Built by a
      background agent in a worktree, reviewed and cherry-picked; its two red-alone commits folded
      into their fixes so every commit is green.
- [x] 9.9 The Steps dialog (-H): the Inspector keeps a summary; one dialog from both doors, held in
      the store so an undo cannot close it (measured red in Chrome first); list with drag handle and
      ↑ / ↓; `⋯` menus of words; the changes table; the rehearse strip on the canvas.
      (`344184f4`; tests `steps-dialog.dom.test.ts`, e2e `steps-dialog.spec.ts` incl. 1280 × 720,
      200 % text and RTL)
- [x] 9.10 Local Windows e2e (non-authoritative): `countdown-steps.spec.ts`, `date-time-input.spec.ts`,
      `steps-dialog.spec.ts` — 8 passed in system Chrome.
- [x] 9.11 The Linux `e2e` job RAN green on the pushed commit — https://github.com/yasermostafaee/cg/actions/runs/38701929266 (`39bbb5d4`, which carries it): `completed` / `success`; both heavy jobs RAN — Designer 333 passed / 13 skipped, CG Control 346 passed / 2 skipped, read from the run log; `countdown-steps`, `date-time-input`,
      `steps-dialog` and CG Control's `countdown-target` (both tests) among the passed. The first run on `15be0821`
      ([38668193061](https://github.com/yasermostafaee/cg/actions/runs/38668193061)) was red — a real `-0` clock defect
      (`065a880d`) and the Designer suite past its 8 min budget (`e5df2a0f`).
- [x] 9.12 Engine doc-sync: `packages/template-runtime/README.md` "Countdown STEPS" (and the gone
      `zone-css` subpath), `docs/engines/overview.md`.
- [x] 9.13 `pnpm gate` green before the push; `openspec validate --strict` green. (the pre-push gate for
      `15be0821`: 99 / 99, 0 cached; OpenSpec 89 / 89, `--strict`)
- [x] 9.14 The owner's two (2026-10-15, after H — FAST lane, no schema): `B-347`, the colour picker drew UNDER
      the Steps dialog and Escape closed the dialog — popovers above dialogs, the Modal stands aside while one is
      open (e2e red at the old z-index, dom red with the rule removed); and the steps' DEFAULT colours — the
      Default row (the schema's Before) is always offered first in the dialog, and Add change with no filter starts
      on the countdown's own text colour. (`steps-dialog.dom.test.ts`, e2e `steps-dialog.spec.ts`; local Windows:
      7 passed)
