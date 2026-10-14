## MODIFIED Requirements

### Requirement: A finite sequence plays its first-item IN and last-item OUT before completion

EVERY sequence SHALL play its first item's `transitionIn` on entry (not an abrupt cut-in) — a finite
one AND an infinite one (`B-103`, the owner's decision 2026-10-14, Q6 (a): "slides in, always"). A
FINITE sequence SHALL also play its last item's `transitionOut` when the last item's dwell ends, and
SHALL signal completion ONLY AFTER that last-item exit finishes. Because a sequence's completion feeds
the content-driven hold, the composition's outro therefore fires AFTER the content has left — content
exits first, background last (D-105). An INFINITE sequence SHALL play no last-item exit and never
complete (it holds until `stop()`). A `transitionIn` / `transitionOut` of `none` (or a zero duration)
SHALL be a no-op at that boundary (cut-in / immediate completion). A `next()` that arrives during the
first item's entrance SHALL be kept, once, and applied as the entrance ends — never lost. The behavior
SHALL be identical in the canvas preview and the export (one driver).

#### Scenario: The first item enters with transitionIn

- **WHEN** a sequence — finite or infinite — starts
- **THEN** its first item enters with `transitionIn` (sliding in from the configured edge, or fading
  in) before its first dwell, rather than appearing abruptly

#### Scenario: A NEXT during the entrance is kept

- **WHEN** the operator presses NEXT while the first item is still entering
- **THEN** the sequence advances to the second item as soon as the entrance ends, once

#### Scenario: The last item exits, then the sequence completes

- **WHEN** a finite sequence reaches its last item and that item's dwell ends
- **THEN** the last item plays `transitionOut` (sliding off the configured edge), and the sequence
  signals completion ONLY AFTER that exit finishes (not while the last item is still on screen)

#### Scenario: The parent holds until the content exits, then plays its outro

- **WHEN** a finite sequence drives a composition's content-driven hold
- **THEN** the composition holds until the last item's exit completes, and only then plays its own
  outro — the background does NOT close while content is still on screen (content-first /
  background-last)

#### Scenario: An infinite sequence enters but never exits

- **WHEN** a sequence is infinite (`repeat: 'infinite'`)
- **THEN** its first item enters with `transitionIn`, it plays no last-item exit, never completes, and
  holds until `stop()`
