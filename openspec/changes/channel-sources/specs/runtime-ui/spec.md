## ADDED Requirements

### Requirement: The no-band take refusal SHALL be one line on its row, with no banner

A take refused because no plate band is declared SHALL be said on its row and in its Inspector as one short line
naming the row — `<row>: no live source layer band is declared — nothing was sent.` — in that channel's view only,
and SHALL NOT raise a console-wide banner.

#### Scenario: One line on the row, nowhere else

- **WHEN** a take on channel 1 is refused for having no band **THEN** its row and its Inspector read the one line,
  and no banner is shown
- **WHEN** the operator views channel 2 **THEN** no line and no banner are shown there
- **WHEN** the row is taken again and the take lands **THEN** the line is gone (the control)
