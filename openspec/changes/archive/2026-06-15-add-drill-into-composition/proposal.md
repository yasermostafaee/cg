## Why

In a parent composition a nested child can only be selected as a single unit; to
edit its insides the operator must hunt for it in the compositions list and open
it. Pro tools (After Effects / Figma / Loopic) let you **double-click to drill into**
the thing under the cursor. This adds that for nested composition instances.

Important model note: compositions are **shared, reusable definitions** — one child
can be used by many parents, so a child has **no single canonical parent**.
Therefore there is **no breadcrumb and no "back to parent"** affordance; navigation
between compositions stays via the existing compositions list. Drilling in is
exactly equivalent to opening that child from the list **plus** selecting the
double-clicked shape — navigation + selection only, **no** new edit semantics and
**no** per-instance overrides. Editing the drilled-into shape edits the shared child
definition (affects every parent that uses it), same as opening from the list.

## What Changes

- **Double-click a nested composition instance** on the canvas → hit-test through
  the child's rendered contents to the shape under the cursor, switch the editing
  context to that **child** composition, and select that shape.
- **Single-click is unchanged** — it selects the whole child instance as a unit.
- **Arbitrary depth:** each double-click drills exactly one level (if the child
  shape under the cursor is itself a nested instance, it is selected as a unit; the
  next double-click drills into it).
- Coordinate mapping inverts the instance's transform to its local box and scales
  into the child's resolution (matching how the runtime renders the nested stage),
  so the hit-test lines up with what the operator sees.

## Capabilities

### New Capabilities

- `designer-compositions`: editing context for nested, shared composition instances
  — single-click selects an instance as a unit; double-click drills one level into
  the child definition and selects the shape under the cursor; no parent breadcrumb.

## Impact

- **Designer:** `features/canvas/hit-test.ts` (extract `inverseToLocal`);
  `features/canvas/drill.ts` (new — `drillTarget`: map cursor into child space +
  hit-test); `features/canvas/CanvasOverlay.tsx` (double-click drills a composition
  instance); `state/store.ts` (`openCompositionAndSelect` — atomic open-child +
  select, equivalent to opening from the list).
- **Tests:** `apps/designer` — `drillTarget` mapping (1:1, empty child space,
  scaled instance, non-composition); single-click still selects the instance unit;
  `openCompositionAndSelect` switches context + selects (+ null / unknown id).
- **No schema/runtime change**; no breadcrumb UI; no per-instance overrides.
