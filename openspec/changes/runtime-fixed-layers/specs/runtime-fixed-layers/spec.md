# runtime-fixed-layers — delta (R-021 design phase; settled by the owner's a1/b1/d1/e1 answers, 2026-07-23)

Encodes what is settled by R-021's acceptance, the repo's existing rules, and the four owner
decisions recorded in this change's `design.md`. Implementation is a later PR.

## ADDED Requirements

### Requirement: Fixed slots are fenced out of dynamic allocation, and conflicts are refused at config time

The install config SHALL declare fixed operator slots as `start`/`count`/`aliases` on one
channel (default TEN at 70–79), implemented via the LayerManager's pinned-class mechanism so
dynamic allocation can NEVER land on a fixed slot and normal deallocation never releases one.
The fixed bank SHALL be validated for disjointness against every dynamic template-type range
AND against any C-015 Live Source layers — a violation is a HARD, legible startup failure
naming both ranges, never a warning. Because the bank is extendable (at the end only, max
layer 89), the disjointness check SHALL run BOTH at config load AND on any extension. The
bank is never renumbered mid-session. A shrink while any affected slot holds a resident item
or retained intent SHALL be refused with an error naming the occupied slot numbers —
defer-until-empty does not exist (declared config never silently diverges from actual state).

#### Scenario: Dynamic allocation never lands on a fixed slot

- **WHEN** items are added to the dynamic stack until a template-type range is exhausted
  **THEN** no allocation ever returns a layer inside the fixed range

#### Scenario: Overlapping config is refused at load AND at extension

- **WHEN** a config declares a fixed bank intersecting a dynamic template-type range or a
  Live Source layer **THEN** startup fails with an error naming both ranges
- **WHEN** a bank extension would collide with a Live Source layer **THEN** the extension is
  refused the same way — a later extension can never silently recreate the overlap

#### Scenario: Growth applies live; shrink-with-residents is refused by name

- **WHEN** the fixed count grows (within the 89 ceiling) **THEN** new empty rows appear
  without disturbing existing bindings
- **WHEN** a shrink would remove slots that hold resident items or retained intent **THEN**
  it is refused with an error naming those slot numbers
- **WHEN** a config attempts to renumber (move `start`) mid-session **THEN** it is refused

### Requirement: Restore adopts a fixed slot in place; a foreign-occupied slot becomes restore-blocked

A retained item bound to a fixed slot SHALL restore ON THE SAME layer: the restore path's
allocate-elsewhere fall-through (the #368 behavior for dynamic slots) is FORBIDDEN for fixed
slots. When the fixed slot is unavailable because a foreign producer was observed there, the
item SHALL enter a NAMED, visible **`restore-blocked`** state on its fixed row — showing the
retained item's identity and the observed occupancy — and NOTHING is sent to the wire:
restore never clears automatically, and recovery is the operator's separate, explicit Clear
followed by take (never one compound action). `restore-blocked` also exits when the foreign
producer vacates (observed empty → the normal deferred re-ADD proceeds). Dynamic (non-fixed)
retained slots keep the existing behavior unchanged: the retained coordinate is taken EXACTLY
when it is free, and only then falls through to allocate-elsewhere. A fixed slot that cannot be
taken exactly (another restored item already bound it) SHALL be skipped with a reason of its own
— never re-homed onto a dynamic layer.

#### Scenario: Bridge-only restart keeps the item on its fixed layer

- **WHEN** the bridge restarts while the item's producer survives on its fixed layer **THEN**
  the item is adopted in place on that same layer without any CLEAR reaching the wire

#### Scenario: Foreign-occupied fixed slot enters restore-blocked

- **WHEN** restore finds the fixed slot occupied by a foreign producer **THEN** the item is
  NOT loaded elsewhere, NOT adopted, and NOT auto-cleared; the row shows the
  `restore-blocked` state naming the retained item and the observed occupancy; the foreign
  producer survives untouched

#### Scenario: restore-blocked exits only by explicit Clear or the layer vacating

- **WHEN** the operator explicitly Clears the layer (confirm-gated) and takes the item
  **THEN** the item loads onto its own fixed slot — two separate actions, never one
- **WHEN** the foreign producer vacates and the layer is observed empty **THEN** the normal
  deferred re-ADD proceeds on the same slot

#### Scenario: Dynamic slots are unchanged

- **WHEN** restore finds a DYNAMIC retained slot that is FREE **THEN** the item comes back on
  that exact layer, never on some other free layer in its range
- **WHEN** restore finds a DYNAMIC retained slot quarantined or taken **THEN** the item falls
  through to allocate-elsewhere exactly as before

#### Scenario: A fixed slot already bound is skipped, never re-homed

- **WHEN** restore finds the retained fixed slot already bound by another restored item
  **THEN** the item is SKIPPED with a reason distinguishable from an exhausted range, and no
  dynamic layer is allocated for it

### Requirement: Fixed-row verbs are split by residency and declared once

Each fixed layer SHALL render as a permanent row whose verbs derive from
`(local item, observation)` by ONE rule declared ONCE via the shared rowAction pattern
(buttons and context menu from the same declarations). When the resident item is this
bridge's, the row exposes the full item verb set with C-012 semantics (Stop = `CG STOP`,
graceful, producer stays resident; Clear = `CLEAR`, producer destroyed). When the layer is
occupied by anything else, the row exposes LAYER verbs only — never Take/Update for a foreign
item. When occupancy has NO fresh observation, the row shows occupancy as explicitly UNKNOWN
(never "empty") — and hard Clear REMAINS available, confirm-gated, with a dialog that states
honestly that occupancy is unknown and names the layer number explicitly (on-air recovery is
never locked out on a no-OSC install). Outside the fixed range, R-015's foreign-refusal is
untouched.

#### Scenario: Own item exposes item verbs

- **WHEN** the row's resident item was loaded by this bridge **THEN** Take / Update / Stop /
  Clear are offered, and the context menu mirrors the buttons exactly (same declarations)

#### Scenario: Foreign occupancy exposes layer verbs only

- **WHEN** the fixed layer is occupied by another station's graphic or a non-html producer
  **THEN** the row shows the occupancy honestly and offers layer verbs only — Take/Update are
  absent

#### Scenario: Silence shows unknown; Clear stays available with an honest confirmation

- **WHEN** the fixed layer has no fresh observation **THEN** the row reads "occupancy
  unknown" (never "empty")
- **WHEN** the operator invokes hard Clear on that silent fixed layer **THEN** the
  confirmation dialog states that occupancy is unknown and names the layer number; on
  confirm the CLEAR is sent
- **WHEN** a layer OUTSIDE the fixed range has no fresh observation **THEN** `layers.clear`
  refuses it exactly as R-015 requires — the permission exists only inside the fixed bank

### Requirement: One-action import binds to the exact slot

A fixed row's import affordance SHALL perform the full chain in one action — pick a `.vcg`,
import it into the library (where it remains for reuse), create an item BOUND to that exact
slot, and Load — using the exact-slot reservation path, never dynamic allocation.

#### Scenario: Import lands on the row's own layer

- **WHEN** the operator uses a fixed row's import button with a valid `.vcg` **THEN** the
  template appears in the library and the created item loads onto exactly that row's layer

#### Scenario: Multi-station rule is identical everywhere

- **WHEN** a second station views a fixed layer loaded by the first **THEN** its row derives
  verbs by the same rule (its own local item absent → layer verbs; occupancy from OSC), so
  behavior is identical whichever station issued the load
