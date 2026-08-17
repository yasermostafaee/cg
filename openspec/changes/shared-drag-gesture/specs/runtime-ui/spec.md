# runtime-ui

## ADDED Requirements

### Requirement: A panel-divider drag ends exactly once, by every route it can end

A divider drag SHALL end completely by every route an ending can arrive: the pointer being released,
the gesture being cancelled by the OS or browser, pointer capture being lost, the window losing
focus, `Escape`, the pointer leaving the window, and the component unmounting.

Every one of those SHALL run the SAME teardown. The drag's visual state and its internal state SHALL
be cleared inside that one function, so they cannot be separately terminable.

A drag SHALL NOT write to `document.body`. State that outlives a gesture by living on the document is
what made a missed ending an application-wide fault; the gesture SHALL own a node it removes instead.

#### Scenario: A released drag leaves nothing behind

- **WHEN** the operator releases a divider drag anywhere on screen
- **THEN** the divider is no longer painted as dragging, `document.body` carries no leftover cursor
  and no leftover `user-select`, and no drag shield remains

#### Scenario: A drag crossing a preview frame keeps working

- **WHEN** the pointer travels over a rehearsal preview frame during a divider drag and is released
  there
- **THEN** the drag ends completely, leaving no global state behind

#### Scenario: Only the captured pointer drives the drag

- **WHEN** a second finger touches the screen during a divider drag
- **THEN** the divider does not move for it, and releasing that second finger does not end the drag

#### Scenario: Escape keeps the size the panel has at that moment

- **WHEN** the operator presses `Escape` during a divider drag
- **THEN** the drag ends and the panel keeps the size it had at that instant, rather than reverting

### Requirement: A divider is operable by mouse, touch and pen through one code path

Dividers SHALL be driven by Pointer Events, so mouse, touch and pen all work without a second
implementation. The handle SHALL opt out of the browser's own gesture handling so a drag cannot be
stolen for scrolling or zooming.

The touch target SHALL be larger than the visible divider, and the VISIBLE width SHALL NOT change to
achieve it.

#### Scenario: A touch drag works and ends completely

- **WHEN** the divider is dragged by touch and released
- **THEN** it resizes during the drag and ends completely on release, exactly as a mouse drag does

#### Scenario: The handle is reachable by finger without becoming thicker

- **WHEN** the operator reaches for the divider with a finger
- **THEN** the grabbable region is larger than the drawn divider, while the drawn divider's width is
  unchanged

### Requirement: The divider gesture has ONE implementation across the apps

The drag gesture SHALL exist in exactly one place, shared by every divider in every app. Neither app
SHALL own gesture code of its own.

That shared implementation SHALL be headless — no styles, no design tokens, and no markup beyond the
overlay the gesture itself requires — so that the tokens-only rule for shared UI stays intact and
components remain app-local.

#### Scenario: Both apps' dividers behave identically at the boundaries

- **WHEN** the same terminator occurs during a drag in either app
- **THEN** both end the drag the same way, because both run the same teardown
