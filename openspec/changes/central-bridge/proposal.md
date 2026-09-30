# central-bridge — one bridge per Playout: CG Bridge, a Windows service; CG Control, its console (`R-067`, `R-068`)

Prompt: `CENTRAL-BRIDGE-01` (v3), 2026-09-30, adopting the Playout team's answer
`docs/integration/playout/PLAYOUT-CG-RESPONSE-BRIDGE-HOST-v1.md` (their rules 1–14 are binding). Order:
after `RELEASE-091-01` (v2) + DELTA A + DELTA B, archived at `4b479347`. `0.9.1` is never delivered; this is
`0.10.0`.

## Why

On the installed `0.9.0` station A took several templates, station B — a second install on another PC with
its own bridge — cleared them (on a multi-box page it left the boxes on air), and station A kept showing
everything ON AIR. **Each station's bridge kept its own record of what is on air, so two stations on one
channel disagreed.** The owner's decision (2026-09-29): one bridge per Playout, a Windows service on the
Playout machine (or a server beside it) that starts with the system; every CG Control connects to it and
becomes the console only; before the client delivery.

What it gives: one record of what is on air per Playout, the same on every console; nothing on air lost when
a console closes; CasparCG reading template pages from its own machine; no firewall rule on operator PCs;
the operator still types only the Playout address.

## What changes

- **CG Bridge — the service** (`R-067`). Its own per-machine installer, `CG-Bridge_<version>_x64-setup.exe`,
  installs the bridge as a Windows service: automatic start, restart on failure, **no dependency on
  `ApasaiEngine`**, a least-privilege virtual account, inbound firewall rules scoped to its own exe and named
  as ours (TCP `5280` consoles, TCP `7911` template pages, UDP `<osc port>`), an uninstaller that touches only
  our service and our rules. Configured by command line and by file (Playout address, AMCP host and port,
  OSC port — default `6251`, never `6250` — and the ports `5280`/`7911`). State and logs under
  `%ProgramData%\CG Bridge\`; an older per-user state on that machine is imported once and never deleted;
  an admin console downloads the logs as one zip. A fixed, documented `/health` (no authentication, no
  secret, under 1 s) that the Playout's own page reads. Reserved Windows port ranges are checked at start.
- **CasparCG under the Playout team's rules.** AMCP to `127.0.0.1` (IPv4) for the local core, never `::1`;
  refused connections tolerated at start and after every core restart. **OSC by `OSC SUBSCRIBE`** on the
  bridge's own port, sent after every connect, before the resync (`C-046`); the bridge never binds `6250`;
  foreign channels' OSC dropped. A core restart: reconnect, re-subscribe, the restart notice with PUT BACK
  ON AIR — nothing back on air by itself (`C-047`). **At start the ledger is checked with `INFO <ch>`**
  (`C-047`). A take on an `unlicensed` channel is refused with the reason (`C-048`). A backup Playout's
  loopback `casparHost` means the backup's host (pinned). A failed OSC bind no longer keeps AMCP down
  (`B-295`).
- **The console ↔ bridge connection** (`R-068`, `B-262`). CG Bridge listens on the network; **every
  connection must present a valid Playout token**, verified by the bridge (signature, issuer, audience,
  expiry, D9), and each command and each piece of pushed state is scoped to the token's `cg_channels`. No
  token, an expired or a revoked one: no state and no command. Plain WebSocket over HTTP, as the Playout's
  own `8080` (TLS filed, `P-062`). The bridge pushes one state to every console; two consoles on one
  channel are serialised by its seat locks (an exclusive lock filed, `R-078`); each audit row names the user
  and the console machine. The console and the bridge must share `major.minor`, else one line and no
  command.
- **One store, on the bridge** (`B-294`). The bridge persists the stack and restores it at start from its
  own file; consoles re-deliver nothing. Template URLs always carry their version, and pages are sent
  `Cache-Control: no-store` (`B-293` — this changes the `CG ADD` URL's path).
- **The bridge's own Playout session** (rule 8). The bridge reads D4, D9, D10 and D11 with its own session,
  not a console's. There is no service token: a station admin gives the `cg-admin` password once, from any
  console, over that console's verified connection; the bridge signs in with D1 itself, keeps only the
  rotating refresh token — persisted atomically before each use — and never stores the password. When the
  session is lost («گذرواژهٔ تازه» revokes every token) every console shows one line: `CG Bridge needs a
station admin to sign in`.
- **CG Control — the console.** No sidecar, no Node, no firewall rule: the console is bundled in the app and
  finds CG Bridge on the Playout host at `5280` from the address the operator types; an admin can set
  another bridge address in Station setup. Sign-in is D1 from the native side, with no `Origin`. Lines:
  `CG Bridge not reachable at <host>:5280` with the reason; `CG Bridge needs a station admin to sign in`; the
  unlicensed channel; a version mismatch. The splash says it is connecting. Template import uploads to the
  bridge; PVW and the PROGRAM monitor read from the bridge. The installer becomes per-user.
- **Dev station.** `pnpm dev:station` (with `--fake` and `--caspar`) starts a bridge process as today, and
  the console connects to it exactly as to CG Bridge. The fake Playout models loopback AMCP, `OSC SUBSCRIBE`,
  a rotating refresh token and an `unlicensed` channel. Nothing dev-only reaches an installer.
- **Release `0.10.0`** (`P-061`): three installers through `tools/release`, a draft with the three,
  `SHA256SUMS.txt` and the Persian guide; `P-031`'s floor at `0.10.0`; the guide gains the install order and
  the two places CG Bridge can go; the clean-Windows smoke installs CG Bridge and checks it.
- **For the Playout team:** `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md` — `/health`'s shape, the
  installer's arguments and exit codes, the guarantee, the version policy.
- **Filed only:** `R-078` (exclusive lock), `R-079` (standby bridge on the backup), `P-062` (TLS).

## Not changed

A take's AMCP beyond what moving the process requires — the one change is the `CG ADD` URL's path segment
(`B-293`). The send guard: layers 50–99 only; no channel-wide `CLEAR`, no `MIXER <ch> CLEAR`, no `SET MODE`,
no consumer `ADD`/`REMOVE`. Nothing on air is cleared by an install, an upgrade, a service restart or a
console connecting. The console never talks to CasparCG.
