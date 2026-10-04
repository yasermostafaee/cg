## ADDED Requirements

### Requirement: CG Bridge SHALL keep one Playout session per engine, each signed in with that engine's own account

With a server B configured, CG Bridge SHALL keep a Playout session for the backup engine beside the primary
engine's (`R-085`). The backup engine's address SHALL be the primary engine's address with server B's host
(each engine serves its API on its own core's machine). Each session SHALL have its own D1 and D2, its own
refresh family, its own "refresh in flight" mark and its own file (`bridge-session-backup.json` beside
`bridge-session.json`), under the same rules as the primary's: a refresh token written durably before it is
used, a mark found at start or an outcome not known meaning the token is never sent again, a refusal before
use keeping the token. The backup's file SHALL record the engine address it belongs to; a file whose address
is not the backup engine's address now SHALL be treated as no session, and its token SHALL never be sent. A
station admin SHALL sign the backup engine in from a console with that engine's own account and password,
which CG Bridge drops after that one request. Every request to an engine's API SHALL carry that engine's own
token and never the other engine's. A failure, a `401`, a reuse revocation or a password change on one
engine SHALL NOT touch the other engine's session, and nothing on air SHALL change because of it.

#### Scenario: Each engine signed in with its own account

- **WHEN** a station admin signs CG Bridge in on the primary engine and on the backup engine, each with that
  engine's own password **THEN** each engine's D1 is posted to that engine alone **AND** each session's
  refresh token is on disk in its own file before anything it carries is used

#### Scenario: Tokens never cross

- **WHEN** CG Bridge reads the backup engine (D11, D4, the license, D9) **THEN** each request carries the
  backup engine's token **AND** no request to either engine ever carries the other engine's token

#### Scenario: A problem on one engine stays on that engine

- **WHEN** the backup engine refuses a refresh as spent (a reuse revocation, a new password) **THEN** only
  the backup's session is lost, the primary's session and every console are untouched, and nothing on air
  changes
- **AND WHEN** the primary engine's session is lost **THEN** the backup's session is untouched

#### Scenario: A backup moved to another machine

- **WHEN** server B's host changes **THEN** the old backup session is not used and its token is never sent
  to the new machine, and the backup engine reads as needing a station admin's sign-in

### Requirement: The backup engine's own session SHALL be the only bearer for the backup engine's reads

CG Bridge SHALL read the backup engine with the backup engine's own session and nothing else: its D11
`?fingerprint=` lookup (`B-286`), its D4, its `/api/cg/license` and its introducing D9 — never the primary engine's
token and never a console's. D4's rows SHALL resolve a loopback `casparHost` to the backup engine's host
(rule 9). When the backup engine has no session, none of these is read: the media box stays empty on server B
with its reason in words, exactly as before, and nothing is guessed. Each access token the backup's session
gains SHALL make one server-side D9 read on the backup engine at once (the introduction that lets this
machine into the backup core's AMCP when its account holds `station-admin`).

#### Scenario: The backup's own clip, found with the backup's token

- **WHEN** the backup engine's session is signed in and its D11 lists a bound clip's fingerprint at its own
  path **THEN** the lookup carried the backup's token **AND** a take sends server B the backup's own path

#### Scenario: The primary's token is never tried on the backup

- **WHEN** the backup engine has no session **THEN** the backup engine is sent no D11, D4 or license read at
  all, and every media plate stays empty on server B, naming that its media list has not been read

### Requirement: CG Bridge SHALL say each engine's state in words, and never refuse a primary take for the backup

CG Bridge SHALL publish each engine's state to every console (`bridgeSession.engines`, pushed on change):
`signed-in` (with the account) · `needs-admin` · `not-licensed` (the engine answered `403 cg_not_licensed`,
or its license reads not licensed) · `refused` (with the engine's own reason) · `amcp-pending` (the engine
signed in, and its core's AMCP has not let this machine in within `AMCP_TRUST_WINDOW_MS`) · `unreachable` (its
API does not answer) · `waiting` · `core-held` (the backup only, `B-313`) · `core-shared` (the primary only:
another CG Bridge drives its core; nothing is held). A station-admin console SHALL sign
the backup engine in through `bridgeSession.backup.sign-in`. The backup engine's state SHALL never refuse,
delay or change a take, an update or a clear on the primary; the backup's license is reported and never
refuses anything.

#### Scenario: CG not licensed on the backup

- **WHEN** the backup engine answers its D1 with `403 cg_not_licensed` **THEN** the backup's state is
  `not-licensed` with the engine's own message **AND** a take on the primary is sent exactly as before

#### Scenario: The backup unreachable

- **WHEN** the backup engine's API does not answer **THEN** the backup's state is `unreachable` **AND** the
  primary's session, its reads and its takes are untouched

### Requirement: The installed CG Bridge SHALL keep Station setup's server B across a restart

The installed CG Bridge SHALL bring a server B saved by `connections.set-config` back into force after the
service restarts — the service takes its connection's server A from its configuration file — with the strategy and
auto-failover saved beside it (`B-312`). Server A stays the configuration file's; a server B flag on the
command line still wins over the saved one.

#### Scenario: A reboot keeps the backup

- **WHEN** a station admin adds server B in Station setup and the service restarts **THEN** the bridge comes
  back with server B declared and mirrors to it

### Requirement: CG Bridge SHALL never be a second sender on the backup core

A CG Bridge with a server B SHALL read `GET /health` of the CG Bridge on server B's machine (at its own
control port) at start, when server B connects and every 15 s. While a CG Bridge answers there that drives
server B's core — a `casparcg.servers` row naming that core (its host, or loopback on that machine, and its
AMCP port) with at least one channel in `casparcg.channels`, or a `/health` that names no channels at all —
this CG Bridge SHALL send that core NOTHING: its server B session is stopped, it never fails over to server B,
and server B's state reads `core-held`, naming the other bridge's address, on every console and in `/health`
(`B-313`). Nothing on server A changes. When the other bridge no longer drives the core (it went idle, or
stopped answering), server B is connected again. A `/health` that is this bridge's own (the same `startedAt`
and ports) SHALL never count. Server A's machine SHALL be read the same way when server A is not this
machine; another bridge driving server A's core SHALL be said on the primary engine's line (`core-shared`)
and SHALL hold nothing — the primary is never refused for it. `/health` SHALL carry `casparcg.channels`, the
channels a bridge drives (empty for a bridge in first-run), so an idle bridge never holds anyone.

#### Scenario: A second bridge on the backup machine is given a channel

- **WHEN** the CG Bridge on the backup engine's machine drives the backup core **THEN** the primary's CG
  Bridge sends the backup core nothing, every console's backup line says another CG Bridge drives it, and
  takes on the primary are sent exactly as before

#### Scenario: An idle bridge holds nobody

- **WHEN** the CG Bridge on the backup engine's machine is in first-run (it drives no channel) **THEN** the
  primary's CG Bridge mirrors to the backup core as always
- **AND** the idle bridge's own AMCP trace carries no layer write
