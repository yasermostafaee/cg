## MODIFIED Requirements

### Requirement: Inspector toggles use a neutral active state, not a blue accent

The inspector's alignment button-groups and the sizing / shrink-to-fit / text-wrap toggles SHALL show their active (selected/pressed) state with a neutral fill consistent with the properties panel, NOT the blue accent color, matching the Loopic reference (`D-045-align-0/1.png`). The active state remains clearly distinguishable; only its color changes (appearance only — no behavior change). (`B-147`: Auto Squeeze is gone; Shrink to Fit is the real control — `add-text-fit`.)

#### Scenario: An active align/toggle button is neutral, not blue

- **WHEN** an alignment button or a sizing / shrink-to-fit / text-wrap toggle is in its active state
- **THEN** it is filled with the neutral properties-panel active color (not the blue accent), and selecting options still behaves exactly as before
