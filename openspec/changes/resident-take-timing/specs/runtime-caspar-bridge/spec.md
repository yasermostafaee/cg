# runtime-caspar-bridge

## ADDED Requirements

### Requirement: A resident take SHALL tell the page the row's recorded pass timing before it plays

The bridge SHALL carry a row's recorded pass timing to the page on BOTH routes into air. A take that rebuilds the
page carries it in the `CG ADD` payload. A take of a producer that is still resident (after a graceful stop)
SHALL carry it in the `CG UPDATE` it already sends before the `CG PLAY`, in the same control object as the take
token and the look. It SHALL add no command of its own.

The timing member SHALL be built by the same function and gated by the same predicate on both routes: present only
when the row has a recorded override and its template admits pass timing. A row without one SHALL send exactly the
bytes it sent before this requirement. A refused tell SHALL NOT refuse the take.

An off-air timing set SHALL still send no AMCP at all: the value reaches the page only inside a take.

#### Scenario: Until stop set while stopped reaches the page on the next take

- **WHEN** an on-air looping row is told a count of one, is stopped, is set to `Until stop` while stopped, and is
  taken again
- **THEN** the take sends no `CG ADD`, its one `CG UPDATE` before the `CG PLAY` carries `timing` with
  `passes: 'infinite'`, and exactly one `CG PLAY` follows

#### Scenario: The rebuilding route still carries it

- **WHEN** the same row is taken out instead of stopped, set to `Until stop`, and taken again
- **THEN** the take re-ADDs, and the `CG ADD` payload carries `timing` with `passes: 'infinite'`

#### Scenario: A row with no override sends today's take

- **WHEN** a row that never had a count is stopped and taken again
- **THEN** its `CG UPDATE` before the `CG PLAY` carries the take token and no `timing`

#### Scenario: A template that does not admit pass timing is told none

- **WHEN** a row whose template is not `loop-cycle` has a recorded count, is stopped and is taken again
- **THEN** its `CG UPDATE` before the `CG PLAY` carries no `timing`

#### Scenario: An off-air set still sends nothing

- **WHEN** a pass timing is set on a stopped row
- **THEN** no AMCP command is sent until the next take
