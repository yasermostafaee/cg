## ADDED Requirements

### Requirement: Durable acknowledgement of direct-station failover events

The console SHALL retain acknowledgement of a completed direct-CasparCG failover across restarts, scoped to the configured station and operator. A new event SHALL remain visible. A current unhealthy connection SHALL remain visible without a dismiss action.

#### Scenario: Reopen after acknowledgement

- **WHEN** an operator dismisses an event and reopens the same station
- **THEN** the same event remains acknowledged
- **AND** a new event is shown

#### Scenario: Another station or operator

- **WHEN** the same event is reported on another configured station or to another signed-in operator
- **THEN** the prior acknowledgement does not hide it

### Requirement: Playout notices describe connection facts

On a Playout station, the console SHALL suppress legacy completed CG failover notices and legacy strategy chips. It SHALL retain current connection alarms.

#### Scenario: Historical legacy event on a healthy Playout station

- **WHEN** a healthy Playout station reports a legacy CG failover event
- **THEN** no completed CG failover notice is shown

#### Scenario: Actual connection outage

- **WHEN** a Playout station's reported server connection becomes unhealthy
- **THEN** the console shows the current server connection alarm
- **AND** it provides no dismiss action for that alarm
