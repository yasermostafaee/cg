# designer-playout-lifecycle

## ADDED Requirements

### Requirement: A run that ends by itself announces that it did

The runtime SHALL emit exactly one `self-end` lifecycle event when the ROOT scope reaches full settle without an external command having asked for the exit.

A lifecycle ends by itself in exactly two ways: its final pass plays its outro and there is no
pass left, or a live pass count is set to zero while the gap before the next pass is still
running, so the pass the operator declined never starts. Both SHALL emit. An exit that began
with `stop()`, `out()` or `remove()` SHALL NOT emit — the party that asked for it already knows.

The event SHALL carry the run's take token when the page was given one, and SHALL carry none
when it was not. It SHALL be emitted BEFORE the settle is announced, so a listener sees the end
of the run it names rather than the beginning of the next.

A NESTED composition instance settling SHALL NOT emit. A nested scope finishing is not the
template finishing, and the existing cascade already takes the nested scopes off air with the
root.

#### Scenario: A finite loop-cycle emits once when its last pass is over

- **WHEN** a `loop-cycle` composition with a finite repeat plays its final pass and settles
- **THEN** exactly one `self-end` is emitted, and it is emitted before `stop.end`

#### Scenario: A timed auto-out emits at its own settle

- **WHEN** an `auto-out` composition reaches its out-point, plays its outro and settles
- **THEN** exactly one `self-end` is emitted

#### Scenario: A live count of zero during the gap emits

- **WHEN** a running loop-cycle is told zero passes remain while the gap before the next pass is under way
- **THEN** the wait is cancelled, the composition settles, and exactly one `self-end` is emitted

#### Scenario: An operator stop emits nothing

- **WHEN** `stop()` or `out()` takes a playing composition off air
- **THEN** no `self-end` is emitted, however the exit settles

#### Scenario: A manual or infinite lifecycle never emits

- **WHEN** a `static` or `manual` composition, or a `loop-cycle` with an infinite repeat, plays for any length of time without an external command
- **THEN** no `self-end` is ever emitted

#### Scenario: A nested instance settling does not emit

- **WHEN** a nested composition instance completes its own lifecycle while its parent is still on air
- **THEN** no `self-end` is emitted for it

### Requirement: The served page reports its completion to the origin that served it

The served page SHALL send at most one completion report per take, to its own origin, naming the take it is reporting.

It SHALL send nothing at all unless it holds a take token: a template opened from anywhere that
did not give it one — a `file://` drop, a third-party host, the Designer's own preview — SHALL
open no connection. The token is what arms the report, and the absence of one is not an error.

A report that fails for any reason SHALL be swallowed inside the page. A page that throws
towards air is worse than a row that goes on claiming it, so a refused connection, a network
error, a timeout and a non-2xx answer are all the same silent outcome.

A second self-end carrying the SAME token SHALL send nothing. A NEW token re-arms the page, so a
row taken, finished, and taken again reports each run once.

#### Scenario: An armed page reports once

- **WHEN** a page that was given a take token reaches self-end
- **THEN** exactly one same-origin request is sent, carrying that token

#### Scenario: An unarmed page never opens a connection

- **WHEN** a page that was given no take token reaches self-end
- **THEN** no request is attempted

#### Scenario: A failed report is silent

- **WHEN** the report cannot be delivered — the origin refuses it, the connection fails, or the answer is an error
- **THEN** nothing is thrown, nothing is retried, and the graphic is unaffected

#### Scenario: A re-taken row reports its second run too

- **WHEN** a page reports one run, is given a new take token, plays again and reaches self-end again
- **THEN** a second request is sent, carrying the new token
