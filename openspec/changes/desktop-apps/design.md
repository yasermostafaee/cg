# Design — `desktop-apps`

The decision and its alternatives are **ADR 0011**; this file records what was MEASURED before
building (`DESKTOP-APPS-01` §1) and the shape of the first-run door.

## 1. Measured before building

1. **Toolchain.** Tauri 2.11 (crate 2.11.6, CLI 2.11.5, single-instance 2.4.5). One Cargo workspace
   at the root with both shells as members: one lockfile, one target dir — CI compiles Tauri once.
   No Rust or MSVC on the owner's host, so every Rust build is CI's (`windows-latest`).
2. **The sidecar.** The bridge's dependency tree is pure JS (`zod`, `jose`, `ws`, four workspace
   packages); `bufferutil`/`utf-8-validate` are not installed and `ws` falls back. esbuild bundles the
   CLI into one ESM file (~1.2 MB); ESM needs a `createRequire` banner for `ws`'s CommonJS
   `require('events')`, which threw `Dynamic require of "events"` without it. CommonJS output was
   refused outright — `Top-level await is currently not supported with the "cjs" output format` —
   which is what rules out a Node 22 SEA. **Chosen: the official `node.exe` + the bundle.**
   File-finding sites: none in `src/` or the packages (`import.meta.url`, `__dirname`,
   `createRequire`, `readFileSync` of an asset — all absent); the CLI's nine `~/.cg-runtime`
   defaults were the only home-relative paths, now rooted by `--state-home`.
   ⚠ Measured on the first installer run: Tauri's resource dir carries `\\?\`, and Node 22 cannot
   load an entry under it (`EISDIR: lstat 'C:'`); the shell hands plain paths.
3. **The console served by the bridge** — a new listener, loopback, on 5174; the console's
   `bridgeUrlFor(location)` gives `ws://127.0.0.1:5280` from that origin unchanged (measured with the
   staged `node.exe` + bundle + console: the page connected and rendered).
4. **The Designer inside Tauri** — see §4, filled from the installer smoke.
5. **Fonts.** The Runtime shipped the Vazirmatn faces but imported `fonts.css` only `?inline`; the
   Designer already self-hosted. Measured in the Designer: its CHROME stack reaches `system-ui` /
   Segoe UI before Vazirmatn, so Persian chrome never loads Vazirmatn on Windows (`B-263`).
6. **Persisted paths**: `bridge-connection.json`, `-fixed-layers`, `-reserved-layers`, `-templates/`
   (+ `channel-settings.json`, `delimiters.json` inside it), `-source-catalog`, `-source-assignments`,
   `-live-layers`, `-audit.ndjson`, `-playout.json`. The serve host is `templateServeHost` in
   `bridge-connection.json`, set through `connections.set-config` (C-024).

## 2. The door that writes the Playout target (`DESKTOP-APPS-01-A`)

Not the control socket. CG Control's `set_playout_address` command, callable only from the console
the bridge serves in the app's own window (capability `console`, remote URL
`http://127.0.0.1:5174/*`), runs the bridge CLI's one-shot `--set-playout-address` — the ONE writer,
beside the one reader — then restarts the sidecar. The writer replaces the whole Playout group,
which clears an adopted issuer. Gate: the Windows user at CG Control on that machine.

## 3. First-run's writes, through the existing doors only

`connections.set-config` (the CasparCG host from the catalogue, standard ports, the detected serve
host), then `fixedLayers.set-config` — the declaration door, which takes the "no bank yet" path
because an installed station in first-run declares none. Every row shown: with no CasparCG link
yet, installing a bank that already hides a row of unknown occupancy is refused (`untick-unknown`),
and that refusal is not changed.

## 4. The Designer inside Tauri — measured by the installer smoke

Measured inside the INSTALLED CG Designer, launched unelevated on a clean runner (run
https://github.com/yasermostafaee/cg/actions/runs/35864172600, `designer-facts.json` /
`designer-ffmpeg.json`):

| Fact                                        | Measured                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Origin                                      | `http://tauri.localhost` (WebView2, `Edg/152`)                                                                                     |
| `isSecureContext`                           | `true`                                                                                                                             |
| OPFS (`navigator.storage.getDirectory()`)   | available                                                                                                                          |
| `showOpenFilePicker` / `showSaveFilePicker` | both functions                                                                                                                     |
| `showDirectoryPicker`                       | function                                                                                                                           |
| `crossOriginIsolated`                       | `false` — not needed: ffmpeg ran without it (next row)                                                                             |
| ffmpeg under the installed CSP              | the app's own `video-convert` chunk ran `probeSource` to its own verdict — `no-stream`, `Invalid data found when processing input` |

So the Designer needs no file backend inside Tauri today (`P-054` stays conditional). Not
measurable by CI: whether a folder permission granted through the directory picker survives an app
restart — the owner's §7 step 2.

The runner is elevated and WebView2 ignores `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` in an elevated
process (wry#1782), so the smoke installs CG Control elevated, drives both apps at MEDIUM integrity
(gsudo, Tauri's own CI recipe) and uninstalls elevated — the integrity level read from the process
token and checked both ways.
