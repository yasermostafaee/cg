## ADDED Requirements

### Requirement: Every line to server B SHALL carry server B's own channel number, or SHALL NOT be sent

CG Bridge SHALL rewrite every line bound for server B from the station's channel N to N's mirror on B, M, with
the layer unchanged, in one place: the redundancy seam, on every road a line reaches B — the live fan-out, the
failover catch-up, the corrective resend, and every send while B is the primary (`B-316`, `R-089`). A line for a
channel with no mapping in force, a line of a shape CG Bridge does not know, and any line carrying `route://`
SHALL NOT be sent to B. Server A's line SHALL be sent exactly as it is today. Before a line is sent to B, a guard
SHALL judge the final line on its own: its channel SHALL be one of B's mirror channels in force, its layer SHALL
lie in CG's layers (50–99) or be the station's own configured layer, and a channel-wide line SHALL be only
`MIXER M COMMIT` or `INFO M`; a line for a preview, holder, guard or unmapped channel on B SHALL be refused by the
guard itself and logged. A problem on B SHALL never block, delay or clear anything on A.

#### Scenario: A take reaches B on B's own channel

- **WHEN** A's channel 1 is mirrored at B's channel 2 and an operator takes a row on channel 1 **THEN** core A
  receives exactly the lines it received in `0.11.2` **AND** core B receives the same lines with `1-` written
  `2-`, and nothing on its channel 1

#### Scenario: Every road to B uses B's number

- **WHEN** an UPDATE, a look switch, a swap, a clear, a `CLEAR ALL`, a restore and a failover catch-up act on
  A's channel 1 **THEN** every line core B receives for them is a `2-…` line, and none names B's channel 1, a
  preview channel or an unmapped channel

#### Scenario: An unmapped channel sends B nothing

- **WHEN** A's channel 2 has no mapping and an operator takes a row on it **THEN** it is on air on A as before
  **AND** core B receives no line for it

#### Scenario: The guard refuses a verbatim line

- **WHEN** a line for B arrives at the guard untranslated (a planted fault) **THEN** it is not sent, because B's
  channel 1 is not one of B's mirror channels

#### Scenario: No route reaches B

- **WHEN** a plate's line carries `route://` **THEN** core B receives nothing for it, whichever server is the
  primary

### Requirement: CG Bridge SHALL map each declared channel to its mirror on the backup engine by the Playout's rule

For each channel N that the station declares on server A, CG Bridge SHALL find N's mirror on the backup engine
from the backup engine's own D4 (read with its own session) by the Playout team's rule
(`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §3): A's D4 row for N gives the id X; B's rows with `mirrorOf.id` equal to
X whose `mirrorOf.playout` names the primary engine — the host compared, any scheme and port ignored — match; a
row whose `playout` is empty matches only when exactly one row in B carries that id; zero or more than one match
is no mapping. CG Bridge SHALL NOT use the primary's `mirrors[].casparChannel` and SHALL NOT read it. A station
admin's explicit entry `N → M` SHALL be used where D4 gives none, after it is checked against B's D4: a row with
`casparChannel` M exists on server B, its `videoMode` equals A's, its `cgLicensed` is `true`, and it is not the
declared mirror of another channel; a failed check SHALL be refused in words beside the entry. When the two
sources disagree there SHALL be no mapping, and that SHALL be said. Every mapping SHALL also require B's row to be
`cgLicensed: true`, to share A's `videoMode`, and to name server B as its `casparHost` once a loopback host is read
as B's machine (rule 9). B's D4 SHALL be re-read on its own cycle, at B's sign-in and on B's reconnect, and a
mapping SHALL be used only while B's D4 has answered within the last 30 s; A's last good D4 SHALL be kept through
an outage of the primary. When a mapping in force disappears or changes while CG holds live layers on that
channel, CG Bridge SHALL send B nothing more for that channel and nothing to any other channel in its place, SHALL
say so, and SHALL put the new mapping in force at that channel's next take.

#### Scenario: Playout `2.9.5` names the mirror

- **WHEN** B's D4 has a row at channel 2 with `mirrorOf` naming A's host (with or without a port) and A's id for
  channel 1 **THEN** A's channel 1 maps to B's channel 2

#### Scenario: A name where CG knows an IP

- **WHEN** `mirrorOf.playout` is a host name and CG Bridge knows the primary engine by its IP **THEN** there is no
  mapping, and B is sent nothing for that channel, unless a station admin enters one and it passes the check

#### Scenario: An empty playout

- **WHEN** one row in B carries A's id with an empty `playout` **THEN** it is the mapping **AND WHEN** two rows
  carry that id **THEN** there is none

#### Scenario: A backup before `2.9.5`

- **WHEN** B's D4 has no `mirrorOf` **THEN** no channel is mapped until a station admin enters `CH 1 → CH 2`,
  which is checked against B's D4 and then used

#### Scenario: A failed check

- **WHEN** an entry names a B channel whose `videoMode` differs from A's, or whose `cgLicensed` is false **THEN**
  the entry is refused in words and the channel stays unmapped

#### Scenario: A mapping changes while live

- **WHEN** a row is on air on A's channel 1 and B's D4 moves the mirror from channel 2 to channel 4 **THEN** B is
  sent nothing more for channel 1, not on 2 and not on 4, until the next take there, which goes to 4

### Requirement: A station admin's backup channel entries SHALL be kept with the station

The entries SHALL be set only by a station admin, through `backupChannels.set-entries`, refused while the lock
holds, and recorded in the audit. They SHALL be written durably beside the connection file, stamped with the
server B they were made for, and SHALL be in force again after a service restart and an upgrade. An entry made
for another server B SHALL NOT be used, and SHALL be said.

#### Scenario: A restart keeps the entries

- **WHEN** a station admin enters `CH 1 → CH 2` and CG Bridge restarts **THEN** the entry is back in force

### Requirement: Reads from server B SHALL be mapped back to the station's channel

Before anything read from server B touches CG's state, CG Bridge SHALL read it as the station's channel N: B's
OSC messages for M, B's acknowledged clears and B's `INFO` answers. A message from B for a channel with no mapping
in force SHALL be ignored and logged once.

#### Scenario: After a failover B's OSC confirms the mirror

- **WHEN** B is the primary and B's channel 2 reports a producer on layer 80 **THEN** CG reads it as A's channel 1
  layer 80 **AND** B's channel 1 reporting its own programme is ignored

### Requirement: After a failover CG Bridge SHALL refuse a take where no backup channel is known

While server B is the primary, a take on a channel with no mapping in force SHALL be refused before anything is
sent or changed, with `No backup channel is known for CH N`; every other line for such a channel SHALL be refused
at the seam with a code and nothing sent. A take on a mapped channel SHALL go to B's M.

#### Scenario: Unmapped after a failover

- **WHEN** B is the primary and A's channel 2 has no mapping **THEN** a take on channel 2 is refused with `No
backup channel is known for CH 2` and core B receives nothing
