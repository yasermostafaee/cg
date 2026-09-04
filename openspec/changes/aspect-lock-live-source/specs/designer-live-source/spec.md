# designer-live-source

## ADDED Requirements

### Requirement: The aspect lock is a per-plate session preference, with a visible toggle

A lock toggle SHALL sit beside the aspect select in the Live Source Inspector section, and SHALL
be ON by default whenever `expectedAspect` is set.

It SHALL be a **SESSION PREFERENCE** — persisting across selections like `snappingEnabled` — and
SHALL NOT be authored state. It SHALL be held **PER PLATE**: the toggle beside a plate reads and
writes that plate's own lock, keyed by the plate's element id, and no plate's toggle SHALL change
another plate's lock — in the same look or in any other.

Two reasons it stays out of the scene, recorded so the decision is not re-litigated:

1. **A `.vcg` that resizes differently for two people is the failure mode.** The lock is a fact
   about how the AUTHOR works, not about the template.
2. **The runtime can never read it.** Storing it would mean a schema field, a migration and an
   export path for a value nothing downstream consumes. Whether the per-plate choice should be
   persisted anyway is an OPEN decision recorded under `B-218`; it is a format change and is not
   made by this change.

⚠ **SUPERSEDED (`B-218`, 2026-09-04):** this requirement first read _"per author, not per plate:
a per-plate session flag would be invisible state whose extent the author cannot see"_, and the
lock shipped as ONE boolean. Measured the other way round: in a two-box look, setting one box to
FREE changed it for every box, and in the other looks too, and nothing told the author that the
extent of the toggle they pressed was the whole template. The toggle beside the SELECTED plate,
showing that plate's own state, IS the visible extent; the shared flag was the invisible one.

The aspect itself (`expectedAspect`) remains authored; only how the EDITOR treats it is the
preference.

#### Scenario: the toggle defaults on for a declared aspect

- WHEN a Live Source has an `expectedAspect`
- THEN the lock toggle is present and ON

#### Scenario: the toggle is absent of meaning without an aspect

- WHEN a Live Source's aspect is `— not specified —`
- THEN there is nothing to lock and the resize is unconstrained

#### Scenario: the preference survives a selection change and is not written to the scene

- WHEN the author turns the lock off, selects another plate, and returns
- THEN the lock is still off
- AND the scene document is unchanged by any of it

#### Scenario: the lock is per plate

- WHEN the author turns plate A's lock off and then selects plate B, in the same look or in another
- THEN plate B's toggle reads ON and plate B still resizes locked
- AND plate A's toggle still reads OFF when it is selected again

#### Scenario: the gizmo asks the plate's own lock

- WHEN plate A's lock is off and plate B's is on
- THEN dragging a handle on B keeps B's aspect and dragging a handle on A does not

### Requirement: The FIT button is a repair, and says so

**Fit plate to aspect** SHALL remain, with a changed job: it is the REPAIR for a plate authored
before this change, or one deformed with the lock off. It SHALL NOT read as the normal path.

Its label and tooltip SHALL say so, and the existing already-matches state (`matchesAspect`) SHALL
read as SATISFIED — "this plate already matches" — rather than as an action that happens to be
unavailable.

#### Scenario: a plate that already matches reads as satisfied

- WHEN the plate already renders at its declared aspect
- THEN the surface says the plate matches, rather than offering a greyed action with no stated
  reason

#### Scenario: a plate deformed with the lock off can still be repaired

- WHEN the lock was off and the plate was deformed
- THEN FIT is offered and restores the declared aspect

### Requirement: The aspect the lock constrains is the rect on screen

The lock SHALL constrain the rect the gizmo DRAWS, which for a box under an active arrangement is
its CELL. It SHALL reach that rect through the ONE read side (`renderedTransformAt`) and SHALL NOT
re-derive it.

⚠ **A `video-placeholder` itself can never have a cell**, so a PLATE's authored transform IS its
rendered transform — see the `designer-multibox-arrangements` delta for why. This requirement is
about the box a plate lives in, and about the lock never acquiring a second spelling of "which
rect".

#### Scenario: the lock and the canvas agree about which rect

- WHEN a locked plate's box is under an active arrangement
- THEN the aspect the lock holds is the aspect of the rect the author can see
