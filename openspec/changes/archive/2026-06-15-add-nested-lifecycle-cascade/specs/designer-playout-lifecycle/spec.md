## ADDED Requirements

### Requirement: The lifecycle cascades to nested composition instances

`play()`, `stop()`, `pause()`, `resume()`, and `remove()` SHALL cascade recursively
from the parent to every nested composition instance, for arbitrary nesting depth.
The runtime SHALL build a controller tree that mirrors the composition-instance
scope tree (one lifecycle controller per instance scope), reusing the SAME notion of
scope as nested field-scoping rather than a separate tree. Each scope SHALL run its
OWN lifecycle from its own `lifecycle`/`playout`/`activeRange`/`frameRange`, holding
at its OWN out-point independently of the parent and of its siblings. For v1, a
nested child SHALL start together with its parent (offset 0); element `lifespan`
(visibility gating) SHALL NOT be repurposed as a lifecycle offset.

#### Scenario: Parent play holds each child at its own out-point independently

- **WHEN** `play()` is called on a parent that nests two children with different
  out-points
- **THEN** each child plays its own intro once and holds at its OWN out-point, so two
  children with different out-points hold at different frames at the same time

#### Scenario: Parent stop runs each ACTIVE child's own exit

- **WHEN** `stop()` is called on the parent
- **THEN** each still-active nested child plays its OWN outro `[outPoint →
activeRange.out]` and settles, cascaded from the parent (a child that already
  finished is left untouched — see the state-aware stop requirement)

#### Scenario: Parent pause/resume cascades to children

- **WHEN** `pause()` is called on the parent and later `resume()`
- **THEN** every nested child's playback freezes at its current frame on pause and
  continues from that exact frame on resume

#### Scenario: Cascade reaches arbitrary depth

- **WHEN** a parent nests a child that itself nests a grandchild, and `play()` is
  called on the parent
- **THEN** the grandchild's own lifecycle plays too, holding at its own out-point

### Requirement: The parent keeps its own lifecycle for its direct elements (hybrid)

A parent composition SHALL keep its OWN lifecycle controller for the elements
rendered directly in it, AND cascade to its nested instances. The ROOT scope's
controller SHALL be the one that drives the global lifecycle state machine, the
lifecycle events (`play.start`/`play.end`/`stop.start`/`stop.end`), and any
non-persistent session `playout` override; nested children SHALL run their own
stored `playout` and SHALL NOT emit global lifecycle events.

#### Scenario: A parent out-point applies to direct elements and still cascades

- **WHEN** the parent has its own out-point AND nests a child with a different
  out-point, and `play()` is called
- **THEN** the parent's direct elements hold at the parent's out-point while the
  nested child holds at its own out-point

### Requirement: Frame rate is a single project-level setting shared by all compositions

Frame rate SHALL be a single PROJECT-level setting (`Scene.frameRate`) shared by
every composition and every nested scope; a composition SHALL NOT carry its own
frame rate. A project authored with a legacy per-composition frame rate SHALL have
it stripped on load (coerced to the single project fps); keyframe frame-numbers SHALL
be left unchanged. The runtime SHALL apply the single project fps across ALL scopes
(each scope keeps its own frame range / active range, but not its own fps). The
inspector SHALL display the frame rate **read-only**, because it is set once for the
whole project.

#### Scenario: Every composition shares the one project fps

- **WHEN** a project with several compositions is opened
- **THEN** each composition is shown and played at the single `Scene.frameRate`, and
  no composition carries a frame rate of its own

#### Scenario: A legacy per-composition frame rate is coerced on load

- **WHEN** a project that stored a per-composition frame rate is loaded
- **THEN** the per-composition value is dropped and every composition uses the single
  project fps

#### Scenario: The inspector frame rate is read-only

- **WHEN** the inspector shows a composition's frame rate
- **THEN** it is presented read-only (the single project fps), not an editable
  per-composition control

### Requirement: Cascade stop is state-aware (settled scopes are not re-exited)

A cascaded `stop()` SHALL respect each scope's CURRENT lifecycle state. A scope that
is still ACTIVE — playing its intro, holding, looping (including an infinite loop),
manual, or paused — SHALL play its exit and settle. A scope that has already SETTLED
on its own — an `auto-out` that already exited, or a `loop-cycle` / `content-driven`
that completed its finite cycles/passes — SHALL be a NO-OP: it is left in its
finished state and its exit SHALL NOT be replayed. This SHALL apply to the parent's
own controller too (its own stop only exits when its direct-element lifecycle is
still active).

#### Scenario: A finished child is not re-exited on parent stop

- **WHEN** a nested child has already finished on its own (its `auto-out` exited, or
  its finite `loop-cycle` / `content-driven` completed) and then `stop()` is called
  on the parent
- **THEN** that child is NOT re-exited — it stays in its finished state, and the exit
  is not replayed

#### Scenario: Active, infinite-loop, manual, and paused children still exit

- **WHEN** `stop()` is called on the parent while a child is still active — mid
  intro/hold, looping infinitely, holding in `manual`, or paused
- **THEN** that child plays its own exit and settles

### Requirement: Preview timing overrides are per-scope and session-only

The preview's session-only timing overrides (`mode` / `holdMs` / `repeat`) SHALL be
PER-SCOPE, grouped by the composition-instance tree (the parent plus each nested
child instance, using the SAME instance names as the nested field scopes). Each
scope SHALL carry its own override, applied to the preview run only and addressed by
the scope's instance-name path, so a parent can test each child's timing
independently (e.g. one child loops 3×, another loops infinitely). Changing one
scope's override SHALL affect ONLY that scope and SHALL NOT change any stored
template defaults (consistent with the existing session-only override rule;
authoritative per-child on-air control belongs to the rundown). The preview SHALL
show timing controls for the active composition always, and for a nested scope only
when its mode is timing-relevant (`auto-out` / `loop-cycle` / `content-driven`).

#### Scenario: The preview shows per-scope timing controls grouped by instance

- **WHEN** the preview opens on a parent that nests child instances `home` and `away`
- **THEN** the timing controls are grouped per scope — the parent plus each
  timing-relevant nested instance, labelled by its instance name

#### Scenario: A per-scope override times one child without touching others or the template

- **WHEN** the operator changes a child scope's mode / hold / repeat in the preview
- **THEN** only that scope's preview timing changes for the session (e.g. `home`
  loops 3× while `away` loops infinitely), every other scope and all stored template
  defaults are left unchanged
