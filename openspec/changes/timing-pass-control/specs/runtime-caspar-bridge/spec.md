# runtime-caspar-bridge

## ADDED Requirements

### Requirement: The bridge SHALL accept a per-row pass timing as a configuration verb

The bridge SHALL expose a per-row verb that sets the row's pass count and the gap between
its passes. It is a CONFIGURATION verb and never a playout verb: it SHALL send no `PLAY`,
seat no producer, un-mute nothing and fill nothing.

Whether the value reaches the wire SHALL be decided by the ONE predicate that already
gates every per-row configuration verb — on air OR the ledger holds seats — and never by
the air status alone and never by the rehearse flag. A row that owns live seats SHALL be
told over the only mid-air JSON transport; a row that owns none SHALL have the intent
RECORDED and SHALL produce zero AMCP.

The verb SHALL introduce no new refusal condition: the reasons it can answer already exist
on this surface with those spellings.

#### Scenario: An on-air row is told over the wire

- **WHEN** a timing set arrives for a row that owns live seats
- **THEN** exactly one mid-air update carrying the timing crosses to the page, and no
  play, fill or volume command is sent

#### Scenario: An off-air row records the intent and sends nothing

- **WHEN** a timing set arrives for a row that owns no live seats
- **THEN** no AMCP command is sent, and the value is recorded so the next take carries
  it

#### Scenario: An unknown row is refused with an existing reason

- **WHEN** a timing set names a row that is not on the stack
- **THEN** it is refused with the existing unknown-item reason and records nothing

### Requirement: A refused timing set records nothing

The bridge SHALL write the row's stored timing ONLY after a send it accepted. A recorded
intent is not inert — it is what the next take's payload is built from — so recording a
refused value would arm a later, unrelated action to apply a number nobody agreed to.

#### Scenario: A refused send leaves the stored value untouched

- **WHEN** the playout server refuses the timing command
- **THEN** the row's stored timing is unchanged and the console goes on displaying
  what air is actually doing

### Requirement: A restore re-applies a row's stored timing to the template now running

On restore, the bridge SHALL re-apply each row's stored timing to the template that is
running NOW, not merely retain it in the record. A restore that repopulated the store
without telling the page would leave the console showing one number while the graphic ran
another, which is the worst outcome available to this feature.

🔴 A restore SHALL NOT re-send a RELATIVE count to a page that is already running one. The
count that crosses to a running page is "remaining from now", which makes it an
INSTRUCTION rather than a value, and an instruction is not idempotent: sending `2` to a
page that has already run one of its two gives it two more.

#### Scenario: A restored row comes back carrying its timing

- **WHEN** a row with a stored timing is restored
- **THEN** the row publishes that timing, and the value reaches the template that is
  running

#### Scenario: A row with no stored timing comes back inheriting

- **WHEN** a row with no stored timing is restored
- **THEN** it carries no override and inherits the template's authored values, rather
  than being zeroed

### Requirement: A take carries the row's stored timing in its load payload

The bridge SHALL include a row's stored timing in the payload it sends when seating the
template for a take, so that a count set while the row was off air is the count that airs.

#### Scenario: A count set off air airs on the next take

- **WHEN** an operator sets a count on an off-air row and then takes it
- **THEN** the graphic runs that count, rather than the count its template authored
