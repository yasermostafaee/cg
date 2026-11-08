## MODIFIED Requirements

### Requirement: Image/logo ticker separator

The ticker's image/logo separator SHALL retain its project/shared asset identity and authored size and MAY
carry a signed `offsetY` in scene pixels. The Designer Inspector SHALL expose this as a vertical-offset input
when an image separator is selected. The static authoring row and live runtime driver SHALL apply the same
offset after the ticker's general vertical alignment: negative moves only the separator up and positive moves
it down. An absent offset SHALL mean zero, preserving every older ticker without migration. Text separators,
horizontal treadmill width and item placement SHALL remain unchanged.

#### Scenario: Compensate for artwork padding

- **WHEN** an author gives an image separator a vertical offset of `-7`
- **THEN** the separator appears seven scene pixels higher beside the same text in Canvas, Preview and the
  exported/on-air runtime

#### Scenario: Existing separator is unchanged

- **WHEN** a ticker image separator has no `offsetY`
- **THEN** it remains at the position selected by the ticker's vertical alignment exactly as before
