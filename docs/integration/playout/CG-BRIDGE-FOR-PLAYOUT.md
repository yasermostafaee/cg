# CG Bridge — for the Playout team

Release `0.10.0` (`CENTRAL-BRIDGE-01`, 2026-09-30). **One CG Bridge per Playout.** CG Bridge is a
Windows service on the Playout machine, or on a server beside it. Every CG Control is a console that
connects to it; a console never talks to CasparCG. This document is what your engine and your installer
need from us, and what we promise. It answers your letter (`PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md`) and
the `2.9.2` licence letter (`PLAYOUT-CG-RESPONSE-LICENSE-v1.md` §2, §8, §9).

## 1. `GET /health`

`http://127.0.0.1:5280/health` — on CG Bridge's control port (`5280` unless configured otherwise), the
same port the consoles use.

- **No authentication, no secret.** No token, no password, no account name. The Playout address and the
  station's hosts and ports are in it; they are not secrets.
- **Under one second.** It is built from what the bridge already holds; the request does no I/O.
- **While CG Bridge is starting** (the instant between its port opening and its state being ready):
  `503`, body `CG Bridge is starting`, header `Retry-After: 1`. After that, always `200`,
  `Content-Type: application/json`, `Cache-Control: no-store`.
- Any other plain HTTP request on that port answers `426` (the port is the consoles' WebSocket).

**The shape is fixed.** A field is added only with a line in this section, and none is renamed or removed
without a version we tell you about. Our schema test refuses any field not listed here.

| Field                                           | Meaning                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `app`                                           | Always `"cg-bridge"` — how a reader knows it asked CG Bridge                                       |
| `version`                                       | CG Bridge's version, `major.minor.patch`                                                           |
| `startedAt`                                     | When this process started (ISO 8601, UTC)                                                          |
| `uptimeS`                                       | Seconds since then                                                                                 |
| `casparcg.state`                                | The primary: `up` (commands land, OSC heard), `degraded` (commands land, OSC silent), `down`       |
| `casparcg.servers[]`                            | One row per declared server                                                                        |
| `casparcg.servers[].label`                      | `A` (declared first) or `B` (backup)                                                               |
| `casparcg.servers[].role`                       | The role NOW — after a failover `B` is `primary`                                                   |
| `casparcg.servers[].host`, `.amcpPort`          | Where CG Bridge sends AMCP                                                                         |
| `casparcg.servers[].amcp`                       | `up`, `connecting` or `down`                                                                       |
| `casparcg.servers[].osc`                        | `subscribed` (our `OSC SUBSCRIBE` accepted), `refused`, `unbound` (our OSC port not bound), `none` |
| `casparcg.servers[].oscHeardAt`                 | When OSC was last heard from it (ISO 8601), or `null`                                              |
| `playout.address`                               | The Playout CG Bridge reads (D4, D9, D10, D11), or `null`                                          |
| `playout.session`                               | CG Bridge's own Playout session: `off`, `waiting`, `needs-admin`, `signed-in`, `refused`           |
| `playout.lastReadAt`                            | The last good D4 read (ISO 8601), or `null`                                                        |
| `consoles`                                      | Console connections open now, signed in or not                                                     |
| `ports.control`, `ports.templates`, `ports.osc` | The ports in force                                                                                 |
| `problems[]`                                    | What stops CG Bridge working, in words; empty when nothing does                                    |
| `problems[].code`                               | `reserved-port`, `port-refused`, `osc-unbound` or `playout-session`                                |
| `problems[].message`                            | One English sentence, e.g. `CG Bridge needs a station admin to sign in`                            |

Example (a fresh install, no CasparCG yet, no station-admin sign-in yet):

```json
{
  "app": "cg-bridge",
  "version": "0.10.0",
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
        "oscHeardAt": null
      }
    ]
  },
  "playout": { "address": "http://127.0.0.1:8080", "session": "needs-admin", "lastReadAt": null },
  "consoles": 0,
  "ports": { "control": 5280, "templates": 7911, "osc": 6251 },
  "problems": [
    { "code": "playout-session", "message": "CG Bridge needs a station admin to sign in" }
  ]
}
```

## 2. The installer

**File:** `CG-Bridge_<version>_x64-setup.exe`. NSIS, per machine, 64-bit Windows only (on 32-bit
Windows it exits `2`). It asks for administrator rights. **Size:** about 22.5 MB — 23,616,613 bytes for
the last CI build (the release lists the exact size of `0.10.0`'s). It carries everything: the official
`node.exe` (as `cg-bridge.exe`), the service host Shawl 1.9.0 (MIT), our bridge as one file, and the
licences. **Nothing is downloaded during an install.**

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
- **On a server beside the Playout:** `/PLAYOUT=http://<Playout IP>:8080 /AMCPHOST=<Playout IP>
/BRIDGEADDRESS=<this server's IP>`. `/BRIDGEADDRESS` is the address CasparCG fetches template pages
  from.
- `/OSCPORT=6250` is refused: that port is yours.
- From Inno Setup: `Exec(ExpandConstant('{tmp}\CG-Bridge_0.10.0_x64-setup.exe'), '/S', '', SW_HIDE,
ewWaitUntilTerminated, ResultCode)`.

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
10. Writes the Installed-apps entry (`CG Bridge`, publisher APASAI).

Every step is logged, with its exit code and output, to `%ProgramData%\CG Bridge\logs\install.log`.

### The service

- Name `CGBridge`, display name `CG Bridge`, run by Shawl as `NT SERVICE\CGBridge` (its own account).
- Start: **automatic**. **No service dependency** — never on `ApasaiEngine` (your rule 1).
- Recovery: restart after 5 s, 5 s, then 30 s; the count resets after a day; a failed exit counts as a
  failure. An administrator's stop stays a stop.
- Stop: Ctrl+C to the bridge, 10 s to finish, then the process tree is ended.

### Upgrade

Run the new installer (with `/S`; values optional). It stops our service, replaces the files, keeps the
configuration and the state, and starts the service. **Nothing on air is cleared by an install, an
upgrade or a service restart:** CG Bridge sends no `CLEAR` at start. After a start, CG Bridge reads each
declared channel (`INFO <ch>`): a row whose page still plays is adopted; a row whose layer is empty is
reported off air (§5).

### Configuration

`%ProgramData%\CG Bridge\cg-bridge.json`, read at every start:

| Key              | Meaning                                                      | Default            |
| ---------------- | ------------------------------------------------------------ | ------------------ |
| `playoutAddress` | The Playout's API (required)                                 | —                  |
| `amcpHost`       | CasparCG's AMCP host                                         | `127.0.0.1` (IPv4) |
| `amcpPort`       | CasparCG's AMCP port                                         | `5250`             |
| `oscPort`        | Our OSC port (server B's is `+1`); `6250` refused            | `6251`             |
| `controlPort`    | Consoles and `/health`                                       | `5280`             |
| `templatePort`   | Template pages CasparCG fetches                              | `7911`             |
| `bridgeAddress`  | The host CasparCG fetches templates from (a separate server) | this machine       |

The file is strict: an unknown key is refused, and the service then does not start; the log names the
file. To change a value, re-run the installer with it, or edit the file and restart the service. The
same values can be given on the command line (`cg-bridge.exe caspar-bridge.mjs --service-config <file>
--port …`); the command line wins.

**CG Bridge never changes a port by itself.** At start it reads Windows' reserved port ranges
(`netsh interface ipv4 show excludedportrange`): a port of ours inside one is one line in the log and a
`reserved-port` problem in `/health`, and the installer warns.

### Data, logs and permissions

`%ProgramData%\CG Bridge\`:

- `cg-bridge.json` — the configuration;
- `.cg-runtime\` — the state (the stack, the layer ledger, the templates, the channels declared, and
  `bridge-session.json`: CG Bridge's own Playout session — a refresh token, never a password);
- `logs\` — `install.log`, `uninstall.log`, the service's output (daily, 14 days kept) and `amcp.log`
  (every AMCP command, its reply and its time; 5 MB, then one previous file). A station admin downloads
  them all as one zip from any CG Control (Audit log → `Download logs`).

Permissions: inheritance off; SYSTEM and Administrators full control; `NT SERVICE\CGBridge` modify; **no
ordinary user can read the folder**, because it holds the bridge's session.

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

## 3. What CG Bridge guarantees

| Your rule      | What CG Bridge does                                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1              | The service depends on nothing.                                                                                                                                                                                                                                                                                                          |
| 2              | Start order does not matter: a refused `5250` is retried until the core answers.                                                                                                                                                                                                                                                         |
| 3              | After a core restart it reconnects, sends `OSC SUBSCRIBE` again and says which rows went off air (§5).                                                                                                                                                                                                                                   |
| 4              | AMCP goes to `127.0.0.1` over IPv4, never `::1`. We never ask you to put `127.0.0.1` in your allow list.                                                                                                                                                                                                                                 |
| 5              | Our send guard is the only fence: layers 50–99 only; no channel-wide `CLEAR`, no `MIXER <ch> CLEAR`, no `SET MODE`, no consumer `ADD`/`REMOVE`. We never send `X-Apasai-Mirrored`.                                                                                                                                                       |
| 6              | D4, D9, D10 and D11 use the same `iss`/`aud`; no request carries `Origin`. Rate: D4 at most once per 5 s, D9 at most once per 60 s, D10 and D11 every 30 s, D2 once per token lifetime — far under 600 a minute.                                                                                                                         |
| 7              | We never bind `127.0.0.1:6250`. Our OSC port is `6251` (`6252` for a backup), asked for with `OSC SUBSCRIBE <port>` after every connect, filtered to the channels this station serves.                                                                                                                                                   |
| 8              | Consoles post D1 themselves, from CG Control's own process, with no `Origin`. CG Bridge keeps its own session as `cg-admin`; its rotating refresh token is written to disk before it is used; the password is never stored. A lost session shows `CG Bridge needs a station admin to sign in`.                                           |
| 8 (`2.9.2` §8) | Refreshes are serial and never shared between processes. A "refresh in flight" mark is written before each D2 and cleared with the successor. A mark found at start, or an outcome not known (a timeout, a dropped connection), means the old token is never sent again: the station shows `CG Bridge needs a station admin to sign in`. |
| 9              | A loopback `casparHost` means the machine of the Playout that listed it — in D4 and in a token's `cg_channels` alike (tested for a backup, and for CG Bridge on a separate server). So a separate server needs no `CasparHostOverride`.                                                                                                  |
| 10             | The backup is declared as before; its OSC arrives through its own subscription.                                                                                                                                                                                                                                                          |
| 11             | A take on a channel your D4 marks `unlicensed` is refused before anything is sent, with the reason.                                                                                                                                                                                                                                      |
| 12             | Ports `5280` and `7911`. A new template version is served at a new URL, with cache headers. Reserved ranges are checked at start and never worked around.                                                                                                                                                                                |
| 13             | `/health` as in §1.                                                                                                                                                                                                                                                                                                                      |
| 14             | The installer is built to be chained: silent, offline, exit codes, and the uninstall line above.                                                                                                                                                                                                                                         |

`2.9.2` §2: a `403 cg_not_licensed`, `no_cg_access` or disabled user at D2 comes before the token is
used, so CG Bridge keeps it, shows your `message` as it is, and tries again about every 60 s — never a
lost session. The same at D1: your `message` is shown in one line, and the form is kept.

## 4. Versions

- CG Bridge, CG Control and CG Designer carry ONE version per release (`0.10.0`).
- A console and CG Bridge must share `major.minor`. On a mismatch the console shows one line — CG
  Control's version, CG Bridge's, and "Install the same release of both" — and sends nothing but its
  sign-in. A patch release (`0.10.x`) never breaks that.
- `0.10.0` is the compatibility floor: every later release opens what `0.10.0` wrote — the
  configuration, the state, the template packages.
- `/health.version` always names the running version.

## 5. Where we differ from your letter

Your letter (`PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md` §1) says that after a core restart the bridge
should reconnect, **put its layers back**, and subscribe again. CG Bridge does the first and the last.
It does **not** put layers back by itself. This is the owner's decision (**detect and say**), and it
stands. After a restart CG Bridge reads each channel, and every console shows which rows went off air
and offers **PUT BACK ON AIR**. An operator decides; nothing goes back on air by itself. A graphic that
returns unasked after a crash can be the wrong graphic at the wrong moment, and nothing may reach air
without a take.

## 6. A question for you

CG Bridge reads a D2 answer as follows:

- `401` — the refresh token was used, and is gone.
- `403`, `423` and `429` — refused BEFORE the token was used, so it is kept.
- Anything else — an outcome not known, so the token is never sent again.

**Is every D2 `4xx` other than `401` refused before the token is used?** If some other status (a `400`,
say) does not consume the token, we can keep it too and avoid asking a station admin to sign in again.
