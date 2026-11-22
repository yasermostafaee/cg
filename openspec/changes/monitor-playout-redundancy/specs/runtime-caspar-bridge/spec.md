## ADDED Requirements

### Requirement: Playout topology monitors use channel-scoped verified return mappings

CG Bridge SHALL discover Playout links for a declared channel only after authorizing that
logical channel. A reserve SHALL receive a return relay only after its catalogue verifies the
reciprocal channel link and its own physical output. Discovery SHALL use read-only requests.
Picture and sound SHALL each use a ticket for the selected mapping. If a mapping expires or
changes, the previous mapping's ticket SHALL open no replacement stream.

#### Scenario: A linked reserve changes its physical channel

- **WHEN** the reserve confirms a new physical output number or withdraws the previous link
- **THEN** CG Bridge closes viewers of the former mapping
- **AND** a ticket for the former mapping opens no stream

#### Scenario: A discovered engine belongs to another channel

- **WHEN** an engine is discovered on the network but has no verified link to the selected channel
- **THEN** its programme picture and sound are not added to that channel's return relays

### Requirement: Managed layouts go only to their verified Playout owner

The managed Bridge executor SHALL submit complete prepared layouts to a verified owner.
For a configured External CG v2 group, it SHALL query Engines with their own credentials and require one
self-confirmed owner with a current fence, membership and allowed-layer mapping. It SHALL
persist the original command ID, destination and exact body before posting to that owner.
Playout is responsible for replication. An unresolved submission SHALL block further group
writes until a matching terminal decision is recovered for that command.

#### Scenario: A template is prepared independently on every Engine

- **WHEN** the executor prepares a managed template **THEN** the configured Engines confirm
  the same bundle hash using their separate sessions
- **WHEN** a member reports a different bundle or has no receipt **THEN** preparation fails
  before the caller can claim group readiness

#### Scenario: The Playout owner changes

- **WHEN** a new complete layout arrives after the former command has a terminal decision
  and Playout confirms a new owner **THEN** the executor submits it to the new owner's own
  channel using that Engine's credential, fence and revision
- **WHEN** the Engines report conflicting owners **THEN** the executor sends no layout

#### Scenario: An acknowledgement is lost

- **WHEN** the Engine's reply is lost **THEN** a restarted Bridge retains the original command
  and reads or reconciles that command's receipt without submitting a new layout
- **WHEN** a matching applied or rolled-back decision is verified **THEN** the executor can
  accept the next full layout with fresh ownership and a fresh ID

### Requirement: The static HTML pilot restores the applied template state

The opt-in Bridge pilot SHALL use the managed layout API for Play, Update, Stop and Clear
of supported static HTML templates. It SHALL preserve other applied layers and confirm the
selected row from Playout's applied state. Raw Caspar commands SHALL be limited to observation
for the pilot.

#### Scenario: The Bridge restarts after an applied update

- **WHEN** the Bridge restarts with a retained matching template and a confirmed applied layout
- **THEN** Control restores the row's data and on-air status from that layout
- **AND** the exported HTML can apply the same complete state on a fresh renderer without
  replaying the entrance
