## MODIFIED Requirements

### Requirement: Timeline ruler density SHALL adapt to duration, viewport and zoom

The Timeline SHALL choose numbered-label spacing from the visible frame count, actual lane viewport
width and largest frame label. Label spacing SHALL continue increasing beyond 25 frames for long
compositions. Each numbered tick SHALL have exactly one aligned vertical line in the ruler and
lane body. Maximum zoom SHALL scale with duration until at most 12 frames are visible and each
individual frame has a distinct numbered tick and grid line. Compositions whose duration needs no added range
SHALL retain the existing 1×–20× limits.

#### Scenario: Five-thousand-frame ruler stays readable

- **GIVEN** a 5,000-frame composition in a 1,000 px Timeline viewport at fit zoom
- **THEN** no more than 21 numbered ticks are rendered across the full ruler
- **AND** the ruler and body draw one aligned line for each number

#### Scenario: Author reaches individual frames

- **GIVEN** a 5,000-frame composition
- **WHEN** the author moves Timeline zoom to its maximum
- **THEN** no more than 12 frames occupy the viewport
- **AND** each visible frame has a number and a matching vertical line in the ruler and body
