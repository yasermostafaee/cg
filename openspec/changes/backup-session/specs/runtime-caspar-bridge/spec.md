## MODIFIED Requirements

### Requirement: CG Bridge SHALL keep its own Playout session, and never the password

When its session file is configured, CG Bridge SHALL sign in to the Playout itself (D1) as the account a
station admin names — once, from any console, through a `station-admin` route the lock refuses — SHALL keep
the refresh token in that file, written durably (a temp file, `fsync`, rename) BEFORE anything the answer
carries is used, and SHALL NOT store the password anywhere: not in the file, a log, the audit or the
console. At start it SHALL refresh (D2) with the saved token, and while it has no session every console
SHALL show `CG Bridge needs a station admin to sign in`, with the sign-in offered to a station admin only.
Its access token SHALL be the bearer of every Playout read the bridge makes (D4, D9, D10, D11) — a
signed-in console's being the fallback only while it has none — and SHALL keep the revocation list polled
with no console signed in. Every request the bridge sends the Playout SHALL carry no `Origin` and no
`X-Apasai-Mirrored`. The sign-in SHALL be recorded as `bridge-sign-in`, naming the admin, with no
credential.

_Amended 2026-09-30 (`CENTRAL-BRIDGE-01-A`; Playout `2.9.2` §2 and §8, where a spent refresh token that
comes back more than 10 s after its use revokes its whole family and puts every access token of that user
on D9):_ the bridge SHALL refresh one at a time, and SHALL write a mark naming the token as in flight to the
file BEFORE the token is sent — a refresh whose mark cannot be written SHALL NOT be sent — and SHALL write
the successor with the mark cleared before it is used. A mark found at start, an answer that never arrives
(a timeout, a dropped connection) and a `401` SHALL each be a lost session, and that token SHALL NOT be sent
again; a request that never reached the Playout SHALL keep the token and ask again.

_Amended 2026-10-04 (`RELEASE-0112-01-C` C2, the Playout team's own table,
`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §4):_ the answers that come BEFORE the token is used are `400` and
`415` (malformed), `403` (`cg_not_licensed`, `no_cg_access`), `404` (CG Control switched off on that
Playout) and `429` (rate limit): on each the bridge SHALL keep the token unmarked, SHALL show the Playout's own
message on every console as `CG Bridge: <message>`, and SHALL ask again about every 60 s — never a lost
session. A `401` (used, revoked, expired, or its user disabled or deleted) SHALL be a lost session. A `5xx`,
any status the table does not name — `423` among them, which is D1's alone — and an answer that never
arrives SHALL leave the outcome unknown, and that token SHALL NOT be sent again. The same rules SHALL hold
for each engine's session (`R-085`).

#### Scenario: An admin signs the bridge in once

- **WHEN** the bridge starts with no saved session **THEN** every console shows the line; an operator's
  sign-in of the bridge is refused for its role; a station admin's succeeds, every console is told, the
  record names the admin and holds no password, and the bridge's own Playout reads carry its own bearer,
  still after every console has gone

#### Scenario: A crash between receiving a rotated token and using it

- **WHEN** the bridge refreshes, saves the rotated token and stops before using it **THEN** the restarted
  bridge refreshes with the saved token and is signed in — control: the spent token is presented exactly
  once and never again; and a crash before the save leaves the in-flight mark, so the restarted bridge
  sends nothing and says it needs an admin (amended 2026-09-30: it no longer sends the spent token to be
  refused — `2.9.2` would read that as theft)

#### Scenario: No Origin and no X-Apasai-Mirrored

- **WHEN** the bridge signs in, polls D9 and reads D4 **THEN** no request the Playout received carries
  either header — control: the same log holds the bridge's D1 and a request carrying a bearer

#### Scenario: A crash between sending a refresh and saving its answer

- **WHEN** the bridge sends D2 and stops before saving the answer, and restarts more than 10 s later
  **THEN** it sends no refresh with that token, says it needs a station admin, and the Playout counts no
  reuse — control: a clean refresh keeps working across three restarts, rotating the token each time

#### Scenario: An answer that never arrives

- **WHEN** the D2 reaches the Playout and its answer is lost **THEN** the token is not sent again — not by a
  retry and not after a restart — and a request that never reached the Playout is asked again and works

#### Scenario: A refusal before use keeps the token

- **WHEN** the Playout answers the refresh `403 cg_not_licensed` with a message **THEN** every console shows
  `CG Bridge: <message>`, the saved token is kept unmarked, and once the licence is back the same token
  refreshes

#### Scenario: D2's outcome table, on each engine's session

- **WHEN** an engine answers a refresh `400`, `415`, `403`, `404` or `429` **THEN** that engine's token is kept
  and asked again **AND WHEN** it answers `401` **THEN** that engine's session is lost **AND WHEN** it answers
  a `5xx` or `423`, or never answers **THEN** that token is never sent again — on the primary engine's
  session and on the backup's alike

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
