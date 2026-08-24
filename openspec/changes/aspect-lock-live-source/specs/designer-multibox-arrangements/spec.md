# designer-multibox-arrangements

## ADDED Requirements

### Requirement: A CELL has no aspect of its own, and locks the COMPOSITION'S RESOLUTION aspect

A locked cell SHALL preserve the COMPOSITION'S RESOLUTION ASPECT, and SHALL NOT be locked to any
plate's `expectedAspect`. 🔴 This is the load-bearing correction in this change, and it is written
here rather than in a comment because the wrong rule is the intuitive one and the next reader will
otherwise re-derive it.

The brief that produced this change assumed a cell could be locked to a plate's `expectedAspect`.
**It cannot**, and the two facts that settle it are:

- An arrangement's cells hold **COMPOSITION INSTANCES**, not plates: `boxInstanceIds` filters
  `e.type === 'composition'` (`arrangements.ts`).
- `expectedAspect` lives on a **`video-placeholder`** (`packages/shared-schema/src/elements.ts`).

So a cell has no `expectedAspect` to lock to. A plate is nonetheless DEFORMED by a mis-shaped
cell, because `preScale` is computed **per axis** — `x = size.w / resolution.width`,
`y = size.h / resolution.height` (`packages/shared-schema/src/scene-flatten.ts`) — so an instance
whose aspect differs from its composition's own resolution applies a non-uniform pre-scale to
everything inside it.

**Therefore the quantity a cell SHALL preserve is the COMPOSITION'S RESOLUTION ASPECT.** Preserve
that and every plate inside renders at its authored shape, whatever that shape is and however many
plates there are.

⚠ Locking a cell to one plate's `expectedAspect` is right ONLY for a box holding exactly one plate
that fills its composition, and **silently wrong for every other box**. It SHALL NOT be
implemented that way.

#### Scenario: typing a cell width moves its height

- WHEN a cell's `width` is committed while the arrangement lock is on
- THEN its `height` follows so the cell keeps the composition's resolution aspect

#### Scenario: and the other direction

- WHEN a cell's `height` is committed while the arrangement lock is on
- THEN its `width` follows by the same rule

#### Scenario: a box holding two plates is still correct

- WHEN a box's composition contains more than one plate, or a plate that does not fill it
- THEN preserving the composition's resolution aspect keeps every plate at its authored shape
- AND no plate's own `expectedAspect` enters the cell's arithmetic

#### Scenario: a degenerate composition changes nothing

- WHEN the box's composition has no usable resolution
- THEN the cell fields behave exactly as they did before this change

### Requirement: A plate never has a cell, so its authored transform is its rendered transform

A `video-placeholder` SHALL always resolve to NO active cell, in every arrangement and at every
nesting level, and its authored transform SHALL BE its rendered transform. `activeCellFor`
resolves an element through `boxInstanceIds`, which admits only compositions, so this holds by
construction rather than by convention.

A surface that reads a plate's own `transform` — the aspect picker, the FIT action, the
already-matches state — is therefore CORRECT as written and SHALL NOT be changed to read a cell.
Doing so would fit against a rect that does not exist.

⚠ This is recorded as a requirement rather than a comment because it was got wrong once: `B-175`
was filed claiming the Inspector's aspect row shared the read-side defect. It does not.

#### Scenario: a plate resolves to no cell even under an active arrangement

- WHEN an arrangement is active and a `video-placeholder` is queried for its active cell
- THEN the answer is NONE, and its rendered transform equals its authored transform
