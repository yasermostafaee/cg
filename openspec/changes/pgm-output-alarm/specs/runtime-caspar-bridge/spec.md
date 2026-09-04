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

### Requirement: Missing-consumer creation is off by default and, when on, bounded

The bridge SHALL NOT send any `ADD` on account of a missing consumer unless
`--create-missing-consumers` is given. That default SHALL be resolved by ONE exported function,
SHALL be read back on the boot line, and a test SHALL fail if either the function or the shipped
CLI's boot line stops saying OFF. A value on the flag SHALL be refused at boot.

When creation is on, the bridge SHALL send at most ONE `ADD` per connection per channel, built
from the missing consumer's OWN declaration — the same device token, embedded-audio, key-only and
keyer flags — and SHALL NEVER name a device the declaration did not. It SHALL create only a kind
the check found missing and only a DeckLink with a declared device; a missing monitor
(`screen`, `system-audio`) or any other kind SHALL be recorded as `not-attempted` with the reason.
The wire's answer SHALL be recorded in the check (`created`, `refused` with its code, or `failed`)
and a `202` SHALL be verified by re-reading `INFO <channel>` rather than believed.

#### Scenario: Off by default — no ADD, however long the output stays missing

- **WHEN** the bridge runs without `--create-missing-consumers` and a declared consumer is missing
- **THEN** no `ADD` is ever sent and the check carries no creation record

#### Scenario: On — one ADD with the declaration's own parameters, and the refusal recorded

- **WHEN** `--create-missing-consumers` is on, `casparcg.config` declares
  `<decklink><device>23487013</device><embedded-audio>true</embedded-audio>` and it is not running
- **THEN** exactly `ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO` is sent once, a `403` is recorded as
  `refused` with code 403 and that command, the verdict stays `missing`, and no further `ADD` is
  sent on later re-reads

#### Scenario: On — an accepted ADD is verified, not believed

- **WHEN** CasparCG answers the `ADD` with `202` and the subsequent `INFO <channel>` reports the
  consumer running
- **THEN** the creation record is `created` and the verdict is `ok`

#### Scenario: On — a missing monitor is reported, not created

- **WHEN** only a `screen` consumer is missing
- **THEN** nothing is sent and the creation record is `not-attempted` naming the kind

#### Scenario: The default is pinned by the shipped CLI's boot line

- **WHEN** `bin/caspar-bridge.mjs` starts with no flag
- **THEN** it prints `missing-consumer creation: OFF (default)`; with the flag it prints
  `missing-consumer creation: ON (--create-missing-consumers)`; with `--create-missing-consumers=<value>`
  it refuses to boot
