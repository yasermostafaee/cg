# CG Bridge — for the Playout team

Release `0.11.3` (`RELEASE-0113-01`, 2026-10-05; first written for `0.10.0` by `CENTRAL-BRIDGE-01`, then
`0.11.0`, `0.11.1` and `0.11.2`). **One CG Bridge per Playout client.** A station's Playout client may run a
primary engine and a backup engine; one CG Bridge serves both (§3). CG Bridge is a Windows service on the
primary engine's machine, or on a server beside the engines. Every CG Control is a console that connects to it;
a console never talks to CasparCG. This document is what your engine and your installer need from us, and what
we promise. It answers your letters `PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md`, the `2.9.2` licence letter
(`PLAYOUT-CG-RESPONSE-LICENSE-v1.md` §2, §8, §9), `PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` and
`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` (§3 below: **never the primary's channel number on the backup core**).

## 1. `GET /health`

`http://127.0.0.1:5280/health` — on CG Bridge's control port (`5280` unless configured otherwise), the
same port the consoles use.

- **No authentication, no secret.** No token, no password, no account name. The Playout addresses and the
  station's hosts and ports are in it; they are not secrets.
- **Under one second.** It is built from what the bridge already holds; the request does no I/O.
- **While CG Bridge is starting** (the instant between its port opening and its state being ready):
  `503`, body `CG Bridge is starting`, header `Retry-After: 1`. After that, always `200`,
  `Content-Type: application/json`, `Cache-Control: no-store`.
- Any other plain HTTP request on that port answers `426` (the port is the consoles' WebSocket).

**The shape is fixed.** A field is added only with a line in this section, and none is renamed or removed
without a version we tell you about. Our schema test refuses any field not listed here. `0.11.2` added
`casparcg.channels`, `playout.backup` and three problem codes; `0.11.3` adds `casparcg.servers[].channels` and
the problem code `backup-channels`.

| Field                                           | Meaning                                                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`                                           | Always `"cg-bridge"` — how a reader knows it asked CG Bridge                                                                                                               |
| `version`                                       | CG Bridge's version, `major.minor.patch`                                                                                                                                   |
| `startedAt`                                     | When this process started (ISO 8601, UTC)                                                                                                                                  |
| `uptimeS`                                       | Seconds since then                                                                                                                                                         |
| `casparcg.state`                                | The primary: `up` (commands land, OSC heard), `degraded` (commands land, OSC silent), `down`                                                                               |
| `casparcg.servers[]`                            | One row per declared server                                                                                                                                                |
| `casparcg.servers[].label`                      | `A` (declared first) or `B` (backup)                                                                                                                                       |
| `casparcg.servers[].role`                       | The role NOW — after a failover `B` is `primary`                                                                                                                           |
| `casparcg.servers[].host`, `.amcpPort`          | Where CG Bridge sends AMCP                                                                                                                                                 |
| `casparcg.servers[].amcp`                       | `up`, `connecting` or `down`                                                                                                                                               |
| `casparcg.servers[].osc`                        | `subscribed` (our `OSC SUBSCRIBE` accepted), `refused`, `unbound` (our OSC port not bound), `none`                                                                         |
| `casparcg.servers[].oscHeardAt`                 | When OSC was last heard from it (ISO 8601), or `null`                                                                                                                      |
| `casparcg.servers[].channels`                   | `0.11.3` — the channels CG Bridge writes on THAT core, in that core's own numbers: server A the declared channels, server B the backup's mirror channels in force (§3)     |
| `casparcg.channels`                             | `0.11.2` — the CasparCG channels this CG Bridge drives (its declared channels); `[]` while it is in first-run                                                              |
| `playout.address`                               | The primary engine CG Bridge reads (D4, D9, D10, D11), or `null`                                                                                                           |
| `playout.session`                               | CG Bridge's own session on the primary engine: `off`, `waiting`, `needs-admin`, `signed-in`, `refused`                                                                     |
| `playout.lastReadAt`                            | The last good D4 read (ISO 8601), or `null`                                                                                                                                |
| `playout.backup`                                | `0.11.2` — the backup engine (§3), or `null` with no server B                                                                                                              |
| `playout.backup.address`                        | The backup engine's API address                                                                                                                                            |
| `playout.backup.session`                        | CG Bridge's own session on the backup engine — the same five words as `playout.session`                                                                                    |
| `playout.backup.state`                          | The backup engine's line in one word: `off`, `waiting`, `signed-in`, `needs-admin`, `not-licensed`, `refused`, `amcp-pending`, `unreachable`, `core-held`, `core-shared`   |
| `playout.backup.lastReadAt`                     | The last good D4 read of the backup engine, with its own token (ISO 8601), or `null`                                                                                       |
| `consoles`                                      | Console connections open now, signed in or not                                                                                                                             |
| `ports.control`, `ports.templates`, `ports.osc` | The ports in force                                                                                                                                                         |
| `problems[]`                                    | What stops CG Bridge working, in words; empty when nothing does                                                                                                            |
| `problems[].code`                               | `reserved-port`, `port-refused`, `osc-unbound`, `playout-session`; from `0.11.2` also `backup-engine`, `core-held` and `core-shared`; from `0.11.3` `backup-channels` (§3) |
| `problems[].message`                            | One English sentence, e.g. `CG Bridge needs a station admin to sign in`                                                                                                    |

Example (a fresh install, no CasparCG yet, no station-admin sign-in yet, no backup):

```json
{
  "app": "cg-bridge",
  "version": "0.11.3",
  "startedAt": "2026-09-30T10:48:34.772Z",
  "uptimeS": 11,
  "casparcg": {
    "state": "down",
    "servers": [
      {
        "label": "A",
        "role": "primary",
        "host": "127.0.0.1",
        "amcpPort": 5250,
        "amcp": "down",
        "osc": "none",
        "oscHeardAt": null,
        "channels": []
      }
    ],
    "channels": []
  },
  "playout": {
    "address": "http://127.0.0.1:8080",
    "session": "needs-admin",
    "lastReadAt": null,
    "backup": null
  },
  "consoles": 0,
  "ports": { "control": 5280, "templates": 7911, "osc": 6251 },
  "problems": [
    { "code": "playout-session", "message": "CG Bridge needs a station admin to sign in" }
  ]
}
```

## 2. The installer

**File:** `CG-Bridge_<version>_x64-setup.exe`. Per machine, 64-bit Windows only (on 32-bit Windows it
exits `2`). It asks for administrator rights. **What it is:** our setup program, CG Setup, with CG
Bridge's NSIS installer inside it. Double-clicked, it shows CG Setup's window. **Run with `/S`, it shows
nothing: it runs the NSIS installer with exactly your command line and returns that installer's exit
code — every switch, the uninstall line and every exit code in this section are the NSIS installer's
own, unchanged in `0.11.3`.** Our clean-Windows test runs each silent path against the NSIS installer alone
and against the file you receive, and requires the same codes. It needs Windows 10 or later, as CG Bridge's
own Node runtime does. **Size:** about 23.5 MB — `0.11.1`'s was 24,677,440 bytes, as your letter measured
(the release lists the exact size and SHA-256 of each release's). It carries everything: the official
`node.exe` (as `cg-bridge.exe`), the service host Shawl 1.9.0 (MIT), our bridge as one file, and the licences.
**Nothing is downloaded during an install.**

**Signing:** this test build is NOT signed. Windows SmartScreen warns when a person double-clicks a
downloaded copy (Mark of the Web). Your installer running ours from its own payload is not a download.

### Silent install

```text
CG-Bridge_<version>_x64-setup.exe /S [/PLAYOUT=http://host:8080] [/AMCPHOST=127.0.0.1] [/AMCPPORT=5250]
    [/OSCPORT=6251] [/CONTROLPORT=5280] [/TEMPLATEPORT=7911] [/BRIDGEADDRESS=<this machine's IP>]
```

- A value runs to the next space; a value in double quotes may hold one. `/PLAYOUT=http://192.0.2.10:8080`
  is taken whole (our first clean-Windows run found an older build cutting it at the first `/` — fixed
  and tested).
- **On the Playout machine, give nothing but `/S`:** the first install takes `http://127.0.0.1:8080`,
  AMCP goes to `127.0.0.1:5250` over IPv4, OSC to `6251`.
- **On a server beside the engines:** `/PLAYOUT=http://<primary engine IP>:8080 /AMCPHOST=<primary engine IP>
/BRIDGEADDRESS=<this server's IP>`. `/BRIDGEADDRESS` is the address CasparCG fetches template pages
  from. The backup engine is not given here: a station admin adds it in CG Control (§3).
- **From `0.11.1`, a person installing by hand on a separate server is not given this line.** CG
  Setup's window has a page for it — a checkbox, "CG Bridge runs on a separate server (not on the
  Playout machine)", unticked by default, then the Playout's address, CasparCG's host and this server's
  address — and it runs the NSIS installer with exactly these three switches. The page refuses, in
  words, every Playout address the bridge would refuse at start, and a loopback address for this
  server; it never runs under `/S`. **Nothing in this section changed for a silent install:** the same
  switches, the same defaults, the same exit codes.
- `/OSCPORT=6250` is refused: that port is yours.
- From Inno Setup: `Exec(ExpandConstant('{tmp}\CG-Bridge_0.11.3_x64-setup.exe'), '/S', '', SW_HIDE,
ewWaitUntilTerminated, ResultCode)`. Your `2.9.4` chains it exactly this way, after your engine's service
  has started, behind «CG Bridge هم نصب شود» under «CG Control (اگر CG Bridge روی سرورِ جداست، تیک را
  بردارید):» (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §2); `0.11.3` keeps every part of that line as
  it was. **On a pair, untick it on both engine machines** (`/MERGETASKS="!cgbridge"` silently), as your
  `PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §4 says, and install CG Bridge once, beside them (§3).

**Exit codes:** `0` installed (warnings, if any, are written to `install.log` under `WARNINGS:`); `1`
cancelled by the user (an interactive run only); `2` failed (`install.log` says why).

### What the installer does, in order

1. Stops OUR service if it runs (never another), waiting up to 30 s.
2. Puts the files in `%ProgramFiles%\CG Bridge\`.
3. Writes the configuration `%ProgramData%\CG Bridge\cg-bridge.json` through the bridge's own schema. An
   upgrade keeps every value it is not given.
4. Registers the service once and sets it (below).
5. Replaces the data folder's permissions (below).
6. Imports, ONCE, the state an older CG Control `0.9.x` kept for a user of this machine
   (`%APPDATA%\CG Control\.cg-runtime`); nothing is deleted, and that older session is never copied.
7. Adds our three firewall rules (below).
8. Checks Windows' reserved port ranges (below).
9. Starts the service, waiting up to 30 s.
10. Writes the Installed-apps entry (below).

Every step is logged, with its exit code and output, to `%ProgramData%\CG Bridge\logs\install.log`.

### The Installed-apps entry — a guarantee to your installer

Your `2.9.4` reads it to decide whether to run our file at all, so it is a contract, not a detail:

- **Exactly one row**, in the **64-bit** registry view only:
  `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\CGBridge`. Nothing of ours is written to the
  32-bit view, so your read of both views finds one row.
- `DisplayName` = **`CG Bridge`**, exactly.
- `DisplayVersion` = the release, **`major.minor.patch`** (`0.11.3`), never a fourth part or a suffix.
- Publisher `APASAI`.

Read on a clean Windows runner after the install and after every upgrade path we test — over the
`0.10.0`, `0.11.0`, `0.11.1` and `0.11.2` installers and over itself — and pinned there: a change to any of these
fails our build by name. If one ever has to change, we tell you in a letter before a release carries it.

### The service

- Name `CGBridge`, display name `CG Bridge`, run by Shawl as `NT SERVICE\CGBridge` (its own account).
- Start: **automatic**. **No service dependency** — never on `ApasaiEngine` (your rule 1).
- Recovery: restart after 5 s, 5 s, then 30 s; the count resets after a day; a failed exit counts as a
  failure. An administrator's stop stays a stop.
- Stop: Ctrl+C to the bridge, 10 s to finish, then the process tree is ended.

### Upgrade

Run the new installer (with `/S`; values optional). It stops our service, replaces the files, keeps the
configuration and the state — a backup engine added in CG Control included (`0.11.2`), and its channel
entries (`0.11.3`) — and starts the service. **Nothing on air is cleared by an install, an upgrade or a service restart:** CG Bridge sends no
`CLEAR` at start. After a start, CG Bridge reads each declared channel (`INFO <ch>`): a row whose page still
plays is adopted; a row whose layer is empty is reported off air (§6).

### Configuration

`%ProgramData%\CG Bridge\cg-bridge.json`, read at every start:

| Key              | Meaning                                                      | Default            |
| ---------------- | ------------------------------------------------------------ | ------------------ |
| `playoutAddress` | The primary engine's API (required)                          | —                  |
| `amcpHost`       | CasparCG's AMCP host                                         | `127.0.0.1` (IPv4) |
| `amcpPort`       | CasparCG's AMCP port                                         | `5250`             |
| `oscPort`        | Our OSC port (server B's is `+1`); `6250` refused            | `6251`             |
| `controlPort`    | Consoles and `/health`                                       | `5280`             |
| `templatePort`   | Template pages CasparCG fetches                              | `7911`             |
| `bridgeAddress`  | The host CasparCG fetches templates from (a separate server) | this machine       |

The file is strict: an unknown key is refused, and the service then does not start; the log names the
file. `0.11.3` adds no key. To change a value, re-run the installer with it, or edit the file and restart
the service. The same values can be given on the command line (`cg-bridge.exe caspar-bridge.mjs
--service-config <file> --port …`); the command line wins.

**CG Bridge never changes a port by itself.** At start it reads Windows' reserved port ranges
(`netsh interface ipv4 show excludedportrange`): a port of ours inside one is one line in the log and a
`reserved-port` problem in `/health`, and the installer warns.

### Data, logs and permissions

`%ProgramData%\CG Bridge\`:

- `cg-bridge.json` — the configuration;
- `.cg-runtime\` — the state (the stack, the layer ledger, the templates, the channels declared, the
  servers, and `bridge-session.json`: CG Bridge's own session on the primary engine — a refresh token, never
  a password; from `0.11.2` `bridge-session-backup.json` beside it, the backup engine's; from `0.11.3`
  `bridge-backup-channels.json`, a station admin's backup channel entries);
- `logs\` — `install.log`, `uninstall.log`, the service's output (daily, 14 days kept) and `amcp.log`
  (every AMCP command, its reply and its time; 5 MB, then one previous file). A station admin downloads
  them all as one zip from any CG Control (Audit log → `Download logs`).

Permissions: inheritance off; SYSTEM and Administrators full control; `NT SERVICE\CGBridge` modify; **no
ordinary user can read the folder**, because it holds the bridge's sessions.

### Firewall

Inbound rules, each for `%ProgramFiles%\CG Bridge\cg-bridge.exe` only, every profile, on the ports in
force: `CG Bridge - consoles` (TCP `5280`), `CG Bridge - template pages` (TCP `7911`) and
`CG Bridge - OSC from CasparCG` (UDP `6251` and `6252`). An install or upgrade replaces ours; the
uninstaller deletes ours; **no other rule is touched**, and nothing binds UDP `6250`.

### Uninstall

```text
"%ProgramFiles%\CG Bridge\uninstall.exe" /S _?=%ProgramFiles%\CG Bridge
```

- `_?=` makes the uninstaller finish before it exits, so its exit code is the uninstall's. It must be
  the **last** argument and **not quoted**, even though the path has spaces — NSIS's own rule. Quoted,
  it is not seen: the uninstaller copies itself away, exits `0` at once, and works on in the background.
- Run this way it cannot delete itself: delete `uninstall.exe` and the folder afterwards.
- It removes our service, our three rules and our program files, and **keeps**
  `%ProgramData%\CG Bridge\` (the configuration, the state and the logs), so a reinstall carries on.

## 3. A primary engine and a backup engine — `0.11.3`

One Playout client, two engines: CG Bridge sends the backup engine's core (server B) the same CG layers it
sends the primary's (server A), **each on the backup's OWN mirror channel — never the primary's channel
number** (your `PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §2). `0.11.2` sent server B the primary's lines as they
were; on a pair whose mirror of channel 1 is the backup's channel 2 that wrote channel 1 of the backup — another
channel, possibly another programme on air. `0.11.2` is therefore superseded and must not be installed with a
backup engine; `0.11.3` replaces it.

**The mapping — your rule, adopted.** For the station's channel N, whose row in the primary engine's D4 has
`id` X:

1. CG Bridge reads the **backup engine's own D4**, with the backup's own token. A row matches when its
   `mirrorOf.id` is X and its `mirrorOf.playout` names the primary engine — the **host** compared, as a name or
   an address, with or without a port or a scheme. Its form is what an admin typed; we never guess it.
2. A row whose `mirrorOf.playout` is empty matches only when it is the **one** row in the backup's D4 with that
   `mirrorOf.id`.
3. **Zero matches or more than one = no mapping.** CG Bridge sends server B nothing for channel N, and says so.
4. From the matched row: the backup's own `casparChannel` (M). It is used only when the row's `casparHost` is
   server B's core (rule 9: loopback means the backup engine's machine), its `videoMode` is the primary row's,
   and its `cgLicensed` is `true`.

**The primary's `mirrors[].casparChannel` is never used** — CG Bridge does not even read it (your §3: recorded
when the mirror was made, never refreshed).

