# designer-live-source — delta (C-028, 2026-08-25)

## ADDED Requirements

### Requirement: The author chooses how a live plate is fitted into its box

A Live Source plate SHALL offer a FIT control in the Inspector, beside the declared aspect, choosing
between `contain` (the default — the whole picture, centred, margins showing the template) and
`cover` (scale to cover and centre-crop).

It SHALL be authored PER ELEMENT and not per source: the same catalog source seated in a 16:9 box
and a 3:4 box needs different fits, so a per-source field would be wrong in both places at once.

The control SHALL use the app's shared control primitives and the shared `Icon` component, and SHALL
read correctly under RTL. A plate authored before this control existed SHALL load with no stored
value and render as `contain`.

The label SHALL say what the mode does to the PICTURE rather than to the box, because the natural
misreading — that the box changes shape — is wrong: the box is unchanged and the picture is placed
inside it.

#### Scenario: The fit mode is chosen in the Inspector

- **WHEN** a Live Source plate is selected **THEN** the Inspector shows a fit control offering
  `contain` and `cover`
- **WHEN** the author picks one **THEN** the choice is stored on the element and survives a save and
  reload

#### Scenario: An existing plate defaults to `contain`

- **WHEN** a plate authored before this control existed is opened **THEN** the control reads
  `contain`, and the scene stores no value until the author picks one

#### Scenario: The choice reaches the export

- **WHEN** a scene with a fitted plate is exported **THEN** the plate's declaration carries its fit
  mode, so the bridge resolves the same mode the author chose
