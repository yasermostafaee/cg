# runtime-caspar-bridge

## MODIFIED Requirements

### Requirement: The bridge's template HTTP server is reachable by CasparCG

The template HTTP server SHALL serve on a host CasparCG can reach, while the
control WebSocket SHALL remain bound to `127.0.0.1`. WHEN CasparCG is local
(connection host is loopback) the server SHALL bind `127.0.0.1` and the `CG ADD`
URL SHALL use `127.0.0.1` (no LAN exposure). WHEN CasparCG is remote the server
SHALL bind a routable interface **only by explicit opt-in** and the `CG ADD` URL
host SHALL be the bridge's address as CasparCG sees it (configured, or a guessed
LAN IPv4), logged loudly.

The advertised host and port SHALL resolve through **three layers, in this
order: explicit command-line flag > persisted connection config > built-in
derivation.** A `--template-serve-host` / `--template-serve-port` flag SHALL
therefore override a stored value for the whole life of that process, so a boot
script or automation that passes the flag cannot be silently overridden by a
value an operator saved from a panel.

A stored serve host that is ABSENT and one that is an EMPTY STRING SHALL both
resolve to the derivation and SHALL behave identically. Neither SHALL ever be
advertised as an address. The same SHALL hold for the port, where the derived
value is the ephemeral bind (`0`).

The bridge SHALL report, alongside the serve address in force, (a) which of
those fields a command-line flag is currently forcing and to what value, and
(b) the addresses of this machine's non-internal IPv4 interfaces as CANDIDATES.
Candidates SHALL be presented as candidates and never as a verdict: the bridge
cannot know which interface the plant can reach, and asserting one is the
failure the derivation already has.

#### Scenario: Local CasparCG stays loopback

- **WHEN** CasparCG runs on the same machine **THEN** the template server serves on
  `127.0.0.1`, the `CG ADD` URL uses `127.0.0.1`, and the control WebSocket stays
  loopback

#### Scenario: Remote CasparCG uses an opt-in routable serve host

- **WHEN** CasparCG runs on another host **THEN** the template server binds a
  routable interface by explicit configuration and the `CG ADD` URL uses the
  bridge's CasparCG-reachable address (configured or guessed), while the control
  WebSocket stays loopback

#### Scenario: A stored serve host survives a bridge restart

- **WHEN** a serve host is saved into the connection config and the bridge is
  restarted with no `--template-serve-host` flag **THEN** the stored value is the
  advertised host **AND** it is the host in the `CG ADD` template URL

#### Scenario: A command-line flag overrides the stored serve host

- **WHEN** the bridge is started with `--template-serve-host` while a DIFFERENT
  serve host is stored in the connection config **THEN** the flag's value is
  advertised and used in the `CG ADD` URL, the stored value is not **AND** the
  bridge reports that the flag is forcing that field, naming the flag and the
  value in effect

#### Scenario: An empty stored serve host derives, exactly as an absent one does

- **WHEN** the stored serve host is an empty string **THEN** the advertised host
  is the derived one **AND** it is byte-identical to what an ABSENT stored value
  produces for the same connection config; no empty host is ever advertised

#### Scenario: A pinned serve port appears in the served URL, an empty one is ephemeral

- **WHEN** a serve port is stored **THEN** the template server binds that port and
  the `CG ADD` URL carries it
- **WHEN** the stored serve port is absent or empty **THEN** the bind is ephemeral
  and the `CG ADD` URL carries the actually-bound port

#### Scenario: The bridge offers this machine's interfaces as candidates

- **WHEN** the serve configuration is read **THEN** the response carries this
  machine's non-internal IPv4 addresses as candidates **AND** the surface
  presenting them states that they are candidates rather than a determination of
  which one the plant can reach

## ADDED Requirements

### Requirement: The serve address is configured in the app, and a masked field says so

The operator SHALL be able to set the template serve host and port from the
Runtime's server settings panel, beside the server hosts it is a fact about, and
Apply SHALL persist them and put them in force on the RUNNING bridge through
`connections.set-config`. No bridge restart SHALL be required, and the app SHALL
NOT offer to start, stop or restart the bridge.

WHEN a command-line flag is forcing a field, the panel SHALL show the value
actually in effect, SHALL name the flag responsible, and SHALL mark the stored
value as _not in force_. The control SHALL REMAIN EDITABLE and SHALL NOT be
greyed out or disabled: the stored value is what takes over at the next boot
without the flag, so it must stay editable, and grey reads as "you cannot change
this", which is false.

WHEN an Apply succeeds but leaves configured CasparCG servers unable to fetch the
address, the dialog SHALL NAME those servers, SHALL state that they will show
live sources with NO TEMPLATE, and SHALL state that `CG ADD` will still report
success. That message is about the CONFIGURATION and SHALL NOT be worded as
evidence that any template page loaded — nothing on this path measures a fetch.

#### Scenario: The serve host is set and applied without restarting the bridge

- **WHEN** the operator types a serve host in the panel and presses Apply with
  nothing on air **THEN** the config is persisted, the running bridge re-derives
  template serving with that host, and the panel reports the result **AND** no
  restart is requested or required

#### Scenario: A masked field shows the flag's value and keeps the stored one editable

- **WHEN** the panel opens while `--template-serve-host` is in force **THEN** the
  field shows the value actually in effect, names `--template-serve-host` as the
  reason, shows the stored value struck through and labelled _not in force_
  **AND** the input remains editable and is not disabled

#### Scenario: Apply names the servers that cannot fetch the address

- **WHEN** Apply succeeds with a loopback serve address while a REMOTE CasparCG
  server is configured **THEN** the dialog names that server, says it will show
  live sources with no template, and says `CG ADD` will still report success

#### Scenario: The candidate list does not claim to know the answer

- **WHEN** the panel offers detected addresses **THEN** they are labelled as
  candidates, and choosing one is an operator decision the surface does not make
  on their behalf