**A backup engine before `2.9.5`** publishes no `mirrorOf`, so nothing is mapped and nothing is sent to it until
a station admin enters each channel by hand in CG Control: Station setup → Servers → Backup engine, one line
per channel, `CH N (primary) → CH M (backup)`. Each entry is checked against the backup engine's D4, as your §2
proposes — row M exists on server B, its `videoMode` is the primary's, `cgLicensed` is `true`, and it is not
another channel's mirror — and a failed check is refused in words beside that line. The entries are kept with
the station across a service restart and an upgrade, and only ever for the server B they were made for. On a
`2.9.5` engine the D4 mapping is used; an entry that **disagrees** with it is no mapping — nothing is sent to
server B for that channel — and both numbers are shown.

**Kept current.** The backup's D4 is read again on our D4 cycle (rule 6), when CG Bridge signs in on the backup
and when server B reconnects; a backup whose D4 has not answered for 30 s counts as no mapping. A mapping that
disappears or changes while CG holds layers on that channel stops everything to server B for that channel at
once — no line to the old number, none to the new one, **no clean-up on a number we would be guessing** — and the
console says so; the restored or new mapping takes effect at that row's next take. A mapping that appears where
there was none is in force at once; rows already on air reach the backup at their next take.

**Where it is translated, and the fence on it.** One place in CG Bridge turns each line for server A into
server B's line: the channel number becomes M, the layer stays. Then a send guard for server B alone refuses any
line on a channel that is not a mapped mirror in force, any layer outside 50–99 other than the station's own
configured layer (the one exception server A's guard makes too), any `route://` source (a route
names server A's channel numbers, so route plates stay on the primary), and any channel-wide line other than
`MIXER M COMMIT` and `INFO M`. Your preview, holder and guard channels on the backup are therefore never written.
What CG Bridge reads from server B — OSC, `INFO`, layers it finds at start — is read on M and mapped back to N; a
channel of the backup that is not a mirror in force is ignored and logged once.

**After a failover** CG Bridge sends on M. A take on a channel with no backup channel is refused before anything
is sent: `No backup channel is known for CH N.` CG Control's PROGRAM return, its sound and its loudness meter are
read from the primary engine; on the backup they say `Not available on the backup engine` instead of reading
another channel.

**What `/health` says.** `casparcg.servers[].channels` lists, per core, the channels CG Bridge writes there in
that core's own numbers — server A the declared channels, server B the mirrors in force. A declared channel with
no backup channel adds the problem `backup-channels`: `No backup channel is known for CH N: nothing is sent to
the backup engine for it.` CG Control shows `BACKUP B · n of m channels mapped` in its status bar (amber when
some are not, red when none are), and each channel's own view shows `Backup: CH M on <host>` or
`Backup: not mapped — nothing is sent to the backup`.

**Where CG Bridge goes.** We recommend a separate server beside both engines, with «CG Bridge هم نصب شود»
unticked on **both** engine machines (`/MERGETASKS="!cgbridge"` in a silent install). On the primary engine's
machine it also works, but if that machine dies CG Bridge dies with it and the backup engine receives nothing
from CG until it is back. A CG Bridge must never run on the backup engine's machine as well: two senders on
one core apply each other's half-built `MIXER` changes, because a core keeps one `DEFER` list per channel.

**Server B.** A station admin adds the backup engine in CG Control (Station setup → Servers → Backup server);
it is saved with the station and kept across a service restart and an upgrade. It is never an installer
switch.

**A session per engine.** Each engine signs its tokens with its own key, so a token from one is refused by the
other — your `PLAYOUT-CG-RESPONSE-0110-111-v1.md` §2. CG Bridge therefore keeps **one session per engine**,
each signed in once by a station admin with **that engine's own** account and password, each with its own
rotating refresh token, its own "refresh in flight" mark and its own file, under the same rules as §4's rule 8.
A token is only ever sent to the engine that issued it; a session saved for one engine's address is never
sent to another. On the backup engine CG Bridge reads, with the backup's own token: D9 (one read per token, so
your engine admits this machine's AMCP), D4, D11 (the backup's own clip paths) and `GET /api/cg/license`;
and `GET /api/v1/system/version` (no token). CG Control's sign-in offers the `cg-bridge` account for an
engine whose version is `2.9.4` or newer, as your §3 advises, and `cg-admin` otherwise; any account a station
admin types is used.

