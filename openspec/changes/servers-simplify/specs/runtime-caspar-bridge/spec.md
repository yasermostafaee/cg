## ADDED Requirements

### Requirement: A serve host that names another machine SHALL leave every configured server unable to fetch graphics

The bridge SHALL judge which configured CasparCG servers cannot fetch the template address in ONE predicate
(`hostsUnableToFetchTemplates`) that takes this machine's own addresses — the list Station setup offers as candidates
— as an input, and SHALL name EVERY configured server, a local one included, when the advertised host is an IPv4
address that is neither loopback nor one of them. A host given as a name SHALL NOT be judged. The serve state and the
apply answer SHALL say so as `elsewhere`, and the boot and apply line SHALL say the host is not this machine, never
that the server is loopback-only.

#### Scenario: The owner's `.32` advertising `.93`

- **WHEN** the bridge's addresses are `192.168.21.32` and the advertised host is `192.168.21.93` **THEN** every
  configured server is named unable, the serve state reports `elsewhere: true`, and the line says
  `192.168.21.93 is NOT this machine`

#### Scenario: Loopback, its own address, or a name

- **WHEN** the advertised host is `127.0.0.1`, one of the bridge's own addresses, or `cg-bridge.local` **THEN** it
  is not judged another machine

### Requirement: The connection check SHALL report whether server A joins the Playout's

The bridge SHALL judge whether a CasparCG host is this station's through ONE predicate (`hostIsOurs`), built once
and read by the meters, the sources and the check. A check of the station's own Playout asked by a signed-in
principal SHALL carry `casparJoin` — server A's host, the host the Playout's first row on a declared channel resolves
to by this bridge's own Playout host, and whether server A joins it. An unsigned check SHALL NOT carry it. A
signed-in check that names a CasparCG host SHALL keep the bridge's own lines; the narrowing before a sign-in SHALL be
unchanged. The join itself SHALL NOT be relaxed.

#### Scenario: On the Playout's machine

- **WHEN** the bridge's own Playout is `127.0.0.1` and server A is `192.0.2.93` **THEN** the meters are dropped
  **AND** the check carries `casparJoin` with `playoutCasparHost` `127.0.0.1` and `joins: false` **AND** after server
  A is set to `127.0.0.1` the meters return

#### Scenario: On a separate server

- **WHEN** the bridge's own Playout is `192.0.2.32` and server A is `127.0.0.1` **THEN** the meters are dropped
  **AND** `casparJoin` names `192.0.2.32` with `joins: false` **AND** after server A is set to it the meters return

#### Scenario: Before a sign-in

- **WHEN** an unsigned console checks the station's own Playout **THEN** the answer carries no `casparJoin`
