# Design — a hidden content element is inert (B-034)

## Recon

- The hold-driver predicate consulted only `drivesHold`, never `visible`, in every place:
  - Runtime `wireScope` (`runtime.ts`): `holdTickers` / `holdCountdowns` / `holdSequences` and the
    UNFILTERED `contentDrivers` (D-112), and `scopeHasEffectiveHoldDrivers` (the B-032 resolution).
  - `@cg/shared-schema` `hasEffectiveHoldDrivers` (exporter + inspector resolution).
  - Designer walks: `hasContentElement`, `contentHoldElementsOf`, `nestedHoldGroupsOf`
    (`PlayoutSection.tsx`); `tickersOf` + the content-source check (`PreviewScopeTiming.tsx`).
- Render already respects `visible`: `applyBaseStyles` sets `display: none` for `!visible`, and the
  clock/sequence flex/grid display was fixed to not clobber it (#197 + `hide-clock-sequence` E2E). So
  the "still renders" symptom was the loose part of the report; the real gap is the driver predicate
  - the inspector/preview listings.

## Decision: one HARD rule, applied at every predicate

`visible === false` ⇒ inert, evaluated with `el.visible !== false` (the schema field is a required
boolean; `!== false` is defensively absent-tolerant). It is a HARD gate, NOT an override input — it
takes precedence over `drivesHold` AND per-instance `holdOverrides`:

- Runtime: a hidden element is excluded from BOTH the own-hold array AND `contentDrivers`. Excluding
  it from `contentDrivers` is what makes a parent `holdOverrides[id] = true` unable to force a hidden
  element back in (the override only re-filters `contentDrivers`).
- `scopeHasEffectiveHoldDrivers` / `hasEffectiveHoldDrivers`: `el.visible !== false && (override ??
drivesHold !== false)` — so a comp whose only content is hidden has no effective drivers and B-032
  resolves it to timed.
- The Designer walks gate the same way, so a hidden element is dropped from the checklist, the
  infinite-warning count, and the preview per-element timing list.

The driver is still BUILT and the band/host still created (then `display: none`); only the hold
participation + listings change. (Not starting the hidden driver at all is an optional perf tidy-up,
out of scope — a hidden driver is invisible and no longer gates anything, and is stopped on settle.)

## Exporter preflight

`ExporterSingleFile`'s `findFiniteTicker` (the `ticker-finite-with-timed-hold` INFO diagnostic) also
gates `visible !== false`. It does not decide hold participation (it only runs under a TIMED hold), but
surfacing a hidden ticker by name in an operator-facing export issue violates "fully inert", so it is
excluded. Found by the adversarial audit (the one residual leak among all hold/listing surfaces).

## Adversarial audit (completeness)

A 7-agent workflow (one refuter per surface — designer checklist, runtime own hold, runtime nested
aggregation, B-032 resolution, exporter+schema, preview timing — plus a real-`.vcg` inspector) tried
to REFUTE "visible:false is fully excluded". Result: 5/6 surfaces complete; the lone gap was the
exporter preflight above. The decisive structural finding: the visible gate sits at the
`contentDrivers` BUILD site (runtime.ts), so the unfiltered-array-fed-to-override-refilter attack is
closed — a parent `holdOverrides` force-include has nothing to re-admit. The bundled
`fixtures/templates/persian-lower-third.vcg` has no compositions / content / hidden elements, so it
cannot exercise B-034 — a real repro requires a hidden content element.

## Out of scope

- Hiding via a hidden CONTAINER/composition ancestor (the runtime flattens scope content and gates on
  the element's OWN `visible`, matching what the editor hides) — the rule is per content element, and
  it is symmetric across export and on-air (no disagreement).
- `PreviewModal.canStepScene` enabling the transport Next button for a hidden sequence — a stepping/UX
  nuance, not a hold-driver / checklist / timing / render concern. Noted, not changed.
- Any schema / animation-engine change.
