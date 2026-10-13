## ADDED Requirements

### Requirement: A look switch refused for a plate is said on the row, with no banner

The console SHALL say a look switch that CasparCG refused for a plate in `FIELD-FIXES-01`'s one line — the row,
the refused source and what the refusal means — on that row and in its Inspector, in that channel's view only,
and SHALL raise no banner for it: the bridge records the refusal as the row's `takeRefusal` and its reply says
`refusalOnRow`. The row SHALL stay on its old look, and a switch that lands SHALL withdraw the line. Every other
refusal of a switch (the look, the link, the page) SHALL keep its banner.

#### Scenario: The refused switch

- **WHEN** the operator switches a row's look and CasparCG refuses a plate the new look needs
- **THEN** the row shows the line naming the refused source, the look picker still marks the old look, and no
  banner appears
- **AND** the next switch that lands clears the line (the control)

#### Scenario: A refusal that names no plate keeps its banner

- **WHEN** a switch is refused for a reason that names no plate
- **THEN** the console raises its banner, in the bridge's words, exactly as before
