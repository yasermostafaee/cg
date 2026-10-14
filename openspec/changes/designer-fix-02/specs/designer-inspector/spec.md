## MODIFIED Requirements

### Requirement: Inspector toggles use a neutral active state, not a blue accent

The inspector's alignment button-groups and the sizing / text-wrap toggles SHALL show their active (selected/pressed) state with a neutral fill consistent with the properties panel, NOT the blue accent color, matching the Loopic reference (`D-045-align-0/1.png`). The active state remains clearly distinguishable; only its color changes (appearance only — no behavior change). Auto Squeeze is not a toggle (`B-147` interim; see "Auto Squeeze is stated as unavailable").

#### Scenario: An active align/toggle button is neutral, not blue

- **WHEN** an alignment button or a sizing / text-wrap toggle is in its active state
- **THEN** it is filled with the neutral properties-panel active color (not the blue accent), and selecting options still behaves exactly as before

## ADDED Requirements

### Requirement: Auto Squeeze is stated as unavailable

Until shrink-to-fit is built, the text element's Inspector SHALL show Auto Squeeze as a FACT — the
text "not available" in a non-interactive `Tag`, with no control chrome and no way to press it —
whose title is the one short reason: "Not built yet: on air the text keeps its size and may
overflow its box." It SHALL NOT be a toggle, and SHALL NOT be a disabled control. A saved
`autoSqueeze` value SHALL be kept untouched in the element.

#### Scenario: The row is a fact with its reason

- **WHEN** a text element is selected
- **THEN** the Auto Squeeze row reads "not available", is not a button, and its title is the
  reason

#### Scenario: A saved value is kept

- **WHEN** a project saved with `autoSqueeze: true` is opened and the text element selected
- **THEN** the row still reads "not available" and the element still carries `autoSqueeze: true`
