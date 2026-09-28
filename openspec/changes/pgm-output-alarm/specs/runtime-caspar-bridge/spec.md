# runtime-caspar-bridge — delta (the declared-versus-running output check, C-029)

## ADDED Requirements

### Requirement: The bridge reads what casparcg.config declares and what the channel runs, and publishes a missing-output verdict

The bridge SHALL read, over the AMCP axis, the consumers `casparcg.config` DECLARES for each
declared channel (`INFO CONFIG`) and the consumers actually RUNNING on that channel (the
`<output>` block of `INFO <channel>`), and SHALL publish per channel, in the server's health
snapshot, the declared set, the running set and every declared consumer KIND with fewer running
instances than declared. The declaration SHALL be read once per connection; the running set
SHALL be read from the reply the video-mode read already sends, re-read on a slow interval while
the server is reachable, and re-read after a reconnect. The verdict SHALL be published when its
content changes and SHALL be written to stderr on the transition into `missing` and once when it
clears.

A declaration that answers but cannot be read as a configuration SHALL be recorded as unreadable
and SHALL NOT be asked again on that connection; an unreadable declaration is a gap in the check,
never an alarm. A channel reply carrying no `<output>` element SHALL be treated as "could not
check", never as an empty channel.

The verdict SHALL be KEPT across a disconnect. The one predicate `outputVerdictOf` in
`@cg/shared-ipc` SHALL decide, from the kept verdict and the server's reachability, whether the
server is `ok`, `missing`, `unverifiable` (unreachable after a `missing` verdict) or `unknown`; no
surface SHALL re-derive that decision.

#### Scenario: The plant's fixture raises the verdict, named by device

- **WHEN** `INFO CONFIG` declares `<decklink><device>23487013</device>`, `<screen/>` and
  `<system-audio/>` for channel 1 and `INFO 1`'s `<output>` carries only `system-audio` and
  `screen`
- **THEN** the health snapshot's check for channel 1 lists the three declared consumers, the two
  running ones, and `missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] }]`,
  the verdict is `missing`, and the declaration was read exactly once for the connection

#### Scenario: The verdict clears without a reconnect when the consumer is seen running

- **WHEN** a later re-read of `INFO 1` reports a `decklink` consumer at any port
- **THEN** the check's `missing` is empty and the verdict is `ok`

#### Scenario: A reconnect re-reads both halves

- **WHEN** the AMCP connection drops and the session comes back healthy
- **THEN** the declaration is read again and the verdict is recomputed from the new readings,
  so a CasparCG restarted after a config fix clears the alarm on the next tick

#### Scenario: An unreadable declaration is a gap, asked once

- **WHEN** `INFO CONFIG` answers with a document that has no `<channels>` block
- **THEN** the check records `declared: null`, `missing` is empty, the verdict is `unknown`, and
  no further `INFO CONFIG` is sent on that connection

#### Scenario: The server dies after a missing verdict — kept, and unverifiable

- **WHEN** the verdict is `missing` and the server becomes unreachable
- **THEN** the health snapshot still carries the check, and `outputVerdictOf` answers
  `unverifiable` with the last observation, never `unknown` and never `ok`

### Requirement: A missing consumer is reported and never created

The bridge SHALL NOT send any consumer `ADD` on account of a missing consumer, whatever flag it
was started with, and the output check SHALL carry no creation record. A consumer `ADD` on a
programme channel is one of the Playout's C5 commands this station never sends (`FOLLOWUPS-01` A,
the owner's decision of 2026-09-28, superseding the bounded, off-by-default re-creation this
change first shipped behind `--create-missing-consumers`).

The retired `--create-missing-consumers` flag, bare or with a value, SHALL NOT stop the bridge
booting; the bridge SHALL say once on stderr that the flag is retired and ignored.

#### Scenario: No ADD, however long the output stays missing — even to a server that would accept

- **WHEN** a declared DeckLink is missing and the server would answer an `ADD` with `202`
- **THEN** no `ADD` is ever sent, the verdict stays `missing`, and the check has no `creation` key

#### Scenario: The retired flag still boots, and says so

- **WHEN** `bin/caspar-bridge.mjs` starts with `--create-missing-consumers` or
  `--create-missing-consumers=<value>`
- **THEN** it prints that `--create-missing-consumers is retired and ignored` and reaches its
  listening line; started without the flag, it says nothing about it
