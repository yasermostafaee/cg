# Guard against an infinite-repeat content element silently driving the hold (D-111)

## Why

A content-driven hold holds until ALL its non-excluded content completes (D-104/B-031) — a
`Promise.all` over its drivers. A `ticker` / `sequence` with `repeat: 'infinite'` never
completes, so one such element among the drivers silently forces an infinite parent hold. A
real authored scene (a content-driven parent nesting a `repeat: 'infinite'` sequence + a finite
ticker) froze with no indication why — the runtime was CORRECT (D-104: infinite content ⇒
hold-until-stop), but nothing told the operator. This is a discoverability / footgun gap, not a
runtime bug. (An isolation test confirmed it: making the infinite sequence finite lets the
parent close, so the coordinator wiring is fine.)

## What Changes

- **Designer (UI only)** — the D-107 content-hold checklist + the D-108 nested-content indicator
  (`PlayoutSection.tsx`) flag any hold-driving row whose element has `repeat === 'infinite'`
  (and `drivesHold !== false`) with an inline "loops forever" warning. When EVERY driver (own +
  nested) is infinite, a prominent `Callout variant="danger"` says the graphic won't auto-close.
  The warning clears when the element is excluded or made finite; finite elements show nothing.
- **No runtime / schema change** — the runtime behaviour (infinite content ⇒ hold until stop) is
  correct and unchanged. Reuses the existing recursive walks (`contentHoldElementsOf` /
  `nestedHoldGroupsOf`), threading an `infinite` flag through them.

## Capabilities

- `designer-playout-lifecycle` (ADDED): the Playout checklist warns about infinite-repeat hold
  drivers (per-row, read-only on nested rows, and prominently when every driver is infinite).

## Impact

- `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` (the `infinite` flag + the
  per-row / prominent warnings) + a designer E2E (`guard-infinite-hold-driver.spec.ts`).
- No runtime / schema change, no version bump.