**A backup problem never stops the primary.** A backup engine that is unreachable, not licensed for CG, or
not signed in is said — on every console beside `BACKUP B`, in `/health` (`playout.backup.state`, problem
`backup-engine`) — and refuses nothing on the primary, clears nothing and changes nothing sent to server A.

**Never a second sender — the guard.** No engine publishes whether it is a primary or a backup, so CG Bridge
asks its neighbour: at start, when server B connects and every 15 s it reads `GET /health` of a CG Bridge at
server B's machine, on its own control port. If one answers that drives server B's core (a
`casparcg.servers` row naming that core, with a channel in `casparcg.channels`), this CG Bridge sends that
core **nothing** — no line, no failover onto it — and says so (`core-held`). A CG Bridge in first-run drives
no channel and holds nobody. The same read of server A's machine only says it (`core-shared`); the primary is
never held.

## 4. What CG Bridge guarantees

| Your rule      | What CG Bridge does                                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1              | The service depends on nothing.                                                                                                                                                                                                                                                                                                          |
| 2              | Start order does not matter: a refused `5250` is retried until the core answers.                                                                                                                                                                                                                                                         |
| 3              | After a core restart it reconnects, sends `OSC SUBSCRIBE` again and says which rows went off air (§6).                                                                                                                                                                                                                                   |
| 4              | AMCP goes to `127.0.0.1` over IPv4, never `::1`. We never ask you to put `127.0.0.1` in your allow list.                                                                                                                                                                                                                                 |
| 5              | Our send guard is the only fence: layers 50–99 only; no channel-wide `CLEAR`, no `MIXER <ch> CLEAR`, no `SET MODE`, no consumer `ADD`/`REMOVE`. We never send `X-Apasai-Mirrored`. On the backup core a second guard admits only its mirror channels in force (§3).                                                                      |
| 6              | D4, D9, D10 and D11 use the same `iss`/`aud` per engine; no request carries `Origin`. Rate: D4 at most once per 5 s, D9 at most once per 60 s, D10 and D11 every 30 s, D2 once per token lifetime, `/api/v1/system/version` (no token) at most once per 60 s — per engine, far under 600 a minute.                                       |
| 7              | We never bind `127.0.0.1:6250`. Our OSC port is `6251` (`6252` for a backup), asked for with `OSC SUBSCRIBE <port>` after every connect, filtered to the channels this station serves.                                                                                                                                                   |
| 8              | Consoles post D1 themselves, from CG Control's own process, with no `Origin`. CG Bridge keeps its own session on each engine (§3); each rotating refresh token is written to disk before it is used; a password is never stored. A lost session shows `CG Bridge needs a station admin to sign in`, naming the engine.                   |
| 8 (`2.9.2` §8) | Refreshes are serial and never shared between processes. A "refresh in flight" mark is written before each D2 and cleared with the successor. A mark found at start, or an outcome not known (a timeout, a dropped connection), means the old token is never sent again: the station shows `CG Bridge needs a station admin to sign in`. |
| 9              | A loopback `casparHost` means the machine of the Playout that listed it — in D4 and in a token's `cg_channels` alike (tested for a backup, and for CG Bridge on a separate server). So a separate server needs no `CasparHostOverride`. Confirmed by you (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §5).                                |
| 10             | The backup is declared in CG Control and kept across restarts; its OSC arrives through its own subscription; CG Bridge signs in on it with its own account; every line reaches it on its own mirror channel, from its own D4 (§3).                                                                                                       |
| 11             | A take on a channel your D4 marks `unlicensed` is refused before anything is sent, with the reason.                                                                                                                                                                                                                                      |
| 12             | Ports `5280` and `7911`. A new template version is served at a new URL, with cache headers. Reserved ranges are checked at start and never worked around.                                                                                                                                                                                |
| 13             | `/health` as in §1.                                                                                                                                                                                                                                                                                                                      |
| 14             | The installer is built to be chained: silent, offline, exit codes, the uninstall line above, and the Installed-apps entry as §2 guarantees it.                                                                                                                                                                                           |

