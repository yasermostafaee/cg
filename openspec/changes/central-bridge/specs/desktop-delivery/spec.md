## ADDED Requirements

### Requirement: CI SHALL build three Windows installers, and drive them on clean runners

The project SHALL build, on `windows-latest`, an NSIS installer for CG Bridge (per machine: the service
every console connects to), one for CG Control (per user, no administrator: a console with no bridge
and no port) and one for CG Designer (per user, no administrator), and SHALL drive them on clean runners
that built nothing: CG Bridge's own lifecycle on one, and the two apps against an installed CG Bridge on
another. `CENTRAL-BRIDGE-01` §1 A, C, E.

#### Scenario: Three installers are produced

- **WHEN** the desktop workflow runs **THEN** the three installers are uploaded as artifacts, each named
  for the release

#### Scenario: The apps are driven against CG Bridge

- **WHEN** the apps' smoke runs **THEN** CG Bridge is installed first, CG Control is installed without
  administrator rights, and it connects to CG Bridge on the Playout's host

### Requirement: CG Bridge SHALL install as an automatic Windows service that depends on nothing

CG Bridge's installer SHALL register the service `CGBridge` (display name `CG Bridge`) under its own
account, starting automatically, restarted by Windows on failure, with NO service dependency (the Playout
team's rule 1: never on `ApasaiEngine`). A stop by an administrator SHALL stay a stop: recovery answers a
failure only. Its state SHALL live in `%ProgramData%\CG Bridge\`, which no ordinary user may read (it
holds the bridge's Playout session). A silent install (`/S`) SHALL take each value it is given WHOLE —
`/PLAYOUT=http://host:8080` included — a value running to the next space, and a quoted one holding one.
An upgrade SHALL stop and start the service itself and keep the configuration; the uninstaller SHALL
remove the service, its three firewall rules and its program files and keep the data folder, and, given
`_?=<folder>` as its last, unquoted argument, SHALL finish before it exits so its exit code is the
uninstall's. Exit codes: 0 done, 1 cancelled, 2 failed.

#### Scenario: A silent install on a clean Windows

- **WHEN** `CG-Bridge_<v>_x64-setup.exe /S /PLAYOUT=http://127.0.0.1:59999` runs **THEN** it exits 0 **AND**
  the service runs, starts automatically, runs as `NT SERVICE\CGBridge`, depends on nothing and is
  restarted on failure **AND** `/health` names the Playout `http://127.0.0.1:59999` whole

#### Scenario: A stop stays a stop; a crash does not

- **WHEN** an administrator stops the service **THEN** it is still stopped after the first restart delay
- **WHEN** the bridge's process is killed **THEN** Windows starts it again (a new `startedAt`)

#### Scenario: Upgrade and uninstall

- **WHEN** the same installer runs again with `/S` **THEN** it exits 0, the configuration is kept and the
  service runs again
- **WHEN** `uninstall.exe /S _?=<folder>` runs **THEN** it exits 0 only once the service, the rules and
  the program files are gone, and the data folder is kept

### Requirement: CG Bridge's installer SHALL open exactly its own ports, and CG Control's none

CG Bridge's installer SHALL add three inbound rules, named as ours (`CG Bridge - consoles`, `CG Bridge -
template pages`, `CG Bridge - OSC from CasparCG`), each scoped to the installed `cg-bridge.exe`, on the
ports in force (TCP control, TCP templates, UDP OSC and OSC + 1) — never UDP 6250, the Playout engine's —
and its uninstaller SHALL remove only those. CG Control's installer SHALL add no firewall rule.

#### Scenario: The rules, by their fields

- **WHEN** CG Bridge is installed **THEN** each rule is one rule, enabled, inbound, allowing, on every
  profile, for its protocol and port, for `cg-bridge.exe` alone **AND** nothing binds UDP 6250

#### Scenario: CG Control opens nothing

- **WHEN** CG Control is installed and running **THEN** no firewall rule is named for it — control: CG
  Bridge's three are listed by the same read

### Requirement: CG Control SHALL ask where the Playout is before it connects anywhere

CG Control SHALL load its own bundled console (`http://tauri.localhost`) and SHALL find CG Bridge on the
Playout's host, port 5280, or at a separate server's address this console was given. With no station
record it SHALL show ONE question — the Playout's address, and CG Bridge's for a separate server — and
connect nowhere until it is answered; the answer SHALL be saved in this console's station record
(`cg.runtime.station.v1`), never over the control socket and never as CG Bridge's configuration. A
station admin SHALL be able to change both addresses in Station setup. When the console cannot reach
the CG Bridge it names, it SHALL say where it looked and why nothing answered, and inside CG Control it
SHALL offer `Set up again`, which forgets this console's station and asks again.

#### Scenario: The first question

- **WHEN** CG Control opens with no station record **THEN** it asks for the Playout's address and opens
  no socket — control: given `192.0.2.20` it dials `ws://192.0.2.20:5280` and saves
  `http://192.0.2.20:8080`

#### Scenario: A separate server

- **WHEN** a CG Bridge address `192.0.2.30:5281` is given beside the Playout's **THEN** the console dials
  `ws://192.0.2.30:5281` and never the Playout's host

#### Scenario: The way back

- **WHEN** CG Bridge is not reachable at the address **THEN** the line names it —
  `CG Bridge not reachable at <host>:<port>` — with the reason **AND** `Set up again` forgets the record
  and shows the question — in a browser there is no such control

### Requirement: CG Bridge's logs SHALL be downloadable as one zip by a station admin

The audit log SHALL offer `Download logs` to a station admin (or where auth is off) while the console is
connected; it SHALL save every file under CG Bridge's `logs\` folder as one zip, opened by a one-use
ticket the admin's socket was given. A console with no connection, or signed in without station-admin,
SHALL show no such control.

#### Scenario: An admin downloads the logs

- **WHEN** a station admin presses `Download logs` **THEN** one zip of CG Bridge's logs is saved — control:
  an operator is offered no such control

## MODIFIED Requirements

### Requirement: Each installed app's window SHALL paint its splash's ground before any page does

CG Control's and CG Designer's windows SHALL declare, as their window and webview background, the
ground of the app's own splash, so that no white frame shows before the first page paints.
`CENTRAL-BRIDGE-01`: CG Control's window shows its bundled console first — no starting page gives way
to it any more — so its splash makes its entrance there as in a browser.

#### Scenario: No white frame

- **WHEN** either installed app opens its window **THEN** the window's background is its splash's
  ground, read from that splash

### Requirement: The release's SHA256SUMS.txt SHALL be the only one, and SHALL match its assets

A CI build of the installers SHALL NOT carry a `SHA256SUMS.txt` in its artifacts, so the only file of that
name is the release's. After the draft release is created, the release job SHALL check its
`SHA256SUMS.txt` against the uploaded assets: every line SHALL name an asset of the release by its exact
name, every asset but the sums SHALL have a line, and each hash SHALL match the file uploaded — and
GitHub's own digest of that asset when it reports one. Any mismatch SHALL fail the job.

#### Scenario: The names match

- **WHEN** `v<version>` is released **THEN** each line of `SHA256SUMS.txt` names one of the four other
  assets exactly (`CENTRAL-BRIDGE-01`: CG Bridge's installer, the two apps', the guide), with its hash

#### Scenario: A wrong name fails

- **WHEN** a line names a file the release does not hold (for example `CG Control_<v>_x64-setup.exe`,
  with a space) **THEN** the check fails, naming the line

## REMOVED Requirements

### Requirement: CI builds two Windows installers

**Reason**: `CENTRAL-BRIDGE-01` — three installers: "CI SHALL build three Windows installers, and drive
them on clean runners" replaces it.

### Requirement: CG Control starts its bridge and loads the console from it

**Reason**: `CENTRAL-BRIDGE-01` — CG Control carries no bridge: it loads its own bundled console and
connects to CG Bridge, the service on the Playout machine ("CG Control SHALL ask where the Playout is
before it connects anywhere"). The starting page, its `STARTING BRIDGE` phase and the "continued" splash
went with it; the splash now reads `CONNECTING`.

### Requirement: CG Control leaves no bridge behind

**Reason**: `CENTRAL-BRIDGE-01` — CG Control starts no bridge, so it has none to leave. CG Bridge is a
service that outlives every console by design (the apps' smoke measures that closing CG Control leaves it
running and uncounting the console).

### Requirement: The CG Control installer opens exactly the ports CasparCG needs

**Reason**: `CENTRAL-BRIDGE-01` — the ports are CG Bridge's: "CG Bridge's installer SHALL open exactly its
own ports, and CG Control's none" replaces it. (Its UDP 6250 rule was for a port the bridge no longer
binds — rule 7.)

### Requirement: The Playout address is written only by CG Control

**Reason**: `CENTRAL-BRIDGE-01` — two addresses now, each outside the socket: CG Bridge's Playout is its
configuration, written by its installer (`--write-service-config`, `/PLAYOUT=`); a console's Playout is
its own station record, which says where its CG Bridge is ("CG Control SHALL ask where the Playout is
before it connects anywhere").

### Requirement: CG Control's log folder SHALL be reachable from its console

**Reason**: `CENTRAL-BRIDGE-01` — the logs are CG Bridge's, on another machine: "CG Bridge's logs SHALL be
downloadable as one zip by a station admin" replaces it.
