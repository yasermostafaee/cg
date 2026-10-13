# B-139 — the plate dirty baseline must be supplied, not defaulted

## Why

`isItemDirty` takes the applied-plate map as an **optional** third argument. The Inspector passes it
(`Inspector.tsx:400-404`); the stack row does not (`LayersPanel.tsx:760`). With it omitted,
`appliedPlates?.get(plateId) ?? ''` collapses every plate's baseline to `''`, so the comparison
degenerates to `staged !== ''` — string truthiness rather than a value comparison.

That one fact explains both reported faces, in any order:

| action                   | Inspector | row             |
| ------------------------ | --------- | --------------- |
| set the plate to B       | draft     | draft           |
| set it back to saved A   | no draft  | **draft** ❌    |
| set it to _not assigned_ | draft     | **no draft** ❌ |

**It breaks a living spec.** `openspec/specs/runtime-ui/spec.md` — _"Scenario: Dirty state is
visible"_ — requires the chip on **the row + Inspector**, naming both surfaces.

**And it is FUNCTIONAL, not cosmetic.** The row's UPDATE verb is disabled off the same boolean
(`layerRowActions.ts:713`), so in the _not assigned_ case the operator **cannot apply the edit from
the row at all**. Un-assigning a plate is not merely unlabelled; it is unreachable there. (The same
expression gates `!onAir` first, so this lands on rows that are already on air — narrower, and worse
where it lands.)

## What changes

1. **The baseline becomes a REQUIRED parameter.** The defect is an API that lets a caller silently
   ask a different question, so the fix is an API that cannot be called wrong — not a corrected call
   site, which is one edit away from regressing.
2. **The docstring licence is deleted.** It currently permits the omission and names the very call
   site that suffers; a comment that authorises the defect must go with it.
3. **Every caller the signature change surfaces is fixed**, using the canonical join
   `appliedPlateSources`, never a second local spelling.
4. **"Not assigned" gets ONE canonical representation**, so the staged `''` and the applied `null`
   are reconciled in one place instead of ad hoc at each comparison.

## What does NOT change

- **The row's chip keeps its meaning**: _this row has staged edits that have not been applied_ —
  exactly the Inspector's meaning, and the same boolean the UPDATE verb reads. They are already one
  value and must not become two.
- No change to `AuditPanel`, to the sources store, or to the assignment/override distinction. This
  is not the assignment-vs-override confusion (both surfaces read the same staged plate draft).

## Impact

| Area           | Effect                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `apps/runtime` | `draftStore.isItemDirty` signature; the row's call site; one canonical unassigned spelling; tests |

Capability: `runtime-ui` (MODIFIED — the existing "Dirty state is visible" requirement gains the
row/Inspector agreement it already implies).
