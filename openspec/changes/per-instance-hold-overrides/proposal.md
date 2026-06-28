# Per-instance hold overrides: choose which nested content drives the PARENT's hold (D-112)

## Why

A single composition with a `repeat: 'infinite'` sequence + a finite ticker already closes on just the
ticker — uncheck the sequence (D-107 per-element `drivesHold`). The identical NESTED arrangement
can't: there is no way to say "only the child's ticker closes the parent, not the child's looping
sequence" from the parent. `drivesHold` lives on the SHARED child element, so toggling it from one
parent hits every instance (and the child's own definition) — the footgun D-108 dodged by staying
read-only. A per-instance override fixes the scope: the parent tunes ITS own hold, the shared child
stays untouched. This unifies the single-scope and nested hold models the operator already expects.

## What Changes

- **Schema (`@cg/shared-schema`)** — add OPTIONAL `holdOverrides?: Record<string, boolean>` to the
  composition-instance element (`type:'composition'`), keyed by nested content element id. Absent ⇒
  fall back to the element's own `drivesHold` (non-breaking, no version bump, round-trips).
- **Runtime (`@cg/template-runtime`)** — in the parent's content-wait aggregation (B-031 path),
  effective "drives THIS parent's hold" for a nested element = `instance.holdOverrides[id]` if defined
  else `element.drivesHold !== false`, applied per instance level (cascade). The element's own
  `drivesHold` still governs the child's OWN hold; the override affects ONLY the parent's aggregation
  and never visibility/start. No animation-engine change.
- **Designer UI (`PlayoutSection.tsx`)** — D-108's read-only nested rows become WRITABLE: each writes
  the per-instance override on the correct composition-instance element (not the shared child); the
  checkbox shows the effective value; the drill-in stays. Folds in D-111: the infinite-repeat warning
  shows inline on any effectively-driving infinite row (own or nested), prominent when every effective
  driver is infinite.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED: D-108 nested rows now writable per-instance; ADDED: the
  per-instance override requirement + the infinite-warning requirement that **supersedes D-111**).

## Supersedes

- **D-111** (`guard-infinite-hold-driver`) — its infinite-repeat-driver warning is folded in here and
  re-stated over the new WRITABLE nested rows (effective participation). D-111 is not implemented
  separately. Archive order: `surface-nested-hold-content` (D-108) → `guard-infinite-hold-driver`
  (D-111) → `per-instance-hold-overrides` (D-112), since D-112's `## MODIFIED` reconciles against the
  D-108 requirement in the living spec.

## Impact

- `packages/shared-schema/src/elements.ts` (one optional field) · `packages/template-runtime/src/{types,scene-builder,runtime}.ts`
  (thread + aggregate) · `apps/designer/src/renderer/state/slices/elements.ts` (`setHoldOverride`) ·
  `apps/designer/src/renderer/features/inspector/PlayoutSection.tsx` (writable rows).
- Tests: schema/vcg round-trip + single-file HTML; runtime override + second-instance isolation;
  designer E2E. No version bump.
