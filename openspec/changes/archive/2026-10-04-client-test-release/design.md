# client-test-release — design (`P-059`, `CLIENT-TEST-RELEASE-01`)

## §A0 — the splash's "one still frame" (Part A): the setting, not the code

The owner saw the startup splash as one still frame on `pnpm dev:station --fake` (2026-09-29). His rule:
if the cause is only the OS "reduce motion" setting, say so and change nothing. **It is only that, and
nothing was changed.**

1. **The commit that stopped it: none.** At `0d857d81` the splash animates in every setup measured, in
   a real Chrome with motion allowed — the live Web Animations on `#cg-splash`'s subtree exist, their
   `currentTime` advances, and two pixel snapshots of the scene 1.3 s apart differ: the built console
   (23 animations; the scene's loops `running`, 1587 → 3003 ms); the dev server; the real
   `pnpm dev:station --fake` page (run isolated with `CG_DEV_STATION_HOME` and `--no-open`); a live,
   signed-in bridge with the fake Playout, cold and after a reload; CG Control's continued splash
   (`data-continued`, entrances at 0 s, loops running); CG Designer's build (31 animations); headless
   and headed. With nothing to reach, there is nothing to bisect.
2. **The installed apps.** WebView2 takes `prefers-reduced-motion` from the same Chromium code as
   Chrome, per Windows session, and CG Control's starting page carries the console's splash CSS byte for
   byte (`src-tauri/starting/compose.mjs`) — so they follow the same setting. The installed CG Control on
   this host predates `FIELD-FIXES-01` J (built 2026-09-26 12:33 local, J committed 22:21) and was last
   launched 2026-09-26 18:54 (`%APPDATA%\CG Control\logs\shell.log`); it was not relaunched or replaced.
   `STARTING BRIDGE` is CG Control's starting-page label only (`src-tauri/starting/start.js:9`); the web
   page's labels are `INITIALIZING`, `PROBING BRIDGE`, `STARTING INTERFACE`.
3. **Reduced motion — measured.** The owner reaches this host over Remote Desktop (from
   `172.27.36.39`/`.59`; `TerminalServices-LocalSessionManager/Operational` events 21/24/25/40); the
   session moved to the console at 2026-09-29 11:00:34. His Chrome's browser process started 2026-09-28
   22:17:03, 31 s after an RDP logon. Asked through a one-shot local page, **that Chrome answered
   `prefers-reduced-motion: reduce`** (11:44:48Z), while a Chrome started at the console answers
   `no-preference` and `SPI_GETCLIENTAREAANIMATION` reads TRUE. Under `reduce` the splash is still by
   design (`apps/runtime/index.html`, the reduced-motion block): 0 animations and identical pixels — the
   "full package" frame. Restarting Chrome at the console, or enabling animations in the RDP client,
   brings the motion back.

## §B0 — established before Part B

1. **Versions.** All 26 `package.json` files read `0.0.0` (the bridge's included — it has no other
   version); both `tauri.conf.json` and both `Cargo.toml` (and their `Cargo.lock` entries) read `0.1.0`.
   `CG_RUNTIME_VERSION` (`1.0.0`, `packages/shared-schema/src/runtime-version.ts`) is a rendering-CONTRACT
   version that an ordinary release does not touch. **Bundler: NSIS for both** (`bundle.targets:
["nsis"]`): CG Control `perMachine` with `windows/installer-hooks.nsh`, CG Designer `currentUser`;
   WebView2 `offlineInstaller`, silent, in both. NSIS writes `DisplayVersion` from the config's version
   under `Software\Microsoft\Windows\CurrentVersion\Uninstall\<productName>` (HKLM / HKCU).
2. **Where a version shows today: nowhere in either app.** The splash foot prints `sha · YYYY-MM-DD` and
   deliberately withholds the version (`tools/splash-kit/src/buildStamp.mjs`); `__CG_BUILD__.version`
   rides in both bundles unread. Windows' Installed apps lists both as `0.1.0` (read on this host).
3. **Inbound to the CG Control machine.** Confirmed: **UDP 6250** (OSC from CasparCG) and **TCP 7911**
   (CasparCG fetching templates) — both bind `0.0.0.0` once first-run points the station at a
   non-loopback CasparCG (`deriveOscBindHost`, `tools/caspar-bridge/src/caspar-runtime.ts:908`;
   `template-http-server.ts:93`). The console (5174) and the control socket (5280) are loopback only. The
   installer **already** adds two inbound allow rules scoped to `$INSTDIR\cg-bridge.exe` and the
   uninstaller removes them (`apps/runtime/src-tauri/windows/installer-hooks.nsh:28-36`, `DESKTOP-APPS-01`,
   ADR 0011), so on a clean Windows with the firewall on nothing blocks them and no prompt appears. The
   smoke's check of those rules was satisfied by the rule's NAME (it carries "UDP 6250") — fixed here.
   Not covered, and not in this change: a declared backup server's OSC port (it cannot be 6250) or an OSC
   port changed in Station setup gets no rule; the rules are `profile=any` and admit any remote address.
4. **The operator guide** is `docs/operator-guide/README.md`, "Installing and connecting" (lines 5–66):
   the install order (Playout; CG Control right after, on a static IP; sign in first as `cg-admin`; look
   at the Playout's list once), SmartScreen, first run, sign-in, channel, serve address. The prompt
   credits `PLAYOUT-AUTH-01`'s addendum; the filing is `DESKTOP-APPS-01-C` C9
   (`openspec/changes/archive/2026-09-23-desktop-apps/tasks.md:101-102`) and `C-043`
   (`docs/prd/caspar.md:2774-2777`). One line is stale: it names the removed
   **CG Control → Open bridge log** menu; the door is now **Open log folder** in the audit log.
5. **Minimum Playout build, as filed:** `2.8.54` to install and connect with no manual step (built-in
   `cg-admin`, the AMCP allow list and its in-app approval, CORS with `127.0.0.1:5174` —
   `docs/integration/playout/PLAYOUT-2.8.54-CG-FACTS-2026-09-23.md`); `2.8.57` for Sources and Media
   (D10/D11); `2.8.58` for the air-state dots; **`2.9.0`** for route plates, which also need two
   Playout-side switches the Playout team turns on. The guide names `2.9.0`.
6. **Dev-only things in the installers: absent** — the dev station, `--fake`/`--caspar`, `@cg/amcp-mock`,
   the test fakes (`tests/support/**`), the test source provider, fixtures, tokens and the fake's
   password (`tools/caspar-bridge/tests/desktop-sidecar.test.ts` pins the bundle's absences). The in-page
   simulator behind **Enter test mode** is a filed product feature (`R-006`, `B-117`), not a test door,
   and stays. **Found and fixed:** the plant's addresses in the console's copy (the backup-host
   placeholder `192.168.21.115`, the hint "e.g. 192.168.21.114") and in one source comment the bridge
   bundle keeps (`command-builder.ts`; esbuild keeps comments).

## Decisions

- **The version line's place.** Neither app showed a version (§B0.2), so the prompt's rule applies:
  CG Control's **Station setup** (the rail's foot, under the station card) and CG Designer's settings or
  about place — which does not exist; its **start screen** is where it introduces itself and the first
  thing on screen at every launch. (Its status bar was tried first: it is not on the start screen.) Both
  lines are a `Tag` and read `__CG_BUILD__`, the build stamp the splash reads; each app's vitest config
  defines the same stamp, so the dom specs render the real version.
- **The splash foot is unchanged** (`sha · date`): the release is named once, in the line above.
- **One version, read, never trusted.** `tools/release/src/release-version.mjs` reads the nine files;
  the installer workflow runs it before building and hands the version to the smoke, which checks the
  installer names and Installed apps against it.
- **Example addresses are RFC 5737 documentation addresses** (`192.0.2.10`, `192.0.2.11`), which can
  never be a real station's.
- **The bridge's version** is inlined by the bundler (`define: __CG_BRIDGE_VERSION__`), because the
  installed bundle finds no file beside it; from source it reads its own manifest.
