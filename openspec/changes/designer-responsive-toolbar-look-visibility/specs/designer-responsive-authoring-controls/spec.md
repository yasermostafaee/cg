## ADDED Requirements

### Requirement: Canvas tools SHALL remain contained at every supported editor width

The Designer SHALL choose the Canvas tool presentation from the Canvas area's available width. At a
narrow width it SHALL keep Select and Hand directly reachable and place the remaining tools and
multi-frame action in one labelled menu. At a wide width it SHALL preserve the complete direct tool
order. The Canvas controls SHALL NOT overlap the Inspector.

#### Scenario: The supported minimum window makes the Canvas header narrow

- **WHEN** the editor is `1024px` wide and a composition is open
- **THEN** the Canvas toolbar is compact
- **AND** Select and Hand remain directly visible
- **AND** Text and the other placement tools are available from **More canvas tools**
- **AND** the zoom controls remain inside the Canvas header

#### Scenario: The Look picker remains proportional while the window is resized

- **GIVEN** a composition with Looks is open
- **WHEN** the window is resized between wide, medium and minimum supported widths
- **THEN** the Look picker keeps a compact bounded width and matches the adjacent tool height
- **AND** the header uses the full tool strip only when it fits, otherwise the overflow menu
- **AND** all zoom controls remain contained without uneven excess spacing

### Requirement: Registered Look visibility SHALL have one authoring owner

The Designer SHALL treat the Look picker as the visibility owner of registered Look instances. A
registered instance SHALL NOT expose ordinary Hide/Show, because the one-of-N picker has no all-off
state. Lock/Unlock SHALL remain available, and elements authored inside a Look SHALL retain ordinary
Hide/Show.

#### Scenario: The author inspects the main composition of a Look template

- **WHEN** a multi-frame group has two registered Looks
- **THEN** neither registered root row exposes Hide/Show
- **AND** each registered root row still exposes Lock/Unlock
- **AND** choosing either Look in the picker shows only that Look's rendered contents

### Requirement: Registered Looks SHALL be visually distinct from ordinary compositions

The Designer SHALL derive Look identity from the registered instance relationship and SHALL present
that identity consistently in the Compositions panel and Timeline without reusing selection or error
colours.

#### Scenario: A project lists an ordinary composition beside a registered Look

- **WHEN** the author views the Compositions panel and the home composition Timeline
- **THEN** the ordinary composition uses the neutral Component identity
- **AND** the registered Look uses the dedicated multi-panel icon and restrained Look accent in both
  surfaces while its name stays neutral
- **AND** no Look or ordinary composition is labelled as default
- **AND** renaming the Look does not change that identity
- **AND** blue selection/open and red lock/error states retain their existing meanings

### Requirement: Look lifecycle SHALL have one management surface

The Designer SHALL list ordinary compositions above a distinct Looks section in the Compositions
panel regardless of persisted creation order. The Looks header SHALL own icon-only Look creation and
multi-frame-group removal. The Inspector SHALL retain actionable Live Source state/refusals but SHALL
NOT repeat Look lifecycle controls or render permanent empty/help copy.

#### Scenario: a composition is added after Looks exist

- **GIVEN** the project has one or more registered Looks
- **WHEN** the author adds another ordinary composition
- **THEN** it is appended to the ordinary Composition list
- **AND** every registered Look remains below it in the Looks section

#### Scenario: a Look is added while another Look is open

- **WHEN** the author opens a Look composition and presses **Add Look** in the Looks header
- **THEN** the new Look is registered in the original multi-frame group home
- **AND** the currently open composition does not change

#### Scenario: Show Look reaches the composition where it can change the canvas

- **WHEN** a Look composition or unrelated composition is open
- **AND WHEN** the author chooses **Show Look on composition** from a Look row
- **THEN** the Designer opens the multi-frame group home composition
- **AND** activates that Look on its canvas
- **BUT WHEN** the group home is already open
- **THEN** the same action activates the Look without unnecessary navigation

#### Scenario: default selection is not authored in the Designer

- **GIVEN** a multi-frame group with zero or more Looks
- **WHEN** the Compositions panel renders
- **THEN** no Look or ordinary composition has a **default** badge or Set-default action
- **AND** the operator remains responsible for selecting the active Look before Take
- **AND** the empty Inspector adds no Live Source explanation block

### Requirement: Registered Look deletion SHALL be synchronized

The Look registration, its home-document instance and its backing composition SHALL be deleted as
one undoable object whether deletion starts from a Look action or the backing composition. Any
schema-level fallback pointer SHALL remain internal and SHALL move to a surviving Look when needed.
Every successful deletion notice SHALL use a neutral status treatment; red SHALL remain reserved for
refused or failed actions.

#### Scenario: the backing composition is deleted

- **WHEN** the author deletes a composition registered as a Look
- **THEN** its Look registration and full-frame home instance are also removed
- **AND** the Compositions panel and canvas/timeline no longer show either representation

#### Scenario: a non-empty multi-frame group is removed

- **WHEN** the author presses **Delete multi-frame group** and the group contains Looks
- **THEN** a destructive confirmation names the number of Looks and says their compositions will be
  deleted
- **AND WHEN** the author confirms
- **THEN** the group and every owned registration, instance and composition are removed in one
  undoable operation

### Requirement: Preview SHALL switch registered Presets locally

Preview SHALL expose a wrapping Preset button group below its fixed transport controls for a
composition with one or more registered Presets stored by the legacy Look schema. It SHALL use a separate
heading above the choices. Buttons SHALL share a base width and only a longer label may grow its button
to a bounded maximum. The active Preset SHALL have a distinct fill and inset frame in addition to its
pressed semantics. A single Preset SHALL remain visible and selected rather than hiding the complete
control. The Compositions-panel section heading SHALL use title case (`Presets`), consistent with
`Compositions`, rather than all caps. Preview SHALL apply the selection through the existing runtime Look cut. The choice SHALL
remain local to that Preview session and SHALL NOT change stored project data or the authoring Canvas
Preset. Preview Variables SHALL omit every composition or Preset namespace whose complete descendant
tree has no editable fields.

New Presets SHALL receive the user-facing names `preset-1`, `preset-2`, …, skipping occupied names.
The legacy Look id and project schema SHALL remain compatible with existing saved projects.

#### Scenario: the author rehearses two Presets without closing Preview

- **GIVEN** a composition has two registered Presets
- **WHEN** the author starts Preview and chooses the other Preset
- **THEN** the running Preview immediately shows only that Preset
- **AND** Play, Pause, Stop and field updates continue to use the chosen Preset
- **AND** the project and authoring-canvas choice remain unchanged

#### Scenario: the composition has one Preset

- **GIVEN** a composition has one registered Preset
- **WHEN** Preview opens
- **THEN** the Preset group and its one pressed button are visible
- **AND** the fixed transport retains the same position as in the multi-Preset state

#### Scenario: a new Preset receives the broadcast-facing default name

- **WHEN** the author adds the first and second Presets
- **THEN** their visible names are `preset-1` and `preset-2`
- **AND** existing `look-*` project data remains readable without migration

#### Scenario: the group has Presets with no variables

- **WHEN** Preview Variables renders
- **THEN** an empty Preset or composition contributes no heading or blank group
- **AND** a non-empty nested composition keeps its heading and editable fields
