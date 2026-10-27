# runtime-template-library — visible template-import progress

## ADDED Requirements

### Requirement: A selected template package has a visible pending state

After the operator selects a `.vcg`, CG Control SHALL replace the interactive Templates body with a
visible loading state that names the file while verification, unpacking, rendering and registration
are pending. During that state, conflicting search, selection, load, delete, repeat-import and dialog
dismissal actions SHALL be unavailable. Cancelling the operating-system chooser SHALL NOT enter the
loading state.

When import succeeds, the dialog SHALL return to its refreshed template list with the imported
template selected. When import fails, it SHALL leave the pending state and show the existing pinned
refusal. If import pauses for the existing duplicate-id decision, that decision's remedies SHALL
remain available.

#### Scenario: A heavy package clearly remains in progress

- **WHEN** the operator selects `news-composite.vcg` and import has not settled
- **THEN** the Templates dialog names `news-composite.vcg`, reports that it is being prepared, and
  offers no conflicting picker or dismissal action

#### Scenario: Cancelling selection does not flash loading

- **WHEN** the operator dismisses the operating-system file chooser without selecting a file
- **THEN** the Templates dialog remains in its ordinary interactive state
