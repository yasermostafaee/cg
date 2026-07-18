# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: Right-click opens a row's own actions

An operator SHALL be able to reach a row's actions by right-clicking it — a stack row offers
its playout actions (play, update, clear, remove), a library row offers its template actions
(load, remove). The browser's own context menu is suppressed across the operator surface (its
entries navigate away from a running show), so right-click MUST either open the app's own menu
or do nothing; it SHALL NOT leave the operator with browser chrome over a playout console.

The menu is an **alternate entry point**, never a new capability. For every item:

- it SHALL be disabled exactly when the equivalent button on that row is disabled, including
  the link-down refusals — a menu MUST NOT offer a command the row's own button refuses;
- choosing it SHALL run the same action the button runs, with the same effect — there SHALL NOT
  be a second command path for the same action;
- a refusal SHALL reach the operator with the same wording the button's refusal produces, on
  the transient command surface rather than pinned inline.

Right-clicking a row SHALL NOT change the selection: the menu acts on the row that was pointed
at, and must not silently retarget the Inspector under the operator's staged edits.

The menu SHALL dismiss on an outside click, on Escape, on scroll, and after running an action.
It SHALL be positioned fully within the viewport even when opened at an edge, and it SHALL be
navigable and dismissable from the keyboard, with disabled items skipped rather than focused.

Fields the operator TYPES in — text inputs, textareas, and rich-text hosts — are EXEMPT from
the native-menu suppression: cut/copy/paste and the browser's BiDi/spelling services are
editing affordances the Persian copy workflow depends on, and none of the dangerous native
entries apply inside a focused text box.

#### Scenario: A stack row offers its own actions on right-click

- **WHEN** the operator right-clicks a stack row
- **THEN** a menu opens listing that row's play, update, clear and remove actions

#### Scenario: A library row offers its own actions on right-click

- **WHEN** the operator right-clicks a library template row
- **THEN** a menu opens listing that row's load and remove actions

#### Scenario: A menu item is disabled exactly when its button is

- **WHEN** a row's action button is disabled for any reason — including the bridge link being
  down for the on-air verbs and for removing a stack item
- **THEN** the matching menu item is disabled too, and choosing it does nothing

#### Scenario: A menu action runs the row's own handler

- **WHEN** the operator chooses an enabled menu item
- **THEN** the row's existing action runs, with the same effect as pressing its button

#### Scenario: A refused menu action is reported like a refused button

- **WHEN** an action issued from the menu is refused
- **THEN** the reason appears on the transient command surface, worded as the button's refusal
  would be, and nothing is pinned inline in the row

#### Scenario: Right-click does not move the selection

- **WHEN** the operator right-clicks a row that is not selected
- **THEN** the menu acts on that row and the current selection is unchanged

#### Scenario: The menu dismisses and stays on screen

- **WHEN** the menu is open and the operator clicks outside it, presses Escape, scrolls, or
  runs an action
- **THEN** the menu closes; and a menu opened near a viewport edge is positioned fully on
  screen

#### Scenario: Text entry keeps the browser's own menu

- **WHEN** the operator right-clicks inside a text input, textarea or rich-text field
- **THEN** the browser's own context menu appears, so cut/copy/paste remain available
