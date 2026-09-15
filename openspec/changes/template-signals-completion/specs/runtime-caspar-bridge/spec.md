# runtime-caspar-bridge

## ADDED Requirements

### Requirement: Every take carries a token that names it

The bridge SHALL give the page a fresh take token on every route into air, and SHALL treat the previous one as spent.

There are two such routes and both SHALL mint: the `CG ADD` that builds a page, and the take of
a producer that is already resident, which sends no ADD. The second is the one that matters:
without it a re-take would inherit the previous run's token, and a report from the run that
finished would stop the run that had just started.

The token SHALL ride the reserved control key inside the payload that already crosses the wire.
It SHALL NOT introduce a new AMCP verb.

Telling a resident page its new token SHALL NOT refuse the take when it fails. A run that cannot
report its own completion behaves exactly as every run does today.

#### Scenario: A load carries a token

- **WHEN** the bridge sends the `CG ADD` that builds a page
- **THEN** the load payload carries a take token under the reserved control key

#### Scenario: A take of a resident producer refreshes the token

- **WHEN** a row whose producer is still resident is taken
- **THEN** the page is told a NEW token before the play, and the previous token no longer names a live take

#### Scenario: A failed tell does not refuse the take

- **WHEN** the command that carries the new token is refused by the playout server
- **THEN** the take proceeds and is reported as it would be today

### Requirement: The bridge SHALL receive a completion report on the origin that served the page

The bridge SHALL expose one route on its template HTTP server that accepts a completion report naming a take.

It SHALL accept POST only. A GET, a malformed body, an absent token and a token that names no
live take SHALL each answer `404` with NO side effect, exactly as an unknown template id already
does. A rejected report SHALL be logged and SHALL NOT be acted on.

The route SHALL grant nothing but the stop it is for: a valid token SHALL stop the one row it
names, and SHALL enable no read, no enumeration and no second verb.

This route SHALL NOT be gated by the console lock. The lock refuses operator actions; a template
whose content has finished is not one, and a locked console that went on showing ON AIR for a
graphic that had already gone would make the stack less honest, not safer.

#### Scenario: A GET on the route is not found

- **WHEN** the route is fetched with GET
- **THEN** it answers `404` and nothing is stopped

#### Scenario: A malformed body is not found

- **WHEN** the route is posted a body that is not a token-bearing object
- **THEN** it answers `404` and nothing is stopped

#### Scenario: An unknown token is not found

- **WHEN** the route is posted a token that names no live take
- **THEN** it answers `404`, nothing is stopped, and the rejection is logged

#### Scenario: A locked console does not block a completion

- **WHEN** a valid completion report arrives while the console lock is engaged
- **THEN** the row is stopped exactly as it would be with the lock released

### Requirement: A valid completion takes the row off air through the graceful stop

The bridge SHALL act on a valid completion report by running the SAME internal stop the operator's STOP runs.

The row SHALL land where a manual STOP leaves it: the producer resident, the plates down, the
assignment thawed, the row settled at `loaded`, and a later PLAY instant with no re-load. A
completion SHALL NOT clear the layer and SHALL NOT alter what STOP means.

A report SHALL act only when BOTH conditions hold — the token names a live take, AND the row it
names is on air. Matching the token SHALL spend it whatever happens next, so the primary and
backup servers both reporting the same run produce ONE stop.

A report that arrives after the operator has already stopped, re-taken or removed the row SHALL
be ignored without error.

A report that never arrives SHALL leave the row exactly as it is today. The bridge SHALL NOT
estimate completion from a duration, a pass count or any other timer.

#### Scenario: A finished run comes off air by itself

- **WHEN** a valid completion report names a row that is on air
- **THEN** the row is stopped through the graceful path, its producer stays resident, and its row no longer claims ON AIR

#### Scenario: A resumed row plays without a re-load

- **WHEN** a row stopped by a completion report is taken again
- **THEN** it plays on the resident producer with no re-`ADD`

#### Scenario: Two servers reporting one run produce one stop

- **WHEN** the primary's page and the backup's page both report the same take
- **THEN** exactly one stop is sent and the second report is ignored

#### Scenario: An operator stop racing the report produces one stop

- **WHEN** the operator stops the row and the completion report arrives afterwards
- **THEN** the report is ignored, no second stop is sent, and no error is reported

#### Scenario: A lost report changes nothing

- **WHEN** the bridge is unreachable at the moment a run completes
- **THEN** the row stays exactly as it is today, and nothing later guesses that it finished

### Requirement: A template's own stop is recorded as the template's

The audit SHALL record a completion-driven stop under a reserved non-operator actor, distinct from every console name and from the unattributed default.

The ACTION SHALL stay the existing `stop`: it is the same verb reaching air by the same path,
and only who asked differs. A console SHALL NOT be able to claim the reserved actor — it is
refused on the way in from the wire.

The row SHALL be named the operator's way, in one short clause, with its layer number, and SHALL
NOT carry explanatory prose.

#### Scenario: The log says the template stopped it

- **WHEN** a completion report stops a row
- **THEN** one `stop` row is appended whose actor is the reserved template actor, not a console name and not the unattributed default

#### Scenario: A console cannot claim to be a template

- **WHEN** a client sends the reserved template actor as its console name
- **THEN** the value is refused and the request is attributed as unattributed
