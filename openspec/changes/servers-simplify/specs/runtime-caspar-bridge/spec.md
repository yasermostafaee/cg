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
