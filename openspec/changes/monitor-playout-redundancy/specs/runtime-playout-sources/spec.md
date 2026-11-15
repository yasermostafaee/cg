## MODIFIED Requirements

### Requirement: The bridge SHALL send a backup server only a clip the backup's own Playout lists, found by fingerprint

A D11 item's `source` and `fingerprint` (`2.9.1`) SHALL be parsed as optional fields — a `fingerprint` SHALL be
kept only as 64 hexadecimal characters, lower-cased — and a bound clip SHALL carry the fingerprint its last
read gave. With a server B configured, the bridge SHALL look every bound clip's fingerprint up in the BACKUP
Playout's own D11 (`GET /api/cg/media?fingerprint=<v>[,<v>…]`, at most 100 per request, at the address of the
configured Playout with server B's host), and SHALL cache each answer by fingerprint: when a clip is bound,
on the bound-media refresh, and again after server B reconnects. A returned item SHALL count only when its
own `fingerprint` equals the one asked for. A take, a swap and a restore SHALL never wait on this lookup:
they read the cache. A media `PLAY` SHALL go to server A with A's `clip` and to server B with the clip B's
Playout listed for the same fingerprint. When the clip has no fingerprint, B's Playout lists no copy, B's
Playout is older than `2.9.1` (its items carry no fingerprint), or B's list has not been read, server B SHALL
be sent nothing for that plate (neither its `PLAY` nor its transport verbs), the primary SHALL air it as
before, and the console SHALL show a compact backup status in Layers with the affected input's name and
reason in Inspector details. A journal replay or a corrective
resend to server B SHALL carry B's own line and never the primary's path.

#### Scenario: The backup's own clip

- **WHEN** a plate is bound to a clip whose fingerprint server B's Playout lists at another path **THEN** the
  take sends server A `PLAY … "<A's clip>"` and server B `PLAY … "<B's clip>"`
- **AND** no line to server B ever carries A's path

#### Scenario: A clip the backup lacks

- **WHEN** server B's Playout lists no item with the clip's fingerprint **THEN** server A airs the clip and
  server B is sent nothing for that plate
- **AND** Layers keeps the template name visible and Inspector details identify the clip missing on the backup
- **AND** a clip the backup does list, in the same take, goes to server B with B's own path (the control)

#### Scenario: No fingerprint, and a backup older than 2.9.1

- **WHEN** the primary's D11 gives the clip no fingerprint **THEN** server B is sent nothing for it, and Inspector details report the missing fingerprint
- **AND WHEN** server B's Playout answers items that carry no fingerprint at all **THEN** every media plate is
  refused on server B with Inspector details naming the version requirement

#### Scenario: The take does not wait

- **WHEN** server B's Playout does not answer the lookup **THEN** a take completes within its usual time, and
  server B is sent nothing for the clip

#### Scenario: A failover replay

- **WHEN** a journaled strategy replays to server B **THEN** it replays B's own `PLAY` line, and a plate
  refused on B is not replayed at all
