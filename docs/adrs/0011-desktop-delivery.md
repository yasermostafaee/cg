# ADR 0011 — Desktop delivery: two Tauri installers — CG Control (the console and its bridge) and CG Designer

- **Status:** Accepted — owner decision 2026-09-23 (`DESKTOP-APPS-01`, with its delta
  `DESKTOP-APPS-01-A`).
- **Date:** 2026-09-23
- **Supersedes:** ADR 0007 **for delivery only**. Development stays in the browser (`pnpm dev`);
  nothing here is needed to run either app from a checkout.
- **Related:** ADR 0002 (two apps), ADR 0007 (Electron → browser), ADR 0010 (the Playout link —
  rule 1 amended the same day: the issuer is learned), `P-001` (fonts offline), `B-225` (air keeps
  playing across a bridge restart), and the items this ADR files: `P-051` … `P-054`, `R-067`,
  `R-068`, `B-262`, `B-263`.

## Context

The client receives CG Designer, CG Control and the Playout and installs them **itself, on its own
machines and its own addresses**. There are one or two users, each on their own machine, and
nobody connects through a browser. Nobody from our side or the Playout's is present. Broadcast
machines are often offline. Until now the product was two browser SPAs plus a Node bridge started
from a checkout — which assumes a developer.

## Decision

1. **Tauri 2, two apps, two NSIS installers**, built from one monorepo and one Cargo workspace (root
   `Cargo.toml`: one lockfile and one target directory, so CI compiles Tauri once and links it
   twice). ADR 0002's reasons for two apps stand — reliability budgets, crash isolation,
   footprint, security profile, deployment topology — and its rejection of _"one app, two modes"_
   stands with them. A designer-only user installs no bridge.
   - **CG Control** — per-machine (admin): the console and its bridge.
   - **CG Designer** — per-user, no admin rights, no bridge, no firewall rule: the Designer's built
     `dist`, bundled normally and served from `http://tauri.localhost`. Measured in the installed
     app: a secure context, OPFS and all three file pickers present, and ffmpeg loads and runs
     under its CSP — so it needs no file backend today (`P-054` stays conditional).
2. **CG Control's window loads the console FROM THE BRIDGE**, at `http://127.0.0.1:5174` — a new,
   loopback-only listener on the bridge that serves the Runtime's built `dist` with an SPA fallback
   and a health identity (`GET /__cg/health`). Not bundled inside the shell, for two reasons that
   need no console change:
   1. the console derives its bridge address from the host that served the page, so a page from
      `127.0.0.1:5174` finds `ws://127.0.0.1:5280` — one from `tauri.localhost` would not;
   2. the console's origin is ONE fixed string on every install, `http://127.0.0.1:5174`, so every
      client Playout's CORS list needs that one entry and nothing site-specific.

   🔴 It is its own listener and never the template origin 7911 (ADR 0010 rule 13):
   `template-server-route-set.test.ts` is unchanged and green, and the CLI refuses a console port
   equal to the control or template port.

3. **The bridge sidecar is the official `node.exe`, installed as `cg-bridge.exe`, running the
   bridge bundled into ONE ESM file** (`tools/caspar-bridge/scripts/bundle.mjs`). A Node Single
   Executable was measured and not taken: on the Node this repo pins (22) a SEA's entry must be
   CommonJS, and esbuild refuses the CLI's top-level `await` as CommonJS. The dependency tree is
   pure JS (`ws`'s optional native addons are absent and it falls back); the bridge finds no file
   through `import.meta.url` or `__dirname` — every path arrives as a flag.
4. **Every path under the user's own data folder, never `~/.cg-runtime`**: the shell passes
   `--state-home "%APPDATA%\CG Control"`, so the station files are
   `%APPDATA%\CG Control\.cg-runtime\bridge-*.json` — the same names as on a developer's machine,
   in a folder a developer's plant config cannot reach. Logs: `%APPDATA%\CG Control\logs\bridge.log`
   (one previous run kept beside it) and `shell.log`; the menu's _Open bridge log_ selects the file
   in Explorer, which is what a client sends us.
5. **Lifecycle.** The shell waits until the bridge answers on 5174, then opens the console; until
   then, a starting page with no prose, and on failure the sentence, who holds each port, and the log
   path. Closing CG Control stops the bridge (it holds the bridge's stdin — the lifeline — and closes
   it, then waits, then ends it); a crashed or killed shell closes the pipe with it, so the bridge
   stops itself (`--exit-on-stdin-close`; Windows sends a child no SIGTERM). A leftover bridge found
   on 5174 is **stopped and started fresh, never reused** — its lifeline died with its parent — and
   only when its `execPath` is this install's own sidecar. One instance
   (`tauri-plugin-single-instance`): a second launch focuses the open window.
6. **Firewall**: the installer adds two inbound rules scoped to `cg-bridge.exe`'s own path — UDP 6250
   (OSC from CasparCG) and TCP 7911 (CasparCG fetching templates) — and the uninstaller removes
   them.
7. **WebView2 installs with no internet**: `webviewInstallMode: offlineInstaller`, the only mode that
   guarantees it. The two bootstrapper modes download at install time and fail offline; a fixed
   runtime ships a WebView2 that never receives security fixes and becomes ours to track. The offline
   installer is skipped when WebView2 is already present.
8. **Unsigned for this build.** SmartScreen shows _"Windows protected your PC"_; the operator guide
   says what to click, in one line. Signing is `P-052`.
9. **The Playout target has ONE door, and it is not the control socket** (`DESKTOP-APPS-01-A`). The
   shell's `set_playout_address` command, callable only from the console the bridge serves on
   `127.0.0.1:5174` in CG Control's own window (a Tauri capability with that one remote URL), runs
   the bridge CLI's one-shot writer (`--set-playout-address`, binds nothing) and restarts the
   bridge. The writer replaces the whole Playout group, which clears an adopted issuer. **The gate
   is being the Windows user at CG Control on that machine** — the same user who owns the files it
   writes. A browser has no such door: the control is absent there.
10. **First-run** (`--first-run`, passed only by the shell): the bridge advertises `target` while no
    Playout is configured and `channel` while no channel is declared. The console asks for ONE thing,
    the Playout's address; the issuer is learned from the first `station-admin` sign-in (ADR 0010,
    amendment); the CasparCG host comes from the Playout's own channel list (a loopback `casparHost`
    is the Playout's own machine, resolved inside the one D4 reader); the serve host is detected on
    the route to it. The channel is declared through the existing door with every row shown — with
    no CasparCG link yet, hiding a row of unknown occupancy is refused, and that refusal is
    unchanged. An installed station that has not chosen declares NO channel rather than the built-in
    channel 1, which on a client's Playout is the programme channel.
