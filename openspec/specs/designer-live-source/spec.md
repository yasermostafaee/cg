# designer-live-source Specification

## Purpose

TBD - created by archiving change live-plate-fit-mode. Update Purpose after archive.

## Requirements

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

- **WHEN** a scene with a fitted plate is exported **THEN** the export carries that plate's fit mode,
  so the bridge resolves the same mode the author chose
- **WHEN** that scene has a LOOK GROUP **THEN** the mode is carried PER LOOK, from the plate element
  serving that `routeKey` in that look — never off the group's declared source, which nothing writes
  (`B-178`), and never one answer for a `routeKey` whose box differs between looks
- **WHEN** two plates in one look are authored with different modes **THEN** both reach the runtime,
  each with its own
