## ADDED Requirements

### Requirement: Static compositions expose their media Hold behavior in Playback

The composition's Playback section SHALL show Freeze and Loop media for a Static composition with visible Video or Lottie. The default SHALL be Freeze. Loop media SHALL show a checklist of eligible media for selecting repeats. A media layer following the composition SHALL use the composition's choice and expose only its effective timing in the layer Inspector.

#### Scenario: A Static video repeats only while selected for Loop media

- **WHEN** a Static composition has an unmarked Video and the author selects Loop media in Playback
- **THEN** the checked clip repeats its full source during Rehearse, Preview and playout
- **AND** unchecking it lets it play once and hold its last frame
- **AND** Freeze holds the media at its intro end, which is the last frame for an unmarked Video

#### Scenario: Follow gets its Hold behavior from Playback

- **WHEN** a Video is set to Follow composition
- **THEN** the Video Inspector shows its effective phase timing or the absent-marker state
- **AND** Freeze and Loop media remain authored in composition Playback
