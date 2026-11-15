## ADDED Requirements

### Requirement: Adjust text vertically in its authored box

Designer SHALL provide a signed Text vertical offset in scene pixels for Text in a fixed box,
Ticker text, Clock and Sequence text pages.

#### Scenario: Move text inside a box

- **WHEN** the author sets Text vertical offset to `-6` or `6`
- **THEN** the text moves six pixels up or down respectively after vertical alignment
- **AND** the same rendering applies in Designer, Preview and the template's programme output
- **AND** the authored box, background, position and sizing rules are preserved

#### Scenario: Use separate separator controls

- **WHEN** the author adjusts Ticker text or Clock content that also has a separator correction
- **THEN** Ticker's image separator retains its independent offset and Clock punctuation retains its correction relative to the time
- **AND** Sequence image and composition pages retain their authored positions

#### Scenario: Read existing projects

- **WHEN** a saved project has no Text vertical offset
- **THEN** the text uses the original aligned position
