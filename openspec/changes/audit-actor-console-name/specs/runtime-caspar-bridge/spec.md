# runtime-caspar-bridge — delta (the audit actor names the acting console, B-141 follow-up)

## ADDED Requirements

### Requirement: The audit record names the console that acted

Every audited action SHALL record the operator name declared by the console that requested
it, rather than one constant for all consoles. The name SHALL be per-console: two consoles
driving one rundown SHALL be distinguishable in the record.

The name SHALL travel with each control request. Exactly ONE site on the sending side SHALL
attach it and exactly ONE site on the recording side SHALL resolve it, so that a newly added
channel or a newly added audit append cannot silently lose attribution by omitting a
parameter.

The recording side SHALL NOT trust the value as received. It SHALL normalise it by the same
rule the sender used, so that a blank or whitespace-only value cannot become an actor that
names nobody while appearing to name somebody.

Requests SHALL still be served when no name is declared. An unnamed request is recorded, not
refused.

#### Scenario: A configured name reaches the record

- **WHEN** a console with an operator name performs an audited action
- **THEN** the row written to the audit record carries that name

#### Scenario: Two consoles are told apart

- **WHEN** two consoles with different operator names each perform an audited action on the
  same bridge
- **THEN** each action's row carries its own console's name

#### Scenario: A blank name never becomes an actor

- **WHEN** a console declares a name that is empty or only whitespace
- **THEN** the action is recorded as unattributed, not as a name-shaped value

#### Scenario: An action with no console behind it is unattributed

- **WHEN** an audited action occurs outside any control request
- **THEN** it is recorded as unattributed, because no console caused it

### Requirement: An unconfigured console is legible as unconfigured

A console that has not been given an operator name SHALL record a value that reads as a
STATE rather than as a role or a plausible person. It SHALL NOT record the previous constant
`operator`, which — once some rows carry a typed name — cannot be told apart from a console
somebody chose to name `operator`.

#### Scenario: The default is a state, not a name

- **WHEN** an action is performed from a console with no operator name set
- **THEN** the row records `unattributed`, and never `operator`

#### Scenario: Clearing the name returns to unattributed

- **WHEN** an operator empties this console's name
- **THEN** subsequent actions record `unattributed` again

### Requirement: The audit surface states what the recorded actor is worth

The audit surface SHALL NOT qualify the recorded actor as self-declared or unverified, because
under a federated identity it is neither.

🔴 **SUPERSEDED 2026-09-23 by `OPERATOR-NAME-SWEEP-01`, and rewritten HERE rather than removed
by a later change, because this delta has not been archived yet.** Left as it was, archiving it
would fold the retired caveat into the living spec — the living spec gaining a requirement on
the same day the product lost it, and no guard would catch that.

What it replaces mandated a surface stating that the recorded name was self-declared and
unverified. That was correct while the control socket was unauthenticated loopback. It is not
correct now: `C-037` establishes a principal from a Playout-issued token the bridge verifies
offline, and `C-038` gates every route on it, so the recorded actor came out of a signature
check and a surface calling it otherwise would be false.

The console SHALL NOT offer a control for setting a browser-held actor name, and SHALL NOT send
one on the wire. Where no principal exists — a station running with authentication off — the
bridge SHALL record `unattributed`, which is the state the system is actually in rather than a
name nobody checked.

#### Scenario: A verified name is not qualified

- **WHEN** an operator signs in and opens the audit surface
- **THEN** the rows carry the verified name and no statement on that surface describes it as
  self-declared, unverified, or typed

#### Scenario: No console-name control exists

- **WHEN** an operator opens the audit surface
- **THEN** there is no control for setting a name recorded as the actor

#### Scenario: With authentication off the record says so

- **WHEN** a bridge runs with authentication off and an operator acts
- **THEN** the entry records `unattributed`

### Requirement: The per-console name is stored per console

No browser-local actor name SHALL be persisted by the console.

🔴 **SUPERSEDED 2026-09-23 by `OPERATOR-NAME-SWEEP-01`**, for the same reason as the requirement
above and recorded the same way. There is no per-console name to store: the persisted key was
retired with the field, and identity now arrives as a token the bridge verifies rather than a
string a browser keeps.

The name SHALL be read at the moment each request is sent, so that renaming a console takes
effect on its next action without a reload.

#### Scenario: One console's name does not become another's

- **WHEN** one console sets an operator name
- **THEN** another console connected to the same bridge is unaffected and keeps its own

#### Scenario: A rename takes effect immediately

- **WHEN** an operator changes this console's name and then performs an audited action
- **THEN** the action is recorded under the new name
