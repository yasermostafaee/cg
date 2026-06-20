# designer-controls Specification

## Purpose

TBD - created by archiving change restyle-buttons. Update Purpose after archive.

## Requirements

### Requirement: The shared button recipe draws no default border

The shared `Button` / `Control` recipe SHALL NOT draw a visible resting border on any variant, so no button shows a default outline; the recipe's existing interactive states (hover / active / focus-visible / disabled) are retained for every variant, and the focus-visible affordance remains the `box-shadow` ring (not a border).

#### Scenario: A button has no visible resting border

- **WHEN** any button rendered through the shared recipe is at rest (not focused)
- **THEN** it has no visible border drawn by the recipe

#### Scenario: Interactive states are still present

- **WHEN** the operator hovers, presses, focuses via keyboard, or disables any variant
- **THEN** the corresponding hover / active / focus-visible / disabled state still applies (focus-visible draws a `box-shadow` ring, not a border)

### Requirement: Border-reliant variants stay visible via a non-border affordance

The variants that previously relied on the border for their affordance — `secondary` (default), `danger`, and the `selected` toggle state — SHALL remain clearly distinguishable without an outline, using a background fill / tint / elevation and (for `selected`) an accent-coloured label.

#### Scenario: The default secondary button reads as a button

- **WHEN** a `secondary` (default) button renders without a border
- **THEN** it is visibly a button via a raised surface fill (and a hover change), distinct from the panel behind it

#### Scenario: The danger button reads as destructive

- **WHEN** a `danger` button renders without a border
- **THEN** it is visibly destructive via a danger-tinted fill and danger-coloured label (with a stronger hover tint)

#### Scenario: The selected toggle reads as pressed

- **WHEN** a toggle/segmented control is in its `selected` (pressed) state without an accent border
- **THEN** it reads as pressed via a raised fill and an accent-coloured label

### Requirement: The SAVE unsaved indicator is preserved

The SAVE control's amber unsaved indicator SHALL be preserved when the default border is removed, so the deliberate `border-top: 2px solid #ffdd40` signal still appears while there are unsaved changes.

#### Scenario: Unsaved SAVE still shows the amber bar

- **WHEN** there are unsaved changes and the SAVE control is shown
- **THEN** its amber `border-top` (2px `#ffdd40`) indicator is displayed, unaffected by the default-border removal

#### Scenario: Saved SAVE shows no border

- **WHEN** there are no unsaved changes
- **THEN** the SAVE control shows no amber bar and no default border