**D2's outcomes, as your `PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §4 gives them — on each engine's session:**

| D2 answer                                     | The refresh token | What CG Bridge does                                                                                            |
| --------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `400`, `415`                                  | kept              | Refused before it was spent; tried again later                                                                 |
| `403` (`cg_not_licensed`, `no_cg_access`)     | kept              | Your `message` shown as it is; tried again about every 60 s — never a lost session                             |
| `404` (CG Control off on this Playout), `429` | kept              | Tried again later                                                                                              |
| `401`                                         | discarded         | A spent, unknown, expired or revoked token — **or a disabled or deleted user**: a station admin signs in again |
| `5xx`, a timeout, a dropped connection        | never sent again  | Not known whether it was spent: a station admin signs in again                                                 |

D2 never returns `423` (only D1 does). At D1 the same: your `message` is shown in one line, and the form is
kept. **Corrected from `0.11.1`:** that document said a disabled user at D2 was refused before the token was
used, so CG Bridge would keep it. It is not: a disabled user is `401`, CG Bridge discards the token, and a
station admin signs in again once the user is enabled. That is safe, and it is what CG Bridge does.

## 5. Versions

- CG Bridge, CG Control and CG Designer carry ONE version per release (`0.11.3`).
- CG Bridge reads each engine's version from `GET /api/v1/system/version` (your §3.1; no token, so no
  `Authorization` header): at start, then at most once a minute. CG Control shows the primary's under
  `Versions` in its connection check. An answer that is missing or not a version is said as "not served" and
  refuses nothing.
