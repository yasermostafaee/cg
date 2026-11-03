## MODIFIED Requirements

### Requirement: Text padding switches between one value and four sides

Text Padding SHALL expose one uniform value or four top/right/bottom/left values, with one mode control matching Border Radius. Switching to per-side SHALL copy the uniform value and its animation to each side. Switching to uniform SHALL use top as the representative and clear the orphan side tracks. Both shapes SHALL render identically in canvas, preview and export.

#### Scenario: Uniform to per-side

- **WHEN** uniform padding is 20 and the author enables per-side mode **THEN** all four sides start at 20

#### Scenario: Per-side to uniform

- **WHEN** top/right/bottom/left differ and the author returns to uniform mode **THEN** top becomes the single value and orphan per-side tracks are removed
