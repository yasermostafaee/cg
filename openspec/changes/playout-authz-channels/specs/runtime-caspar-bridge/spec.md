# runtime-caspar-bridge

## ADDED Requirements

### Requirement: Every route declares a permission class, and the gate enforces it

Every route in the bridge's route table SHALL declare a permission class as a REQUIRED field,
so that a new channel cannot be routed without answering who may reach it. The three classes
SHALL be `read`, `operator` and `station-admin`, and they SHALL be rungs of a principal
hierarchy rather than statements about what a route writes: a principal at a rung may reach
every route at that rung and below.

The class SHALL be a positional argument of `route(…)` rather than an optional field with a
default, so that the compiler refuses a route that does not answer.

`read` SHALL mean any signed-in principal, a viewer included. `auth.sign-out` SHALL be `read`,
because what it writes is the principal's own session rather than the station, and a viewer who
could not sign out would be stranded at a console.

When the bridge is in `auth: 'off'` the gate SHALL return before resolving anything — no role
lookup, no channel resolution and no configuration read — so that a station which has not
federated identity is byte-identical to before this change.

#### Scenario: A viewer reads everything and operates nothing

- **WHEN** a principal holding only the `viewer` role sends `stack.take`, `stack.out`,
  `stack.stop` or `stack.remove`
- **THEN** each is refused with the shared role refusal, nothing is sent to CasparCG, and the
  same socket's `stack.snapshot` still answers

#### Scenario: A viewer can sign out

- **WHEN** a principal holding only the `viewer` role sends `auth.sign-out`
- **THEN** it is accepted, because `read` names the bottom rung of the hierarchy and not a
  promise that the route does not write

#### Scenario: Only a station-admin reaches the configuration verbs

- **WHEN** a principal holding `operator` sends `delimiters.set` or `channelSettings.set`
- **THEN** each is refused with the role refusal
- **AND WHEN** a principal holding `station-admin` sends the same request
- **THEN** it is accepted

#### Scenario: The census walks every route

- **WHEN** the permission census runs over the built route table
- **THEN** every route carries one of the three classes, exactly six are `station-admin`, and
  the `read` set is pinned by name so that a route joining it reddens the guard

### Requirement: A request is authorised against the principal's channel grants

The bridge SHALL resolve which CasparCG channels a request touches through ONE resolver, and
SHALL refuse the request when any resolved channel is not one the principal is granted.

A grant SHALL authorise a channel if and only if the grant's channel number matches AND the
grant's host is one of the hosts this bridge is configured to drive, read through
`configuredCasparHosts` rather than from `servers.A.host` directly. The grant value `"*"` SHALL
authorise every channel and an empty grant list SHALL authorise none.

The predicate SHALL live in `@cg/shared-ipc` and SHALL be the only implementation, so that the
bridge's gate and any surface describing the principal's channels cannot disagree.

The resolver SHALL read both the item→slot map and the live-layer ledger, because a live plate
can sit on a coordinate the item's template does not.

Bulk verbs SHALL be decided all-or-nothing over the union of their members' channels, before the
first send, so that a refusal cannot follow a partial action.

The role SHALL be checked before the channel, so that a principal who may not operate at all
hears that rather than a narrower sentence naming a channel they still could not use.

#### Scenario: Another station's host does not authorise this station's channel

- **WHEN** a principal holding `operator` and a grant for channel 1 at a host this bridge does
  not drive sends `layers.clear` for channel 1
- **THEN** it is refused with a sentence naming channel 1, and nothing is sent to CasparCG

#### Scenario: The granted channel is reached

- **WHEN** a principal holding `operator` and a grant for channel 1 at this bridge's host sends
  `layers.clear` for channel 1
- **THEN** it is accepted

#### Scenario: A request touching no channel is not refused for lacking one

- **WHEN** a principal holding `operator` sends `stack.remove` or `stack.set-position` for an
  item that holds no slot and no live-layer record
- **THEN** the request is not refused by the permission gate, because it touches no channel and
  nothing on air

### Requirement: The emergency silence stays unscoped

`stack.silence-all-live-plates` SHALL require the `operator` class and SHALL NOT be scoped to a
channel, because its scope is the whole live-plate ledger and an emergency control must not
depend on the bookkeeping whose failure is the emergency.

#### Scenario: The panic button is not channel-scoped

- **WHEN** the channel resolver is asked which channels `stack.silence-all-live-plates` touches
- **THEN** it answers none, so no channel check is applied to it
