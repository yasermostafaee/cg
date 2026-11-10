# Design

Use the canonical formatter and retain its minute overflow calculation. Persist optional style and count fields on ClockElement. Share the separator painter between initial and running frames so blink reserves the same horizontal space.

Apply the saved spacing and offset to literal runs between displayed numbers in any supported digit script. This includes both hyphens in `HH-mm-ss` and leaves the countdown sign and meridiem in their original positions. The existing blink option still toggles the actual colon glyphs.