- A console and CG Bridge must share `major.minor`. On a mismatch the console shows one line — CG
  Control's version, CG Bridge's, and "Install the same release of both" — and sends nothing but its
  sign-in. A patch release (`0.11.x`) never breaks that; a `0.10` console or bridge meets a `0.11` one only
  with that line.
- **Every release is a new file with a new SHA-256.** Your build checks our file's name and hash before it
  compiles (your §2), so **each CG Bridge release needs a new engine installer build from you**; we send the
  file and its hash with each release.
- **Our version only grows**, `major.minor.patch` compared number by number. Your installer leaves an
  installed CG Bridge alone when it is the same version or newer, or its version cannot be read — so a
  station that installed a newer CG Bridge by hand keeps it, a CG Bridge is never downgraded, and an engine
  upgrade never restarts our service for nothing. A station that should have the newer CG Bridge gets it by
  running our installer.
- `0.11.3` is the compatibility floor — the first release a station installs (`0.11.2` and earlier were never
  installed at a station, and are superseded: with a backup engine they write the backup core on the primary's
  channel numbers; your `2.9.5` carries `0.11.2` and needs `0.11.3` in its place): every later release opens what `0.11.3` wrote — the configuration, the state, the template
  packages. `0.11.3` reads what `0.11.2` wrote unchanged, and adds only the backup channel entries' file.
- `/health.version` always names the running version.

## 6. Where we differ from your letter

Your letter (`PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md` §1) says that after a core restart the bridge
should reconnect, **put its layers back**, and subscribe again. CG Bridge does the first and the last.
It does **not** put layers back by itself. This is the owner's decision (**detect and say**), and it
stands — and you accepted it (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §5). After a restart CG Bridge reads
each channel, and every console shows which rows went off air and offers **PUT BACK ON AIR**. An operator
decides; nothing goes back on air by itself. A graphic that returns unasked after a crash can be the wrong
graphic at the wrong moment, and nothing may reach air without a take.

## 7. D2 re-sends

Your §4 says one re-send of a D2 is safe only within 10 s of the first. CG Bridge does not re-send at all
today: an outcome not known is never sent again, and a station admin signs in. A single re-send inside that
window is filed on our side and not built.
