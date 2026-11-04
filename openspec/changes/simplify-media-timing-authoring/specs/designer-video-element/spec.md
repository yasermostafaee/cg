# designer-video-element — delta (simplify-media-timing-authoring, 2026-11-02)

## ADDED Requirements

### Requirement: Phase-less Video authoring has one truthful timing path

When a Video has no manual phase mapping, the Inspector SHALL offer **Follow composition** as the only
action that creates timing. It SHALL NOT offer an action that seeds guessed manual phase marks.
Existing manual mappings SHALL remain visible and editable, and attaching or detaching Follow SHALL
preserve the existing compatibility contract.

Under Follow, the effective middle range SHALL be derived only from the composition's Content start
and Out point: Follow SHALL ignore media markers/manual phase boundaries, stored `holdAt` and legacy
`freezeAtMs`. The element Inspector SHALL NOT expose its own **On hold** or Freeze-frame control.
Composition Playback SHALL choose Freeze or Loop middle. Freeze SHALL derive the Video's held
picture from the composition Out point; Loop middle SHALL use the composition Middle and D-187's
participant policy. A hold readout MAY show clip time and conformed-frame number as read-only state.

The Video Inspector SHALL NOT duplicate the **drives hold** selector. That value SHALL be authored
from the composition Playback checklist.

#### Scenario: A phase-less Video offers one timing action

- **WHEN** the operator selects a Video with no phase mapping
- **THEN** the Inspector offers **Follow composition**, does not offer **Add phase marks**, and does
  not write phase data merely by rendering

#### Scenario: Existing manual phases remain editable

- **WHEN** an older project contains a manual Video phase mapping
- **THEN** its in/out inputs remain editable and it can still attach to Follow

#### Scenario: Follow remains detachable before lifecycle anchors exist

- **WHEN** a Video follows the composition before that composition has an Out point
- **THEN** the Inspector shows the inert Follow state and still offers **Detach**
- **WHEN** the operator detaches a source-only Follow relationship
- **THEN** the Video returns to having no phase mapping and no guessed values are created
- **AND** any pre-existing ignored phase values are preserved and restored as manual values

#### Scenario: Follow can loop the derived middle

- **WHEN** a Follow Video's composition has Content start before Out point
- **THEN** its Inspector shows no media-level On hold selector
- **WHEN** the operator chooses Loop middle in composition Playback and includes that Video
- **THEN** the interval repeats until hold ends and playback then enters Outro
- **WHEN** the interval is empty
- **THEN** the Video does not invent a media-local loop

#### Scenario: Follow ignores clip-authored phase data

- **WHEN** a Video with stored manual phase marks or `holdAt` follows the composition
- **THEN** its Intro, middle and Outro windows come from the composition lifecycle only
- **AND** none of those legacy values becomes an editable Follow override
- **AND** a legacy `freezeAtMs` cannot choose the held source position

#### Scenario: Hold readout names time and conformed frame

- **WHEN** the Follow window maps the composition Out point to a held clip position
- **THEN** the Inspector may show its clip time and corresponding conformed-frame number read-only
- **AND** the number uses the composition rate rather than source-native fps

#### Scenario: Freeze has no Video-specific override

- **WHEN** composition Playback is set to Freeze
- **THEN** the Follow Video holds on the picture mapped from composition Out point
- **AND** its Inspector exposes no editable Freeze-frame value

#### Scenario: Hold driver has one authoring surface

- **WHEN** the operator selects a Video element
- **THEN** its Inspector does not show an On-hold, Freeze-frame or drives-hold selector
- **AND** composition Playback remains the single authoring surface
