## ADDED Requirements

### Requirement: The bridge serves the console on its own loopback origin

The bridge SHALL serve the Runtime's built console, when given `--console-dir`, on a listener of
its own bound to `127.0.0.1` (port 5174 by default): the directory's files, `index.html` for any
path that names no file extension, a 404 for a missing asset, nothing outside the directory, and
`GET /__cg/health` answering `{ app: "cg-caspar-bridge", pid, execPath }`. It SHALL never serve
the console on the template origin, and SHALL refuse a console port equal to the control or
template port. The listener SHALL start only after the control socket listens.

#### Scenario: The console and its fallback are served

- **WHEN** `/` or a client-side route is requested **THEN** `index.html` is answered, uncached
- **WHEN** a fingerprinted asset is requested **THEN** it is answered with its own type, immutable
- **WHEN** a missing asset or a path outside the directory is requested **THEN** the answer is 404

#### Scenario: The health route names the process

- **WHEN** `GET /__cg/health` is requested **THEN** the answer carries the app identity, the pid
  and the executable running the bridge

### Requirement: An installed station's files live under its own state home

The CLI SHALL resolve every default persisted path under `<state-home>/.cg-runtime/` when given
`--state-home`, with the same file names as under the user's home, and SHALL write nothing under
the user's home in that case.

#### Scenario: The bundled sidecar writes where it is told

- **WHEN** the bundled bridge starts with `--state-home` and a write goes through
  `fixedLayers.set-config` **THEN** the file lands under the state home **AND** nothing is written
  under the user's home

### Requirement: The bridge stops when its parent's pipe closes

The CLI SHALL stop cleanly, releasing its ports, when started with `--exit-on-stdin-close` and its
standard input reaches end-of-file.

#### Scenario: The parent goes away

- **WHEN** the parent closes the bridge's standard input **THEN** the bridge exits with code 0 and
  its console port stops answering

### Requirement: A Playout may be configured by its address alone

The bridge SHALL derive every Playout endpoint — the JWKS included — from `playout.address` through
the contract's fixed paths when an address is configured, and SHALL NOT require `playout.issuer` in
that case. An explicit issuer with no address SHALL resolve exactly as before.

#### Scenario: Only an address

- **WHEN** the playout config holds only `address` **THEN** the JWKS, token, refresh, channels and
  revocation URLs all derive from it **AND** the bridge starts with no issuer

#### Scenario: The issuer-configured station is unchanged

- **WHEN** an explicit issuer and JWKS URL are configured with no address **THEN** the resolved
  settings are those it always had

### Requirement: The issuer is learned from the first station-admin sign-in

The bridge SHALL, while an address-configured station has no issuer, adopt the `iss` of the first
token that verifies against the address's JWKS, carries the audience and holds `station-admin`;
persist it as `playout.issuer`; and from then on compare it byte for byte and never re-adopt. Before
adoption it SHALL refuse every other token with the not-set-up sentence and persist nothing.

#### Scenario: An operator before adoption

- **WHEN** an operator's token is presented before any adoption **THEN** it is refused as "not set
  up yet" **AND** nothing is persisted

#### Scenario: The first station-admin adopts

- **WHEN** a station-admin's token is presented **THEN** it is accepted **AND** its `iss` is persisted
  as `playout.issuer` **AND** the same operator token is then accepted

#### Scenario: A different issuer after adoption

- **WHEN** a token with another `iss` is presented after adoption **THEN** it is refused as not for
  this station **AND** the adopted issuer is unchanged

#### Scenario: A new address clears the adoption

- **WHEN** the Playout address is written again **THEN** the adopted issuer is gone **AND** the next
  station-admin sign-in adopts again

### Requirement: A loopback casparHost is the Playout's own machine

The one D4 reader SHALL rewrite a row's `casparHost` that is loopback (`127.0.0.0/8`, `localhost`,
`::1`) to the host of the configured Playout address, and SHALL pass any other host through byte for
byte.

#### Scenario: One value everywhere

- **WHEN** the catalogue names a channel on `127.0.0.1` **THEN** `channels.catalogue` and
  `channels.list`'s join both see the Playout's host **AND** a row on another host is unchanged

### Requirement: An installed station advertises its first-run phase and declares no channel until one is chosen

The bridge SHALL, when started with `--first-run`, advertise `setup: target` on
`bridge.capabilities` while no Playout is configured and `setup: channel` while no channel is
declared, and SHALL start with no fixed bank rather than the built-in default when no bank file
exists. Without `--first-run` it SHALL behave as before.

#### Scenario: The phases

- **WHEN** an installed station has no Playout **THEN** it advertises `target` **AND WHEN** it has a
  Playout and no bank **THEN** it advertises `channel` **AND WHEN** a bank is declared **THEN** it
  advertises nothing

### Requirement: The bridge answers the Playout's channels unjoined for a station-admin

The bridge SHALL answer `channels.catalogue` to a `station-admin` with the one D4 reader's rows —
host and all, not joined to the configured servers — filtered by `grantsChannel` against each row's
own host, or `rows: null` when the catalogue is absent.

#### Scenario: The grant filters the rows

- **WHEN** a station-admin granted one channel asks **THEN** only that channel is answered

### Requirement: The bridge runs the connection check

The bridge SHALL answer `setup.check` with one line per link — VPN or proxy, route, AMCP `VERSION`,
the Playout's keys, CORS for the console's origin, the station's ports, topology — each pass, fail
or warn with a sentence, and for a dropped AMCP connection or a missing CORS entry the one command
or line to give the Playout's administrator.

#### Scenario: Each failure shape has its own sentence

- **WHEN** the AMCP port refuses, the AMCP host drops the connection, the CORS origin is wrong, or
  the key set is empty **THEN** each prints its own sentence
