## ADDED Requirements

### Requirement: The bridge reads the Playout's channel states at most every 5 seconds and publishes them beside the names

The bridge SHALL read the Playout's D4 channel list no more often than every 5 seconds — one named
constant, with `If-None-Match` — and SHALL publish each row's optional `output` (`on-air` | `off` |
`unknown`) and optional `playlist` (the Playout's word) with its name. Both SHALL be parsed
leniently: an `output` it does not know, or a field of the wrong type, SHALL be dropped — read by the
console as unknown — and SHALL never void the row or its name; a `playlist` word it does not know
SHALL be published verbatim. A failed read SHALL publish no state at all (the catalogue is absent),
never a stale one. The bridge SHALL never infer either fact from CasparCG's layers. Asking for the
channel list — first-run's channel step or `Change channel…` opening — SHALL read D4 first through
the same floor, so no read is ever closer than 5 seconds to the last.

#### Scenario: The floor holds

- **WHEN** the catalogue is polled for a minute
- **THEN** no two reads are closer than 5 seconds, and a 304 keeps what the bridge holds

#### Scenario: State rides with the name

- **WHEN** the Playout reports channel 1 `on-air` / `playing` and channel 2 `off` / `stopped`
- **THEN** the published channel list carries those values beside each channel's name

#### Scenario: A value the bridge does not know never voids a row

- **WHEN** a row's `output` is a value outside the three, or of the wrong type
- **THEN** that field is absent from the published row and the row's name is still published
- **AND** a `playlist` word outside the ten is published as it came

#### Scenario: Opening the channel list reads, through the floor

- **WHEN** `Change channel…` opens five seconds or more after the last read
- **THEN** D4 is read once and the list shows what it answered
- **AND** opening it again inside five seconds reads nothing (the control)

## MODIFIED Requirements

### Requirement: The channel-discovery call names channels and decides nothing

The bridge SHALL answer `channels.list` with every channel any source names — the Playout's catalogue (D4) first, then the declared banks, then channel settings — and SHALL give each channel three facts kept apart: `named` (the catalogue row that joined it, or `null`), `declared` (this station operates it, by the station fence's own predicate) and, with auth ON, `permitted` (the asking principal's grant, by `grantsChannel` and its host rule). A catalogue row SHALL join a channel only when its `casparHost` is one of this bridge's configured servers. The bridge SHALL read D4 at most once every 5 seconds (`UI-POLISH-01` G; it was 30), with `If-None-Match`, using the signed-in principal's token only while that token is neither expired nor revoked, and SHALL NOT read it at all with auth OFF, with no usable bearer, or after the principal signed out. On any failure the catalogue SHALL be ABSENT — no alarm, no verdict, and never a gate on a verb. No channel the answer lists SHALL become one the bridge writes to by being listed; no channel index SHALL be derived or probed beyond what a source names. A joined row's optional `output` and `playlist` (`UI-POLISH-01` G) SHALL ride with its name, as labels that decide nothing. The bridge SHALL push each signed-in console its own answer when the catalogue, the banks, channel settings, the server list or its sign-in change it.

#### Scenario: Our channel named, the Playout's programme channel listed and not ours

- **GIVEN** a bank on channel 2, a catalogue naming channel 1 (the Playout's programme) and channel 2 on this station's host, and a principal granted both
- **WHEN** the console reads `channels.list`
- **THEN** channel 1 is named, permitted and NOT declared, from the catalogue alone; and channel 2 is named, permitted and declared, from the catalogue, the bank and channel settings — in that order

#### Scenario: Another station's row joins nothing

- **WHEN** the catalogue's only row names channel 2 on a host this bridge does not drive
- **THEN** channel 2 is listed unnamed, from the bank and settings; and when the row names this station's host, it is named

#### Scenario: Auth OFF reads no catalogue

- **WHEN** the bridge runs with auth OFF
- **THEN** it builds no catalogue reader, and the answer is the bank and settings with no names and no `permitted`

#### Scenario: At most every 5 seconds, with ETag

- **GIVEN** the sign-in's read reached the Playout
- **WHEN** a read is asked for inside 5 seconds, and again after them
- **THEN** the first is not made; the second is, carries `If-None-Match`, is answered `304`, and the names are still held

#### Scenario: An unreachable Playout is ABSENT and gates nothing

- **GIVEN** the catalogue was read
- **WHEN** the Playout stops answering and the next read fails
- **THEN** no catalogue is held, the channels are listed unnamed, and the console's verbs answer exactly as before

#### Scenario: A revoked or expired bearer is never presented

- **GIVEN** the sign-in's read carried the operator's token
- **WHEN** that token is revoked, or passes its expiry, and a read falls due
- **THEN** no request reaches the Playout and the catalogue is ABSENT; and after sign-out no request is made at all

#### Scenario: The console hears a rename

- **WHEN** the catalogue renames the station's channel and the next read lands
- **THEN** the console receives `channels.changed` carrying the new name

#### Scenario: Nothing past the lists is probed

- **GIVEN** a server running channels 1–4, a bank on 2 and a catalogue naming 1 and 2
- **WHEN** the bridge has connected, read the catalogue and run
- **THEN** channels 1, 3 and 4 receive nothing, while channel 2 is probed

#### Scenario: Two banks are two declared channels

- **GIVEN** banks on channels 1 and 2
- **WHEN** the console reads `channels.list`
- **THEN** channels 1 and 2 are both listed `declared`, each from its own bank