11. **Fonts are self-hosted in both apps** (`P-001`): no font request leaves the machine.
12. **CI builds both installers on `windows-latest`** (`.github/workflows/desktop.yml`), so nobody
    needs Rust locally, and a SECOND, fresh runner installs and drives them through WebView2's
    DevTools port — the installed files, the firewall rules and their removal, the installed sidecar
    answering, the console loaded from it, the door, state under `%APPDATA%`, single instance, close
    and kill both leaving no bridge. The apps are driven at MEDIUM integrity, as an operator runs
    them, and only the per-machine install and uninstall run elevated: WebView2 ignores its
    DevTools variable in an elevated process (wry#1782), which is what kept both page checks dark
    on the first two runs.

## What the client's Playout must provide (install-time dependencies)

1. **AMCP for the CG Control machine.** From Playout 2.8.54 this is AUTOMATIC
   (`DESKTOP-APPS-01-B`): the Playout opens TCP 5250 to a machine when that machine's bridge makes
   a server-side D4/D8/D9 read with a `station-admin` token — which the bridge does the moment a
   station admin signs in — and drops it after 7 days unseen. It needs the bridge to reach the
   Playout DIRECTLY (no NAT, proxy or VPN between them). Where auto-trust is off or the Playout is
   older, the Playout's administrator adds an allow rule instead; the connection check prints the
   exact command with the IP filled in (`secure-ports.ps1 -AllowAmcpFrom <ip>`).
2. **`http://127.0.0.1:5174` in the Playout's CORS list** — the check prints that line when it is
   missing.
3. **CG Control on a different machine from the Playout engine**: on the engine's host, UDP 6250
   belongs to the engine (ADR 0010 rule 7). The check warns; it does not block.
4. **One CG Control per channel**: two installs driving one channel run two bridges with two ledgers
   (`R-068`, recorded, not solved).
5. The **`cg-admin` account** every Playout install creates on its first run (2.8.54):
   `station-admin`, granted every channel (`cg_channels: "*"`), CG-only (the Playout's own client
   refuses it), used for setup and daily operation until the Playout has user management. Its
   password is random per install and read from the Playout's settings page; it is never written
   into this repository.

## Rationale

The console served by the bridge is the choice that keeps the console unchanged and the CORS entry
universal. The sidecar as `node.exe` + one file is the choice with no build-time magic and a signed
binary. `--state-home` keeps every file name and every store's doctrine, so the persisted-files
census still reads the same inventory. Writing the Playout target through the app rather than the
socket keeps ADR 0010's gate out of its own reach.

## Consequences

- Closing CG Control stops CONTROL, not air: CasparCG keeps playing, and the next launch re-adopts
  from the ledger (`B-225`). A bridge that survives the app is `R-067`.
- The console's only origin in a client installation is `http://127.0.0.1:5174`.
- CG Control's installer carries the WebView2 offline installer (~150 MB) and Node (~100 MB).
- Development is unchanged: `pnpm dev`, the browser, the bridge from `bin/`.

## Alternatives considered

- **Bundle the console inside the Tauri app.** Rejected: the page would be served from
  `tauri.localhost` and derive the wrong bridge address, and every install's origin would need
  its own CORS entry.
- **One app, two modes.** Rejected by ADR 0002, and that rejection stands.
- **A Node SEA sidecar.** Measured and rejected (Decision 3).
- **WebView2 `downloadBootstrapper` / `embedBootstrapper` / `fixedRuntime`.** Rejected (Decision 7).
- **Writing the Playout target over the control socket** (a first-run channel open while
  unconfigured). Rejected: a gate whose configuration is behind the gate is not a gate
  (`playout-config.ts`'s header), and `DESKTOP-APPS-01-A` forbids a new socket path to auth
  configuration.
- **The bridge as a Windows service.** Out of this build: `R-067`.
