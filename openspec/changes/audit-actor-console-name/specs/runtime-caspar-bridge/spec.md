# runtime-caspar-bridge — delta (the audit actor names the acting console, B-141 follow-up)

## ADDED Requirements

### Requirement: The audit record names who acted, as far as it is known

Every audited action SHALL record, as its actor, the principal the bridge verified for the
requesting socket; where no principal exists, `console` for an action a console sent on a control
socket; and `unattributed` for an action no console caused. Exactly ONE site on the recording
side SHALL resolve the actor, so that a newly added channel or audit append cannot silently lose
attribution. The recording side SHALL NOT read an actor name from the request itself, and SHALL
NOT record the previous constant `operator`. Requests SHALL still be served with no principal.

🔴 **SUPERSEDED 2026-09-23 by `BRIDGE-TRUTH-01` §4, and rewritten HERE, in place, because this
delta has not been archived.** This requirement and the one after it mandated recording "the
operator name declared by the console" — the self-declared label `OPERATOR-NAME-SWEEP-01`
retired. That change superseded this file's LATER requirements and left these two standing, so
archiving it would have written a typed, unverified name into the living spec in SHALL terms, the
day after the product removed it.

#### Scenario: A console's action with no principal says a console did it

- **WHEN** a console on a station with authentication off performs an audited action, whatever
  its request carries in an `actor` field
- **THEN** the row's actor is `console`

#### Scenario: An action with no console behind it is unattributed

- **WHEN** an audited action occurs outside any control request
- **THEN** it is recorded as `unattributed`, because no console caused it

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
bridge SHALL record `console` for an action a console sent, and `unattributed` for one no console
caused: the states the system is actually in, rather than a name nobody checked.

⚠ **AMENDED 2026-09-23 by `BRIDGE-TRUTH-01` §4, in place, for the same reason as above.** It said
every principal-less row reads `unattributed`, which made a console's press and the machine's own
act one string.

#### Scenario: A verified name is not qualified

- **WHEN** an operator signs in and opens the audit surface
- **THEN** the rows carry the verified name and no statement on that surface describes it as
  self-declared, unverified, or typed

#### Scenario: No console-name control exists

- **WHEN** an operator opens the audit surface
- **THEN** there is no control for setting a name recorded as the actor

#### Scenario: With authentication off the record says so

- **WHEN** a bridge runs with authentication off and an operator acts
- **THEN** the entry records `console`

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
