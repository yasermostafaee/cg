## ADDED Requirements

### Requirement: The font family picker lists project fonts first

The shared font family picker in the Text, Ticker, Clock and Sequence Inspector SHALL list the current project's imported fonts before the other font options. Reordering the available options SHALL preserve the element's current font selection.

#### Scenario: A font is added to the project

- **WHEN** the designer imports a font into Project Assets and opens the font family picker for Text, Ticker, Clock or Sequence
- **THEN** the font appears in the Project fonts group at the start of the picker, the built-in options remain available, and the element retains its current font until the designer selects another
