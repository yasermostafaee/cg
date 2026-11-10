## ADDED Requirements

### Requirement: Clock presentation and countup range are authorable

Designer SHALL expose independent horizontal spacing and vertical positioning for clock separators in default and custom formats and apply the same styling in the canvas, Preview and export. It SHALL expose total-minute and hours-and-minutes choices while retaining the custom format. A countup SHALL optionally begin at a nonnegative whole-second value and hold at a ceiling at or above that value. Absent settings SHALL retain the existing zero-based uncapped countup.

#### Scenario: Author positions the separator

- **WHEN** the author changes separator spacing and vertical offset in a default format or a custom format such as `HH-mm-ss`
- **THEN** the separators move without moving the digits vertically, including when blink is enabled

#### Scenario: Show ninety minutes either way

- **WHEN** a countdown has ninety minutes remaining
- **THEN** the total-minute and hours-and-minutes options display 90 and 01:30 respectively in the selected digit script

#### Scenario: Countup starts at its authored value and stops at its ceiling

- **WHEN** a countup configured to start at 7 seconds and cap at 10 starts
- **THEN** it displays 7, advances normally, and holds at 10 until replay
- **AND** reaching the ceiling does not complete a composition's hold
