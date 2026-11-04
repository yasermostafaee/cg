# designer-video-element — delta (align-follow-media-cursor-and-freeze-frame, 2026-11-03)

## MODIFIED Requirements

### Requirement: Follow Video Freeze is derived from the composition

Under Follow composition, Video Intro, Hold and Outro timing SHALL remain composition-owned. When
the composition is set to Freeze, the Video SHALL derive its held media position from the
composition Out point. The Inspector MAY show that effective clip time/frame as read-only state but
SHALL NOT expose an authored Freeze-frame override. A legacy stored `freezeAtMs`, manual phase value
or `holdAt` SHALL NOT change Follow Freeze. Loop middle SHALL use the composition Middle range and
its participant policy instead.

#### Scenario: Composition Freeze supplies the held Video picture

- **GIVEN** Content start is earlier than Out point
- **WHEN** the owning composition enters Freeze Hold
- **THEN** the Follow Video settles on the media picture mapped from Out point
- **AND** its Inspector offers no editable Freeze-frame value
- **AND** the root cursor remains at Out point

#### Scenario: A legacy Video Freeze value is inert

- **GIVEN** an older document carries `freezeAtMs` on a Follow Video
- **WHEN** the composition plays under Freeze
- **THEN** runtime ignores that value and uses the Out-point-derived picture
- **AND** the Inspector does not expose the value as an authoring control

#### Scenario: Timeline scrub remains continuous under Freeze

- **GIVEN** a Follow Video belongs to a composition set to Freeze
- **WHEN** the author drags the timeline index through frames after Content start
- **THEN** the Video shows the corresponding one-pass media frame
- **AND** it does not replace the whole Middle with the lifecycle held picture
- **AND** actual Play still parks on the Out-point-derived picture during Hold

#### Scenario: Exit continues from the held picture

- **WHEN** Hold completes for a frozen Follow Video
- **THEN** its Outro continues forward from the Out-point-derived position
- **AND** it does not rewind to Content start or jump through an authored Video frame
