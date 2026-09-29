# designer-shell

## ADDED Requirements

### Requirement: Help → About SHALL name CG Designer, its version and its build

The Designer's Help menu SHALL offer `About`, which opens a dialog naming the app — `CG Designer` —
`Version <release>`, and the exact build (`<sha> · <date>`), from the same build stamp the start screen's
version line reads. The start screen's line SHALL stay. The facts SHALL be rendered as facts, not
controls, and the dialog SHALL close by its own close control and Escape.

#### Scenario: About

- **WHEN** the operator chooses Help → About **THEN** a dialog names CG Designer, `Version <release>` — the
  version `tools/release` reads for the release — and the build

#### Scenario: A wrong version is caught

- **WHEN** the build stamp carries another version than `tools/release` reads **THEN** the check fails
