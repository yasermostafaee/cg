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

#### Scenario: Parent stop runs each child's own exit

- **WHEN** `stop()` is called on the parent
- **THEN** each nested child plays its OWN outro `[outPoint → activeRange.out]` and
  settles, cascaded from the parent

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
