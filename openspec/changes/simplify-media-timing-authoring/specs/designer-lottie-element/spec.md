# designer-lottie-element — delta (simplify-media-timing-authoring, 2026-11-02)

## ADDED Requirements

### Requirement: Phase-less Lottie authoring has one truthful timing path

When a Lottie has no usable marker or manual phase mapping, the Inspector SHALL offer **Follow
composition** as the only action that creates timing. It SHALL NOT offer an action that seeds guessed
manual phase values. Existing marker/manual mappings SHALL remain visible and editable, and attaching
or detaching Follow SHALL preserve the existing compatibility contract.

Under Follow, the effective middle range SHALL be derived only from the composition's Content start
and Out point: Follow SHALL ignore Lottie markers/manual phase boundaries and stored `holdAt`. The
element Inspector SHALL NOT expose its own **On hold** selector. Composition Playback SHALL choose
Freeze or Loop middle. Freeze SHALL derive the Lottie's held picture from composition Out point;
Loop middle SHALL use the composition Middle and D-187's participant policy. The effective held
frame SHALL remain read-only.

The element Inspector SHALL NOT duplicate **drives hold**; the composition Playback checklist is the
single authoring surface for media hold participation.

#### Scenario: A marker-less Lottie offers one timing action

- **WHEN** the operator selects a Lottie with no phase mapping
- **THEN** the Inspector offers **Follow composition**, does not offer **Add phase markers**, and does
  not write phase data merely by rendering

#### Scenario: Existing manual phases remain editable

- **WHEN** an older project contains a manual Lottie phase mapping
- **THEN** its intro/outro inputs remain editable and it can still attach to Follow

#### Scenario: Follow remains detachable before lifecycle anchors exist

- **WHEN** a Lottie follows the composition before that composition has an Out point
- **THEN** the Inspector shows the inert Follow state and still offers **Detach**
- **WHEN** the operator detaches a source-only Follow relationship
- **THEN** the Lottie returns to having no phase mapping and no guessed values are created
- **AND** any pre-existing ignored phase values are preserved and restored as manual values

#### Scenario: Follow can loop the derived middle

- **WHEN** a Follow Lottie's composition has Content start before Out point
- **THEN** its Inspector shows no media-level On hold selector
- **WHEN** the operator chooses Loop middle in composition Playback and includes that Lottie
- **THEN** the interval repeats until hold ends and playback then enters Outro
- **WHEN** the interval is empty
- **THEN** the Lottie does not invent a media-local loop

#### Scenario: Follow ignores Lottie-authored phase data

- **WHEN** a Lottie with markers, manual phase values or `holdAt` follows the composition
- **THEN** its Intro, middle and Outro windows come from the composition lifecycle only
- **AND** the Inspector shows no editable hold override

#### Scenario: Freeze uses the composition boundary

- **WHEN** composition Playback is set to Freeze
- **THEN** the Follow Lottie holds on the picture mapped from composition Out point
- **AND** the root cursor remains on that same Out point

#### Scenario: Hold driver has one authoring surface

- **WHEN** the operator selects a Lottie element
- **THEN** its Inspector does not show an On-hold or drives-hold selector
- **AND** composition Playback remains the single authoring surface

### Requirement: Accepted Follow seams are information, not errors

The Inspector SHALL place accepted Follow timing explanation behind an information icon. Timing
conditions that require corrective author action SHALL retain visible warning/error treatment.

#### Scenario: A normal hold-to-outro jump is not red

- **WHEN** the derived Follow window holds one clip time and starts the ending at another valid clip
  time
- **THEN** the Inspector explains the mapping through the information action, not a red warning
