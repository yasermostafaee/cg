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

### Requirement: Managed manual sequences use an absolute page

The Bridge SHALL validate the authored page count before advancing a supported finite manual
cut sequence. It SHALL send the destination page in a complete managed layout. A page turn
SHALL preserve the graphic instance, fields and unrelated layout layers.

#### Scenario: Next after the Bridge restarts or ownership transfers

- **WHEN** a supported manual sequence is showing and the Bridge restores its applied layout
- **THEN** the next press advances from the confirmed page and only the current owner receives the layout
- **AND** a fresh renderer displays the applied page without replaying an entrance or earlier pages

#### Scenario: Previous and Go to page in a bundled picture book

- **WHEN** an eligible authored manual Cut picture book is on air
- **THEN** Previous and Go to page submit the destination page to the confirmed owner
- **AND** Control publishes the page from the applied layout under the book's field
- **AND** the renderer uses the ordered pictures bundled with the verified template

#### Scenario: The reserve Core restarts on a confirmed sequence page

- **WHEN** Playout restores the applied layout after a reserve Core restart
- **THEN** the reserve's fresh renderer shows the same page and applied fields on its programme
- **AND** Bridge submits no new layout to cause the recovery

#### Scenario: Next at the last page and Stop

- **WHEN** Next is pressed while the last page is shown
- **THEN** the page stays visible and Bridge submits no new layout
- **WHEN** the operator stops the sequence
- **THEN** the stopped layout records the first page for the next Play

#### Scenario: Stop is pressed during an in-flight Next

- **WHEN** a page turn is awaiting confirmation and the operator presses Stop on that row
- **THEN** Bridge processes the stop after the preceding command settles
- **AND** an unresolved command continues to fence further writes
