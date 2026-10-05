## ADDED Requirements

### Requirement: The status bar SHALL say how many channels reach the backup

With a server B, the status bar SHALL carry `BACKUP B · n of m channels mapped` beside the backup's pill, where m
is the station's declared channels and n those whose mapping is in force; it SHALL read in the alarm tone when
none is mapped and in the warning tone when some are not, and plainly when all are. Words only.

#### Scenario: One of two mapped

- **WHEN** channel 1 is mapped and channel 2 is not **THEN** the status bar reads `BACKUP B · 1 of 2 channels
mapped` in the warning tone

### Requirement: Each channel's view SHALL say where its backup lines go

With a server B, the channel's own view — never another channel's — SHALL carry one line: `Backup: CH M on
<host>` while the mapping is in force, `Backup: not mapped — nothing is sent to the backup` when there is none,
and `Backup: held until the next take — nothing is sent to the backup` while a changed mapping waits for a take.
The reason a channel is not mapped SHALL ride the line's `title`. While server B is the primary, the PROGRAM
pane SHALL say plainly `Not available on the backup engine` for the return, its sound and its meter.

#### Scenario: The mapped channel's line

- **WHEN** channel 1 is mapped to B's channel 2 on `127.0.0.1` **THEN** channel 1's view reads `Backup: CH 2 on
127.0.0.1` **AND** channel 2's view reads its own line, not channel 1's

### Requirement: Station setup SHALL take a station admin's backup channel for each declared channel

With a server B, Station setup → Servers SHALL carry a `Backup engine` card with one line per declared channel,
`CH N (primary) → CH M (backup)`, where a station admin types M (any other principal reads it), and beside it the
line's state in words: where the mapping comes from, or why it is not used. It SHALL be built from the shared
primitives, and saving it SHALL NOT wait for anything to leave air.

#### Scenario: An entry is refused beside its line

- **WHEN** a station admin enters `CH 1 → CH 3` and B's channel 3 has another video mode **THEN** the line says
  so, and the status bar still counts channel 1 as not mapped
