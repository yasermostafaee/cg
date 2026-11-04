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
