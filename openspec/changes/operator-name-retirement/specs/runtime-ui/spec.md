# runtime-ui

## ADDED Requirements

### Requirement: The console does not claim an identity it cannot prove

The console SHALL NOT offer any control for setting a name recorded as the audit actor, and
SHALL NOT persist one in the browser.

Where a verified principal exists, the actor SHALL be that principal, as the bridge established
it. Where none exists, the record SHALL read `unattributed` — a word for a state rather than a
name — and the console SHALL send no actor on the wire.

No operator-facing surface SHALL describe the recorded actor as self-declared, unverified, or
typed. That description was true of a browser-held label and is false of a verified principal,
and a surface stating it above verified rows tells the operator the record is weaker than it is.

#### Scenario: The audit surface offers no name control

- **WHEN** an operator opens the audit log
- **THEN** there is no field for typing an actor name, and no sentence on that surface
  qualifies the recorded actor as a typed label

#### Scenario: A signed-in operator's actions carry their verified name

- **WHEN** a signed-in operator acts and then opens the audit log
- **THEN** the row's actor is the name the bridge verified

#### Scenario: With no principal the record says so

- **WHEN** a bridge running with authentication off records an operator's action
- **THEN** the entry's actor is `unattributed`

#### Scenario: Neither the symbol nor the sentence can return unnoticed

- **WHEN** the retired symbols or any clause of the retired caveat is reintroduced into source,
  including across several lines
- **THEN** the guard fails

### Requirement: The channel strip follows the station configuration

The console's permitted-channel list SHALL be refreshed when the station's server configuration
changes, without requiring the console to reconnect.

The refreshed value SHALL be computed by the bridge, per socket, with the same predicate its
request gate asks — so that a control the console offers and a command the bridge accepts remain
one judgement.

When authentication is off, no such message SHALL be sent, so that a station which has not
federated identity gains no traffic it did not have.

#### Scenario: Repointing the servers withdraws a channel

- **WHEN** a station-admin changes the server list so that a signed-in operator's grant no longer
  names a configured host
- **THEN** that operator's console is told, and its strip stops offering the channel, while the
  operator remains signed in

#### Scenario: A harmless change keeps the channel

- **WHEN** the server list changes in a way that still matches the operator's grant
- **THEN** the channel remains permitted

#### Scenario: Authentication off sends nothing

- **WHEN** the server configuration changes on a bridge with authentication off
- **THEN** the configuration change is published and no auth-state message is

### Requirement: A setting a principal may not commit is shown as a value

Station setup SHALL render a setting as a value, not as an input, for a principal who may not
commit it.

The rendered value SHALL NOT be a disabled control. A disabled input states that the setting
cannot be changed just now; the fact is that it is not this principal's to change at all, and a
fact is written as a fact.

#### Scenario: An operator reads the servers but cannot type into them

- **WHEN** a principal holding only the operator role opens Station setup's servers section
- **THEN** the host and ports are readable as values and there is no input to type into, and no
  input is present in a disabled state

#### Scenario: A station-admin gets the real controls

- **WHEN** a principal holding the station-admin role opens the same section
- **THEN** the inputs are present
