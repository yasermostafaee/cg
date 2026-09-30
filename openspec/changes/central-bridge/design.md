# central-bridge — design

`CENTRAL-BRIDGE-01` (v3). The Playout team's rules are quoted by number from
`docs/integration/playout/PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md` (their letter) and the prompt's §2.

## §0 — established first (2026-09-30, against `4b479347`)

### 0.1 The bridge today

- **Started by the shell.** `sidecar.rs` spawns `cg-bridge.exe` (the official `node.exe`, renamed) with
  `<resources>\payload\bridge\caspar-bridge.mjs --state-home %APPDATA%\CG Control --console-dir
<resources>\payload\console --console-port 5174 --template-serve-port 7911 --first-run
--exit-on-stdin-close`, stdin a pipe (the lifeline), stdout/stderr appended to
  `logs\bridge.log`; readiness is `GET http://127.0.0.1:5174/__cg/health` answering `app:
"cg-caspar-bridge"` within 40 s; the window then navigates to `http://127.0.0.1:5174/`. Stop: drop
  stdin, 6 s grace, `TerminateProcess`. After start nothing watches the bridge: a crash is not restarted.
- **State** — `%APPDATA%\CG Control\.cg-runtime\`: `bridge-connection.json`, `bridge-fixed-layers.json`,
  `bridge-reserved-layers.json` (read only), `bridge-templates\` (one record per version,
  `template-channels.json`, `delimiters.json`, `channel-settings.json`), `bridge-source-catalog.json`,
  `bridge-source-assignments.json`, `bridge-playout-inputs.json`, `bridge-bound-media.json`,
  `bridge-live-layers.json` (the ledger), `bridge-audit.ndjson` (append-only, no rotation),
  `bridge-playout.json` (the Playout address and the adopted issuer). Logs: `logs\bridge.log` (+ one
  previous), `logs\amcp.log` (5 MB, + one previous), `logs\shell.log`. **Not persisted:** the stack (the
  Reconciler), the lock and its PIN, rehearsal, the pending update, removal tombstones, the emptied-air
  notice.
- **Ports** — TCP `5174` (the console page, `/__cg/health`, `/pgm/<n>` to loopback peers; loopback only);
  TCP `5280` (the control WebSocket; `127.0.0.1` by default — the shell passes no `--host`); TCP `7911`
  (templates; `127.0.0.1` unless a configured CasparCG host is remote, then `0.0.0.0`); UDP OSC — one
  socket per declared server, A on `6250` and B on `6251` by default, bound `127.0.0.1` for a loopback
  server else `0.0.0.0`. **Nothing sends `OSC SUBSCRIBE`**: the bridge relied on the core's default
  per-client subscription to `<client>:6250`. **A failed OSC bind ended the session loop before AMCP was
  dialled, silently** (`B-295`).
- **Kept per console vs shared.** Per socket: the principal (`AuthSession`) and the per-socket
  `channels.changed`. Shared, single: one stack, one lock, one issuer, one template store, one ledger —
  and one process-wide Playout **bearer** borrowed from whichever console's token the gate saw last,
  used for D9, D4, D10 and D11.

### 0.2 The console's own state

The persisted-key census (`apps/runtime/tests/persistedKeyCensus.test.ts`) is the inventory. **Shared
truth kept in the browser (must move):** OPFS `runtime/library/*.json` (every imported template's page)
and `runtime/stack/retained.json` (the stack intent), both re-delivered on every connect
(`WebSocketRuntime.#resync`); a re-delivery naming a channel REPLACED a different version the bridge held
(local-wins), and removal tombstones lived only as long as the bridge process (`B-294`). **Per console
(stays):** `cg.runtime.playoutSession` (the console's own tokens), `cg.runtime.shell-layout.v1`,
`cg.runtime.foreign-notice.dismissed.v1`, `cg.runtime.testMode`, `CG_RUNTIME_SESSION`, the IndexedDB
from-file handles (a handle to a file on that PC).

### 0.3 Sign-in today

D1 and D2 are `fetch`es from the webview's JavaScript (`playoutSession.ts`), so the browser sends
`Origin: http://127.0.0.1:5174` and the Playout's CORS list must hold it. The refresh token stays in the
console's localStorage; the bridge sees only the access token, in the socket's `auth` frame. The bridge
verifies it offline (ES256 against the JWKS, `iss`, `aud`, claims, D9). AMCP approval: at boot with auth
ON the bridge sets "AMCP awaits sign-in"; the first acceptance in the process of a `station-admin` token
reads D9 once with that token (the introducing read) and retries AMCP promptly for 30 s. D4/D9/D10/D11
use the borrowed bearer. Every bridge → Playout request goes through `playoutFetch`, which deletes any
`Origin` and ignores environment proxies — except the connection check's CORS probe, which sends the
console's origin on purpose. `X-Apasai-Mirrored` appears nowhere.

### 0.4 The control socket

Frames: `request`/`response`/`publish` and `auth`. ~95 request channels, ~25 publish channels
(`wirePublishes`). Auth ON: a socket that never signed in gets `bridge.capabilities`, `auth.*` and
`setup.check` only, and no publish; an expired or revoked socket still gets read routes and every publish.
**No `Origin` check** (`B-262`), no peer address read, nothing trusted from the console but the verified
JWT (the wire `actor` is ignored). **No version number:** the handshake compares channel lists and only
reports skew. State reaches the console by push (`useBridgeSnapshot`); the whole stack is pushed to every
signed-in socket, unfiltered by channel.

### 0.5 Console features that assume the bridge is on the same machine

| Feature                  | Today                                                                                   | In `0.10.0`                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Open log folder          | `open_bridge_log` → Explorer on the local `bridge.log`                                  | **Download logs**: an admin console saves one zip from the bridge (`GET /logs.zip`, bearer)            |
| `set_playout_address`    | a local CLI one-shot writes `bridge-playout.json`, then the local sidecar restarts      | gone: the console keeps its Playout address itself; the bridge's comes from its service config         |
| Splash `STARTING BRIDGE` | the shell spawns the sidecar and polls `5174`                                           | the console is bundled; its splash says `CONNECTING`                                                   |
| Restart notice           | state on the bridge, pushed; depends on OSC within the resync drain                     | unchanged for the console; `OSC SUBSCRIBE` goes in the handshake so OSC is there in time               |
| PVW page                 | `templates.page` over the socket (no co-location)                                       | unchanged; the browser's display copy answers only when the bridge cannot be reached (D5, as built)    |
| Template import          | the console renders the `.vcg` into a page and sends `templates.import` over the socket | unchanged transfer (an upload over the socket, 64 MB frames); refused offline; display copy after (D5) |
| PROGRAM monitor          | `<img src="/pgm/<n>">` on the console's origin, loopback peers only                     | `http://<bridge>:5280/pgm/<n>?ticket=…` — a ticket issued over the verified socket                     |
| Connection check         | "UDP 6250 belongs to the engine here, so CG Control belongs on a separate machine"      | the bridge BELONGS on the Playout machine: the line and its ports move to the bridge's own checks      |

### 0.6 A Windows service for `cg-bridge.exe`

Measured and cited by the survey (sources in the report): **WinSW** v2.12.0 (MIT) needs .NET Framework
4.6.1+ and documents no virtual account; v3 is alpha since 2023. **NSSM** 2.24 (2014) needs a 2017
pre-release on Windows 10 1703+ and is flagged by some antivirus products. **node-windows** bundles a 2017
WinSW. **Shawl** v1.9.0 (MIT, 2026-05, on Mullvad's `windows-service` crate) runs any command as a
service, sends it Ctrl+C on stop and kills it after `--stop-timeout`, supports `--no-restart` (so the
SCM's recovery owns restarts), `--cwd`, `--log-dir`, `--log-cmd-as`, `--log-rotate`, `--log-retain` and
`--kill-process-tree` (`docs/cli.md` at `v1.9.0`). **Chosen: Shawl 1.9.0, built from its crates.io source
in CI** (`cargo install shawl --version 1.9.0 --locked`) — no .NET, no binary trusted blind, nothing
downloaded at install time; its MIT licence ships beside it.

- **Stop is graceful:** Shawl's Ctrl+C reaches Node as `SIGINT`; the bridge's CLI handles `SIGINT` and
  `SIGBREAK` exactly as its stdin-lifeline shutdown (it persists every store as it goes, so a kill loses
  nothing written). `--stop-timeout 15000` fits the ~20 s a service gets at OS shutdown.
- **Recovery:** `sc.exe failure CGBridge reset= 86400 actions= restart/5000/restart/5000/restart/30000`
  and `sc.exe failureflag CGBridge 1` (a stop with a non-zero exit code counts as a failure). Shawl runs
  with `--no-restart`, so a crashed bridge ends the service with its exit code and the SCM restarts it.
- **Account: `NT SERVICE\CGBridge`, a virtual account** — no password, its own SID (an ACL granted to it
  covers no other service, unlike `LocalService`/`NetworkService`), the computer account on the network,
  not `LocalSystem` (the Playout's own engine runs as `LocalSystem`; the letter allows any account).
  Windows has no privileged ports (measured: a medium-integrity process binds TCP/UDP below 1024), so it
  binds `5280`, `7911` and `6251`. It cannot write `%ProgramData%` by default (Users get read and
  create-folder; measured), so the installer grants `(OI)(CI)M` on `%ProgramData%\CG Bridge` — **after**
  creating the service (the grant fails with 1789 before the virtual account exists; measured).
- **No dependency** (`sc create … depend=` is never passed) — the Playout's installer stops
  `ApasaiEngine` without checking, and Windows refuses to stop a service with a running dependent (rule 1).

### 0.7 Backup Playout today

A backup core is `servers.B`, declared by hand (Station setup → Add backup server, or the CLI), with its
own session and OSC socket; the `RedundancyAdapter` mirrors every line to both (`mirror-sync`), except the
Playout `route://` lines. The bridge knows ONE Playout: one D4 reader, whose loopback rule maps
`127.0.0.1`/`::1`/`localhost` to the host of the Playout it read (`resolveCasparHost`,
`playout-catalogue.ts`). A backup Playout's own D4 is never read, and a backup's media paths are the
primary's (`B-286`, open).

### 0.8 `OSC SUBSCRIBE` in upstream CasparCG 2.5.0

**It exists** (added in 2.4.0, `CHANGELOG.md`): `AMCPCommandsImpl.cpp` at `v2.5.0-stable` (commit
`69e8ad5`, the plant's `2.5.0 69e8ad5 Stable`) registers `OSC SUBSCRIBE` and `OSC UNSUBSCRIBE` at lines
1794–1795; `osc_subscribe_command` (1684–1701) parses the port (`403 OSC SUBSCRIBE BAD PORT` if it is not a
number), subscribes `<the connection's remote IPv4>:<port>` (`client->address()`), stores the token on the
connection under `osc-sub-<port>` — so it ends with the connection — and answers `202 OSC SUBSCRIBE OK`.
No channel filter: every bundle goes to every endpoint (`osc/client.cpp`). The core's DEFAULT per-client
subscription (`server.cpp` `setup_osc`, 306–342) sends to `<client IPv4>:<default-port 6250>` unless
`disable-send-to-amcp-clients` is set — and is `post`ed after the acceptor opens, so a connection accepted
in that window gets none; an explicit subscribe avoids the race. **So one method everywhere**: the bridge
subscribes on every core — the Playout's, the owner's own (`--caspar`), the mock — and nothing keeps
"today's method" as a fallback path; a core that refused the command would be reported and the session
would hear whatever the core sends it by default.

## Decisions

### D1 — CG Bridge is `node.exe` + the bundle, run by Shawl as the service `CGBridge`

The same sidecar the shell ran (ADR 0011 decision 3: the official Node, one ESM bundle), now under Shawl.
Installed per machine to `%ProgramFiles%\CG Bridge\` by its own NSIS installer, built by `makensis` from a
script in the repo (`tools/bridge-installer/cg-bridge.nsi`) — not a Tauri app: it has no window.

### D2 — configuration: one JSON file, with command-line overrides

`%ProgramData%\CG Bridge\cg-bridge.json` — `{ playoutAddress, amcpHost?, amcpPort?, oscPort, controlPort,
templatePort, bridgeAddress? }` — written by the installer from its arguments (`/PLAYOUT=`, `/AMCPHOST=`,
`/AMCPPORT=`, `/OSCPORT=`, `/CONTROLPORT=`, `/TEMPLATEPORT=`) and read by the bridge's `--service-config
<file>`; every existing CLI flag still overrides it. Defaults: Playout `http://127.0.0.1:8080` (the bridge
on the Playout machine), OSC `6251`, control `5280`, templates `7911`. **`6250` is refused** as an OSC port
by the schema, the CLI and the installer. A missing or unreadable file is a start failure that says which
file and why — a service never falls back to `~/.cg-runtime`.

### D3 — auth is always ON in CG Bridge; every connection proves itself

A service config always names a Playout, so CG Bridge never runs with auth OFF (the dev bridge still may:
`pnpm dev` without a Playout). The socket's only doors before a verified token are `bridge.capabilities`
(which now carries `bridgeVersion` and no state) and `auth`. `setup.check` leaves the pre-sign-in set: the
console reaches the Playout itself now, so a check needs a principal. **An expired or revoked token is
treated like none** — no read route, no publish — amending ADR 0010 rule 4's "reads keep answering"
(the prompt: "an expired token → refused"); the socket still stays open, and a fresh token restores
everything at once. `Origin` is not read (`B-262` closed on the token, not on a header).

### D4 — the state a socket is told is scoped to its token's channels

One projection per publish and per read route that carries channel-scoped data — the stack, the banks and
their per-slot state, the ledger and media state, the playout layers, orphans, cleared-outside, owned
occupancy, the emptied-air notice, strays, rehearse, the pending update, the per-channel template lists,
channel settings, source assignments, the PGM status. A route or publish that is station-wide (health, the
server list, delimiters, the source catalogue, the lock) passes unchanged. One module owns the table, and a
coverage test asserts every publish channel and every read route is classified, the way `B-247` and
`B-074` guard their lists. `"*"` holds every channel.

**As built (4.2), and where it differs from the list above:** the banks, channel settings, the per-channel
template lists and the source assignments are told WHOLE, as configuration. A survey of the console
before building showed why each would break if narrowed: `multiChannel = banks.length > 1` decides whether
a bulk verb carries its channel, so a console told one bank would send Clear All with no channel; the Layers
set-banks and the source set-assignments writes are built from what the console holds, so a narrowed read
would drop the other channels on write; and none of them is what is on another channel's air. What IS
narrowed is everything that says what is on a channel, plus the audit rows (`channel-scope.ts`, whose header
lists it). Three consequences, each handled rather than left: the restart notice now carries each dropped
seat's channel (`seatChannels`), so its seat count narrows with its rows; a dismissal of the notice or of the
restore report reaches only what the dismissing console was told (the console offers DISMISS on the part it
holds, and the bridge keeps the rest for the console that holds it); and a channel shown READ ONLY because the
sign-in does not hold it — `R-066` bullet 3's tab, kept — says `This channel is not in your sign-in.` where
its rows would otherwise read EMPTY. A console's own IndexedDB file attachments for rows it can no longer see
are pruned by its housekeeping as for any removed row; they are that browser's, never the bridge's.

### D5 — one store, on the bridge

The bridge persists its stack (`bridge-stack.json`, the `RetainedStackItem` shape the console used to
keep, written atomically on every stack change) and restores it at start through the same `restore()` it
ran for a console, before its control socket listens. The console's re-delivery of templates and of its
stack is removed, and so is `stack.restore` from the IPC contract; a `templates.import` marked
`redelivery` is refused before every gate with its own sentence and no audit row (only a console older
than this change sends one — the version check turns it away first). The redelivery machinery on the
bridge goes with it: the `resync` and `operator-unless-redelivery` lock classes, the removal tombstones,
`templateRedeliveryChange`.

**As built (3.2), and where it differs from the first draft of this decision:** the console KEEPS its two
browser stores, as DISPLAY copies only — never sent. Two living requirements need them ("The stack is
visible while the bridge is unreachable", and the Library's offline view), and PVW falls back to the
browser's page only when the bridge cannot be reached (`B-288`). An import and a removal need the bridge;
offline each is refused with a sentence, and the display copy follows what the bridge accepted. The
restore's report (`B-108`) is standing bridge state — `stack.restore-report`, its push and a dismissal
that clears it for every console, optionally for one channel — because no console makes the restore call
any more. The field list that reduces a row to its retained record lives once, in `@cg/shared-schema`
(`retainedFromStackItem`): the bridge's file and the console's display copy both use it.

Template versions: every new version is served at `<templateId>~<versionId>` for life, and the page
carries `Cache-Control: no-store` (`B-293`).

### D6 — the start check (rule 3 and the prompt's §A)

At the first connection after the bridge starts, one `INFO <ch>` per declared channel (`B-292`'s reader;
the answer is the whole channel), read INSIDE that connection's handshake (`ServerSession` `onHandshake`,
before `healthy`, so no take can overtake it — a first spelling read after `healthy` and reset a take made
in between), decides every restored row and every ledger entry, instead of the OSC tap alone: a layer holding our producer → adopted; an on-air row or ledger seat whose layer is empty →
off air, with the restart notice (`EmptiedAirNotice`, cause "the bridge restarted and the layer is
empty"), **nothing sent**; a `loaded` row whose layer is empty → stays `loaded`, not resident, so the next
take re-ADDs (no automatic `CG ADD`); an occupied layer in 50–99 no entry holds → the leftover strip. A
restore's automatic re-ADD onto an empty layer (`#decidePendingRestores`) is gone for the same reason.

### D7 — the bridge's own Playout session (rule 8)

`bridge-session.json` holds `{ refreshToken, sub, name, obtainedAt }`, never a password, written with
`tmp → fsync → rename` BEFORE the token it holds is used. At start the bridge refreshes (D2) with it and
persists the rotated token before using the access token; a `401` means the session is lost →
`bridgeSession.state: 'needs-admin'` → every console's line `CG Bridge needs a station admin to sign in`.
A station admin gives the `cg-admin` password once, from any console (`bridgeSession.sign-in`, admin-only,
over the verified socket); the bridge calls D1 itself, keeps the refresh token, drops the password. The
bridge's access token is the bearer for D4, D9, D10 and D11 (the borrowed console bearer is gone), and is
refreshed 10 min before `exp` and on a `401`. Every request: no `Origin`, no `X-Apasai-Mirrored`, ≤ 600/min
shared per IP (D4 every 5 s, D9 every 60 s, D10 every 30 s is ~26/min).

**As built (5.1/5.2), and where it differs from the paragraph above:** (1) the borrowed console bearer is
NOT gone — it is the FALLBACK while the bridge has no session (a fresh install before an admin signs it in,
or after the Playout refused the saved token), so a station never loses its catalogue, sources or
revocation list over the needs-admin line; the bridge's own bearer is always preferred
(`PlayoutAuth.useOwnBearer`). (2) The session file is named by `--bridge-session-path` with NO default: a
development bridge must not start saying `CG Bridge needs a station admin to sign in`; the service
configuration names it (6.1). (3) Refresh is scheduled 10 min before `exp`, and an unanswered refresh is
retried every 30 s with the token kept; the refresh ON a `401` from another read is not built (every
reader swallows a `401` by design, ADR 0010 rule 5) — the scheduled refresh covers a token's ordinary life,
and a revoked one is refused at its next refresh. (4) A save that fails keeps the session for THIS process
and says, in the log, that a restart will need an admin. (5) D1/D2 live once in `@cg/shared-ipc`; the
console re-exports them. (6) `playoutFetch` had never sent a request body — every call before this was a
GET — so the bridge's D1 reached the Playout empty; it now sends a text body with its length and refuses
any other kind.

### D8 — the console: bundled, native sign-in, the bridge found from the Playout address

CG Control's window loads the console from the app itself (`http://tauri.localhost`, a secure context).
The console keeps the Playout address (typed at first run) and an optional bridge address (Station setup,
admin) in localStorage (`cg.runtime.station.v1`). Bridge URL: the override, else `ws://<Playout host>:5280`.
Sign-in: `playout_sign_in` / `playout_refresh` Tauri commands (Rust, `ureq`, no `Origin` header) inside CG
Control; `fetch` in a browser (dev, where the fake Playout allows any origin). The version check compares
`major.minor` of the console (`__APP_VERSION__`) and `bridge.capabilities.bridgeVersion`: a mismatch is one
line naming both versions, and `WebSocketRuntime` refuses every request but `auth` and
`bridge.capabilities` locally, so nothing is sent. The installer becomes per-user, with no firewall rule.

### D9 — transport: plain WebSocket over HTTP on `5280`

The Playout's own API offers HTTP `8080` and HTTPS `8443`; every console already signs in over `8080`, so the
same token already crosses the station network in clear. A TLS listener needs a certificate the client does
not have and a trust decision per console — filed as `P-062`. `/health`, `/pgm/<n>` and `/logs.zip` are
served on the same port as the WebSocket (one `http.Server`, the upgrade on the same socket).

### D10 — `/health` (rule 13), fixed and documented

`GET /health` — no authentication, no secret, answered from memory (no I/O on the request path). Shape in
`docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md` §1 and pinned by a schema test:
`{ app: "cg-bridge", version, startedAt, uptimeS, casparcg: { state, servers: [{ label, host, amcpPort,
amcp, osc }] }, playout: { address, session, lastReadAt }, consoles, ports: { control, templates, osc },
problems: [...] }`.

### D11 — reserved Windows port ranges (rule 12)

At start the bridge runs `netsh interface ipv4 show excludedportrange protocol=tcp` and `protocol=udp` and
parses the rows (`^\s*(\d+)\s+(\d+)`, the header is localized); a control, template or OSC port inside a
range is one log line and one `/health` problem naming the port and the range; a bind that fails with
`EACCES` is reported the same way (WSL can reserve ports netsh does not list). The installer runs the same
check (`cg-bridge.exe … --check-ports`) and warns. Ports are never changed by themselves.

### D12 — unlicensed (rule 11)

`isUnlicensedChannel(row)` — one predicate over D4's `playlist`, shared by the take refusal and the channel
line. A take on such a channel is refused before any AMCP with `CH <n> is unlicensed in the Playout: it
clears this channel every minute — nothing was sent.`; clears and removals pass.

### D13 — backup (rules 9–10)

The D4 loopback rule stays per reader: a reader constructed for a Playout at host H maps a loopback
`casparHost` to H — pinned by a test for a backup's address. `0.10.0` reads the primary's D4 only; the
backup core is declared in Station setup as before, its OSC arrives through its own `OSC SUBSCRIBE` at
`<primary's IP>:<its port>` (the installer's UDP rule covers both sessions' ports), and the Playout's admin
adds the primary's IP to the backup's AMCP allow list. A standby bridge is `R-079`.

### D14 — OSC ports

The bridge-wide OSC port (config `oscPort`, default `6251`) is server A's; server B's is `oscPort + 1`. The
per-server `oscPort` field stays in the connection schema (it is what each session binds) but `6250` is
refused there. Every session subscribes; foreign channels are dropped at the transport
(`setServedChannels`: the declared channels, or every channel while none is declared).

## Risks

- **Native code is built only in CI** (no Rust and no NSIS on the dev host): the service host, CG Control's
  shell and both installers are exercised by the clean-Windows smoke, not locally.
- **The Playout's apasai-core fork** is not upstream: whether it keeps `OSC SUBSCRIBE` is unverified until
  the `.111` run; a refusal is reported and the session falls back to what the core sends by default.
- **Refresh-token binding:** whether the Playout ties a refresh token to an IP is not documented; the bridge
  signs in itself (D7) so the token is always used from the address that obtained it.
