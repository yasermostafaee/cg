## ADDED Requirements

### Requirement: A fresh take SHALL air everything or nothing

A take SHALL stop at the first plate whose `PLAY` is refused, SHALL NOT try the plates after it, and
SHALL NOT send the graphic's `CG PLAY`. It SHALL then take back exactly what it put there, through the
one clean-up rule: the plates it seated, and the graphic it added with `CG ADD`, removed from its
layer the way `out()` removes it. When the graphic's own `CG PLAY` is refused after its plates were
seated, the take SHALL be undone the same way. A take whose plates are all accepted SHALL send the
same AMCP, in the same order, as before this requirement. A refused preset — a seat only a look not on
screen uses — SHALL NOT refuse the take.

#### Scenario: The first plate is refused on a fresh take

- **WHEN** a fresh take of a two-plate row reaches `PLAY 2-60 DECKLINK DEVICE 1` and the server
  answers `403 PLAY FAILED`
- **THEN** no `CG PLAY` is sent, `PLAY 2-61` is never sent, no `CLEAR 2-60` is sent (the server left
  that layer as it was), `CLEAR 2-59` removes the graphic the take added, and nothing of the take is
  left on 2-59 or 2-60

#### Scenario: A later plate is refused after an earlier one was seated

- **WHEN** plate 1's `PLAY` landed and plate 2's `PLAY` is refused
- **THEN** plate 1's layer is cleared with its mixer, because this take seated it; plate 2's layer is
  not cleared; the graphic the take added is removed; and no `CG PLAY` is sent

#### Scenario: The graphic's own CG PLAY is refused after its plates were seated

- **WHEN** every plate landed and the graphic's `CG PLAY` is refused
- **THEN** every plate this take seated comes down and the graphic it added comes off its layer

#### Scenario: A take whose plates are all accepted is unchanged

- **WHEN** every plate's `PLAY` and every line after it is accepted
- **THEN** the take sends the thirteen lines recorded before this requirement, in the same order

### Requirement: After a refusal the bridge SHALL clear only a layer the refused operation put a producer on

The bridge SHALL decide every clean-up that follows a refused operation by one rule — a take's
rollback, a dropped preset, the teardown of a live or switch reconcile's failed plate, and the graphic
a refused take added: a layer SHALL be cleared only if the operation put a producer on it (its `PLAY`
was acknowledged, or no usable reply came), and SHALL NEVER be cleared if a producer of ours was on it
before the operation began. A `PLAY` answered with a 4xx code SHALL be read as having put nothing on
the layer.

#### Scenario: An R-048 swap whose PLAY is refused leaves the working picture

- **WHEN** an on-air plate is pointed at another source and the replacing `PLAY` is refused
- **THEN** no `CLEAR` and no `MIXER … CLEAR` is sent for that layer, the old producer stays on air,
  and the ledger still names it

#### Scenario: A refusal on a layer the same operation seated is cleared

- **WHEN** a swap seats its new producer on a fresh layer and the line after that `PLAY` is refused
- **THEN** that layer is cleared with its mixer, and no layer the operation did not seat is touched

### Requirement: A refused take SHALL be carried on its row

When a take is refused, the bridge SHALL record on the row, and publish with it, the refusal's code,
the refused command with its payload elided, and — when a plate was refused — that plate and the
catalog entry it resolved to (its id and its name). While the refusal stands the row SHALL publish the
`error` status unless its reconciled status claims or may claim air. The refusal SHALL be withdrawn by
the row's next take that lands, by clearing the row, and by removing it.

#### Scenario: The row names the plate that was refused

- **WHEN** Bed 59's take is refused on plate `l1`, assigned to `studio1`
- **THEN** the row publishes `status: error` and `takeRefusal` with `code: amcp-403`,
  `command: PLAY 2-60 DECKLINK DEVICE 1`, `plateId: l1`, `sourceId`, and `sourceName: studio1`

#### Scenario: The next take that lands withdraws it

- **WHEN** the same row is taken again and every command is accepted
- **THEN** the row publishes no `takeRefusal`
