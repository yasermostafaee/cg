## ADDED Requirements

### Requirement: Preview separates timeline playback from playout rehearsal

Designer Preview SHALL expose an explicit playout-rehearsal mode without changing the meaning of
ordinary timeline playback or persisting preview-only state into the project.

#### Scenario: Author previews the authored timeline

- **WHEN** Rehearse is inactive and the author presses Play
- **THEN** Preview runs linearly from frame zero to the timeline end
- **AND** Preview loop, Ping-pong and frame-step controls retain their authoring behaviour
- **AND** lifecycle hold loops, Next and outro triggers do not alter that linear pass

#### Scenario: Author rehearses the exported lifecycle

- **WHEN** Rehearse is active
- **THEN** loop, ping-pong and frame-step controls are hidden
- **AND** Play, Next and Stop use the same lifecycle command meanings as the exported template
- **AND** Stop clears the picture exactly as Stop does in the dedicated Preview
- **AND** a Sequence with authored post-Out keyframes keeps its current content mounted while that
  visual Outro advances picture and timeline cursor together until clear
- **AND** a composition without a visual Outro settles directly at the timeline end without a
  partial or direction-changing cursor jump
- **AND** Next is disabled when the current composition exposes no next content operation

#### Scenario: Folder-backed picture Sequence rehearses a smooth close

- **GIVEN** the built-in Quran picture Sequence is open in Designer
- **WHEN** the author presses Stop in Rehearse
- **THEN** the current page remains mounted and fades over its authored Outro before the picture
  clears
- **AND** repeated Play / Stop runs end at the same timeline frame

#### Scenario: Preview mode remains non-destructive

- **WHEN** the author switches Rehearse mode or closes Preview
- **THEN** the project, authored lifecycle settings, keyframes and timeline markers remain unchanged
