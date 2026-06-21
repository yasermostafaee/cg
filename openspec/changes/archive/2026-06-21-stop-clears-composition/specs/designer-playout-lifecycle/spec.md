# designer-playout-lifecycle (delta)

## ADDED Requirements

### Requirement: Stop settles into a CLEARED terminal state

On `stop()` the composition SHALL play its OUT/outro and then settle into a CLEARED terminal
state in which the stage is HIDDEN (`body.cg-pending` → `.cg-stage { visibility: hidden }`) AND
every content driver — ticker, clock, sequence, and repeater — is HALTED (its animation frame
cancelled, no further frame scheduled). Content-driven elements and nested children therefore go
away with the composition — they SHALL NOT linger frozen on the last frame — with no per-element
opacity-out keyframes required. When the composition has no outro (an empty OUT, e.g. no
out-point), the clear SHALL be immediate on Stop. The mechanism is VISIBILITY (hide + halt): the
element nodes SHALL remain MOUNTED — DISTINCT from CG REMOVE / `remove()`, which unmounts the
stage. A subsequent `play()` SHALL clear `cg-pending` and re-initialise the drivers from a fresh
state so the composition restarts cleanly. When a nested child's outro is longer than its
parent's, the parent's settle SHALL hide and halt the child early — the parent lifecycle
dominates the global clear.

#### Scenario: Stop hides the stage and halts the content drivers

- **WHEN** a composition with a content-driven element (ticker / clock / sequence / repeater) is
  playing and `stop()` is called
- **THEN** after the outro the stage is hidden (`body.cg-pending`) and the element's driver is
  halted — no further animation frame is scheduled — so the content-driven element is no longer
  shown, without any per-element opacity-out

#### Scenario: A composition with no outro clears immediately

- **WHEN** `stop()` is called on a composition whose OUT is empty (no out-point)
- **THEN** the composition settles into the cleared (hidden + halted) state immediately, with no
  outro to play

#### Scenario: The clear is a visibility hide, not a destroy

- **WHEN** a composition has settled into the cleared state on Stop
- **THEN** its element nodes remain mounted in the DOM (hidden via `cg-pending`), unlike CG
  REMOVE / `remove()` which unmounts the stage (`cg-removed`)

#### Scenario: Re-play after a clear restarts cleanly

- **WHEN** `play()` is called after a composition has been cleared by Stop
- **THEN** `cg-pending` is cleared, the drivers re-initialise from a fresh state, and the
  composition runs its intro again and is visible

#### Scenario: A nested child is cleared by the parent Stop

- **WHEN** a parent composition nests a child that contains a content-driven element and `stop()`
  is called on the parent
- **THEN** the nested child is hidden and its driver halted along with the parent — the child
  goes away too; and where the child's outro is longer than the parent's, the parent's settle
  hides and halts the child early
