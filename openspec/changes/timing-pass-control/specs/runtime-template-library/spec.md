# runtime-template-library

## ADDED Requirements

### Requirement: An imported template publishes the timing of the graphic that actually plays

The import SHALL derive each template's timing metadata from the composition the RUNTIME
PLAYS — the exported scene's ROOT — and SHALL NOT read a per-composition pointer that the
package may not contain.

🔴 A dangling pointer SHALL NEVER fall back to an arbitrary composition. An exported
template names an entry composition its own package does not include, and falling back to
whichever composition happened to be listed first published a clock panel's `static` /
`timed` over a live crawler's `auto-out` / `content-driven` — facts that are wrong rather
than missing, on the surface an operator reads under pressure.

The metadata SHALL report whether ANY reachable scope loops, resolved by the same walk the
runtime itself uses to decide which scopes a timing command reaches, so the display and
the applier can never name different sets.

A hold source SHALL be stated only for a mode that runs a hold.

#### Scenario: The root's timing is what is published

- **WHEN** a template whose root declares a mode and a hold source is imported
- **THEN** the published metadata states the root's values

#### Scenario: A dangling entry pointer is ignored

- **WHEN** the scene names an entry composition that the package does not contain
- **THEN** the published metadata still states the root's values, and never a
  composition picked by position

#### Scenario: A loop in a nested instance is reported

- **WHEN** the root does not loop but a composition instance it references does
- **THEN** the metadata reports that the template loops, while the stated mode remains
  the root's

#### Scenario: An unreferenced looping composition is not reported

- **WHEN** a composition definition that loops is present but nothing references it
- **THEN** the metadata does not report the template as looping — a definition is not a
  scope

### Requirement: The timing metadata carries the version of the derivation that produced it

Published timing metadata SHALL carry the version of the derivation that produced it, and
a consumer SHALL treat metadata from a superseded derivation exactly as it treats absent
metadata.

🔴 The metadata and the page that can obey a timing command SHALL be produced by the SAME
import, from one unpacked scene. Nothing SHALL back-fill the metadata onto an existing
registry entry without rebuilding that entry's page: the console would then offer a live
timing control over a page that ignores it, and the operator would set a count, see it
accepted, and watch the graphic run on regardless.

#### Scenario: Metadata from a superseded derivation is refused

- **WHEN** a stored template's timing metadata carries no current derivation version
- **THEN** consumers treat it as absent and ask for a re-import, rather than stating
  its values

## MODIFIED Requirements

### Requirement: The operator Inspector stages edits until an explicit apply

The Inspector SHALL stage every operator edit for a row — its field values, its live-plate
assignments, its per-look input bindings, its on-air position AND its pass timing — in one
session-local draft, and SHALL apply them only on an explicit press. The draft SHALL
survive a selection change, a panel or fullscreen round-trip, and SHALL be dropped only by
Discard or by a prune that can prove the row has left the stack.

The row's dirty mark and the enabled Update verb SHALL read ONE predicate, so the panel can
never report itself clean while a press has work to do.

🔴 **Pass timing joins this list as of this change, and it did not behave this way before.**
The timing controls committed ON BLUR: a click anywhere else on the panel sent a command
toward air, and the typed number was cleared on its way out. Timing was the only Inspector
surface on which looking away was a commit.

#### Scenario: A staged edit is not sent until the press

- **WHEN** the operator edits a field, a position or a timing value and moves focus
  elsewhere
- **THEN** nothing is sent, and the edit is still visible

#### Scenario: One press commits every half

- **WHEN** the operator presses Update with several kinds of edit staged
- **THEN** each is sent once, and a refusal of one does not silently discard another

#### Scenario: The dirty mark answers for every kind of staged edit

- **WHEN** any kind of edit is staged for a row
- **THEN** the row reports itself dirty and the Update verb is enabled
