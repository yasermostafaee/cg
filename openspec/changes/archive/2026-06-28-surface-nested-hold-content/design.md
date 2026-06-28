# Design — surface nested-composition hold-driving content (D-108)

## Decision: read-only, never togglable from the parent

`drivesHold` lives on the SHARED child composition element. A nested instance is a
`compositionId` reference (layers not copied), so the same child can be instanced
many times. Writing `drivesHold` from the parent would change it for EVERY
instance — a silent, surprising mutation. So the nested surface is strictly
read-only: it makes NO `drivesHold` writes. The operator changes a nested item's
flag by drilling into that composition and using its own D-107 checklist (which
operates on that composition as the active doc, where the shallow-but-recursive
`setElementDrivesHold` reaches the element).

## Decision: group by the immediate nested instance; count recursively

The section lists the active composition's IMMEDIATE nested `composition`
instances (found by walking the active layers, recursing groups but not nested
comps). For each, it counts hold-driving items (`ticker` / `sequence` /
countdown-`clock`, `drivesHold !== false`) reachable through the referenced
composition — recursing that composition's groups AND its own deeper nested
instances, cycle-guarded by a visited set. The recursive count is what decides
whether an instance is listed (so a deep-only case — an immediate instance whose
content lives one more level down — still appears, closing the gap), while the
LISTING stays one level (the immediate instances). Drilling in reveals the next
level's instances in that composition's own Playout section — "progressively, one
level at a time".

This matches the recursion shape of D-107's `hasContentElement` (which already
recurses nested comps to OFFER the hold control). Like `hasContentElement`, the
count does not special-case a nested composition that is itself a content-driven
"coordinator" (which self-settles and does not actually drive the parent's hold);
that is a known, shared imprecision in the offer/surface layer, not introduced
here — the runtime's actual aggregation is unchanged.

## Decision: drill-in reuses `setActiveComposition`

Activating a row calls `designerStore.setActiveComposition(compositionId)` — the
existing open-from-list action (also used by `addComposition` and the compositions
panel). It switches the active doc, clears selection, and resets the playhead. No
new store action is needed (the parent makes no writes).

## UI

The nested section sits below the D-107 own-content checklist inside
`ContentHoldChecklist`. Each row is a shared `Button` (`variant="bare"`, the
states-only escape hatch) — a clickable row, not a checkbox — with a drill-in
`Icon` (lucide `ChevronRight`), the instance name (duplicates disambiguated like
the own list), and the item count. Its accessible name is
`"Open <name> to choose which of its content closes the graphic"` for stable
a11y/E2E querying. The own checklist, the nested section, and the empty-state hint
compose: own content (if any) + nested section (if any), falling back to the
"content lives in nested compositions" hint only when both are empty.

## Spec shape: ADDED, not MODIFIED

D-107's requirement says the checklist lists the composition's OWN content; it
does not forbid an additional nested surface, so D-108 is a clean `## ADDED`
requirement rather than a `## MODIFIED` of D-107's. This keeps the change
self-contained (it validates without depending on the D-107 fold being present in
the base living spec on this branch) and folds cleanly once D-107's
`selective-content-hold` archive is merged.

## Tests

- **E2E** (`surface-nested-hold-content.spec.ts`): a parent nesting a composition
  that holds a ticker shows the read-only nested row with a count; excluding the
  nested ticker (by drilling into the child and unchecking it) hides the row /
  drops the count; activating the row drills into the child composition.

## Out of scope

- Toggling nested content from the parent (the read-only constraint is the point).
- Coordinator-aware counting (shared imprecision with `hasContentElement`; the
  runtime aggregation is unchanged).
- Flattening deeper nesting into one view (surfaces one level at a time by design).
