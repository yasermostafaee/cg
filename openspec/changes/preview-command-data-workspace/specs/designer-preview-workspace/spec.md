## ADDED Requirements

### Requirement: Preview SHALL be a large command-first rehearsal workspace

The Designer Preview SHALL use the available desktop viewport without overflowing it. A prominent
frame/time strip SHALL sit above the picture, and its right-hand workspace SHALL present transport
before session timing and Variables.

#### Scenario: Command-first order

- **WHEN** Preview opens
- **THEN** the active composition name and frame/time status are immediately above the picture
- **AND** transport is above advanced/session controls
- **AND** Variables are below those controls in their own scrollable region

#### Scenario: Responsive containment

- **WHEN** Preview opens on a smaller viewport
- **THEN** the dialog remains within the viewport
- **AND** its stage and data regions scroll or shrink without hiding the close control

### Requirement: Preview SHALL show truthful elapsed run time

The elapsed display SHALL use a monotonic session clock for the current rehearsal run and SHALL react
to both user commands and natural runtime completion. Its fractional-second field SHALL remain two
digits wide and isolated left-to-right. Both counters SHALL use fixed-width tabular figures so
counting never shifts the strip or surrounding controls.

#### Scenario: An early Play cannot create a phantom run

- **WHEN** the current Preview iframe has not yet signalled readiness
- **THEN** transport commands are disabled and their handlers do not dispatch playback
- **AND** elapsed time remains at its starting value instead of advancing over an unstarted graphic
- **AND** closing the dialog remains available

#### Scenario: Time fields use one separator

- **WHEN** elapsed time is displayed
- **THEN** minutes, seconds and hundredths are separated consistently with colons
- **AND** one second and three hundredths reads `00:01:03`

#### Scenario: Pause and resume

- **WHEN** Play starts and Pause is pressed
- **THEN** elapsed time freezes
- **AND WHEN** Play resumes the paused run
- **THEN** elapsed time continues from the frozen value

#### Scenario: End of run

- **WHEN** Stop or Reset ends the run
- **THEN** frame and elapsed status return to the run's starting values
- **AND WHEN** natural completion ends the run
- **THEN** the completed frame/time status stops advancing at its final value
- **AND** late outro-frame reports after Stop cannot overwrite the reset status

#### Scenario: Reset ends the actual rehearsal immediately

- **GIVEN** dedicated Preview is playing, paused or closing through an authored outro
- **WHEN** Reset is pressed
- **THEN** its current lifecycle, media, content drivers and pending exits end immediately, without
  playing another outro
- **AND** form and runtime data return to the same current Preview seed (declared defaults overlaid
  with current connected-file values), both counters return to the
  starting frame/time, and the picture remains blank until an explicit Play
- **AND** a previously pending Play cannot restart the reset rehearsal, while a subsequent explicit
  Play waits for the fresh idle runtime and starts normally
- **AND** assets and session settings survive; ordinary Stop, Canvas and on-air behavior are unchanged

#### Scenario: A finite scene has a finite elapsed clock

- **GIVEN** the active composition has neither a loop cycle nor an effective content-driven hold
- **WHEN** its authored active-frame duration is reached
- **THEN** the elapsed display stops at that frame-derived duration instead of counting forever
- **AND** a composition tree that does contain a loop or effective content-driven hold remains
  open-ended until its runtime completes or the author stops it

### Requirement: Preview text entry SHALL follow its first strong character

Preview scalar, multiline and list-item text editors SHALL use automatic first-strong direction,
matching CG Control without modifying the field value or authored graphic direction.

#### Scenario: Persian and Latin values

- **WHEN** a value's first strong character is Persian/Arabic
- **THEN** the Preview editor reads right-to-left
- **AND WHEN** its first strong character is Latin
- **THEN** the Preview editor reads left-to-right

### Requirement: Preview Variables SHALL remain dense and scalable

Scalar Variables SHALL render in aligned compact key/value rows with active-control contrast.
List/repeater Variables MAY retain a taller editor required for their structured values. Exactly one
header-level Update all action SHALL commit pending scalar and list values; per-field and per-item
Update/check actions SHALL be absent.

#### Scenario: Many scalar variables

- **WHEN** a composition exposes many scalar fields
- **THEN** the author can scan their identities and values as aligned rows
- **AND** scroll the Variables region independently of the transport

#### Scenario: One commit action

- **WHEN** any scalar or list value is edited
- **THEN** Update all becomes available and applies every pending value in place
- **AND** individual value and list-item rows do not show duplicate Update/check actions

#### Scenario: Many-column structured rows stay readable

- **WHEN** a Repeater or Sequence exposes many columns or pages of structured rows
- **THEN** its shared row-editor modal preserves visible field labels and usable input widths
- **AND** one scroll area moves all rows without a separate scrollbar per item
- **AND** applying data does not restart an unchanged held background

### Requirement: Preview SHALL not present an Out command

The Designer Preview transport SHALL omit the animated Out command while retaining Play, Pause and
Stop. This UI constraint SHALL NOT remove Out from on-air/runtime contracts outside the Preview.

#### Scenario: Transport actions

- **WHEN** the Preview transport renders
- **THEN** Play, Pause and Stop are present, becoming available only after the current iframe is ready
- **AND** Out is absent
- **AND** any command tooltip is a short action or short disabled-state reason rather than a
  sentence of instructional prose

### Requirement: Preview transport readiness belongs to its current iframe content

The Designer SHALL enable transport only after its current dedicated Preview iframe has completed
boot and signalled readiness. Rebuilding content or reopening Preview SHALL reset this session state.
Readiness from unrelated or obsolete content SHALL NOT enable transport for the current content.

#### Scenario: Current readiness enables a normal rehearsal

- **WHEN** the current Preview iframe sends its ready signal after installing its command listener
- **THEN** the host seeds the existing asset/data/session state and enables transport
- **AND** a subsequent Play starts the graphic and elapsed clock through their normal lifecycle
- **AND** readiness alone does not auto-play or queue a previously refused command

#### Scenario: Rebuild and reopen cannot inherit stale readiness

- **WHEN** Preview content is rebuilt or the dialog is reopened
- **THEN** transport becomes disabled until the new current content signals readiness
- **AND** the preceding run's elapsed clock does not continue as a new run
- **AND** a signal from another iframe or obsolete content does not unlock the transport

#### Scenario: Ready-state transport behavior is preserved

- **WHEN** the current Preview is ready and the author plays, pauses, resumes or stops it
- **THEN** the existing graphic lifecycle and elapsed-time behavior remain unchanged
- **AND** natural completion still settles status without modifying persisted scene timing
