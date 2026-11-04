# designer-preview — delta (align-follow-media-cursor-and-freeze-frame, 2026-11-03)

## MODIFIED Requirements

### Requirement: Preview shows the root runtime frame

The reported root frame SHALL agree with the rendered root picture. Under composition Freeze, every
native, Lottie and Video element, including Follow media, SHALL derive its held picture from Out
point and root telemetry SHALL remain at Out point. Content start SHALL remain only the beginning of
the Loop-middle range. Loop middle SHALL advance and wrap through the Middle range. When Hold ends,
the reported frame SHALL advance forward through `[Out point -> active out]` during Outro rather
than rewinding to Content start or jumping to the end. This telemetry SHALL NOT restart any content
driver.

#### Scenario: Freeze keeps every cursor and picture at Out point

- **GIVEN** Content start is earlier than Out point and an animated Shape has different pictures at
  those frames
- **AND** a Follow Video is present
- **WHEN** the composition enters a Freeze Hold
- **THEN** the root cursor, Shape and Follow Video all remain on their Out-point-derived pictures
- **AND** Pause/Resume does not move any of them

#### Scenario: Hold start does not become the Freeze cursor

- **WHEN** Hold start is earlier than Outro start and composition Freeze is active
- **THEN** Hold start is not reported during the parked Hold
- **AND** the root cursor remains at Outro start until Hold completes

#### Scenario: Follow Outro advances the cursor

- **WHEN** content completion starts a Follow media Outro
- **THEN** the root cursor advances from Out point through the composition Outro
- **AND** it does not first wrap or jump back to Content start
- **AND** a collapsed background leg does not replay that telemetry range

#### Scenario: Follow Lottie holds the rendered Out-point picture

- **GIVEN** a Follow Lottie visibly changes between Content start and its derived Outro start
- **WHEN** Canvas or Preview reaches a Freeze Hold
- **THEN** the actual rendered Lottie picture matches its composition Out-point mapping
- **AND** the root cursor stays at Out point through Pause and Resume
- **AND** operator Stop or timed completion continues its Outro forward from that picture

#### Scenario: Manual Follow Lottie scrub remains a one-pass authoring view

- **WHEN** the author scrubs a Follow Lottie through the composition Middle
- **THEN** the clip advances continuously once, bounded by its derived Outro start
- **AND** lifecycle Freeze or Loop middle does not park or wrap the manual scrub
- **AND** actual Loop-middle playback still advances and wraps its authored derived window
- **AND** detached/manual-media playback and scrub retain their existing phase mapping
