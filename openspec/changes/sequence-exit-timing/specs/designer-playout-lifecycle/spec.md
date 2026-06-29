# designer-playout-lifecycle (D-116 delta)

## ADDED Requirements

### Requirement: A finite sequence plays its first-item IN and last-item OUT before completion

A FINITE sequence SHALL play its first item's `transitionIn` on entry (not an abrupt cut-in) and its
last item's `transitionOut` when the last item's dwell ends, and SHALL signal completion ONLY AFTER
that last-item exit finishes. Because a sequence's completion feeds the content-driven hold, the
composition's outro therefore fires AFTER the content has left — content exits first, background last
(D-105). An INFINITE sequence SHALL be unchanged: no first-item entrance, no last-item exit, and it
never completes (it holds until `stop()`). A `transitionIn` / `transitionOut` of `none` (or a zero
duration) SHALL be a no-op at that boundary (cut-in / immediate completion). The behavior SHALL be
identical in the canvas preview and the export (one driver).

#### Scenario: The first item enters with transitionIn

- **WHEN** a finite sequence starts
- **THEN** its first item enters with `transitionIn` (sliding in from the configured edge) before its
  first dwell, rather than appearing abruptly

#### Scenario: The last item exits, then the sequence completes

- **WHEN** a finite sequence reaches its last item and that item's dwell ends
- **THEN** the last item plays `transitionOut` (sliding off the configured edge), and the sequence
  signals completion ONLY AFTER that exit finishes (not while the last item is still on screen)

#### Scenario: The parent holds until the content exits, then plays its outro

- **WHEN** a finite sequence drives a composition's content-driven hold
- **THEN** the composition holds until the last item's exit completes, and only then plays its own
  outro — the background does NOT close while content is still on screen (content-first /
  background-last)

#### Scenario: An infinite sequence is unchanged

- **WHEN** a sequence is infinite (`repeat: 'infinite'`)
- **THEN** it plays no first-item entrance and no last-item exit, never completes, and holds until
  `stop()` — exactly as before
