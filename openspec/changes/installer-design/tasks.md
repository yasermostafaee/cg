# installer-design — tasks (`INSTALLER-DESIGN-01` v2, `P-063`)

## 0. Design first

- [x] 0.1 The technology compared, with sources; (c2) chosen — a native Rust front end (`design.md` §0)
- [x] 0.2 Every screen of §2 drawn as a static page with the real tokens, faces, icons and tiles
      (`Claude outputs/INSTALLER-DESIGN-01-screens/mockup/`, generated from the repo's own sources)

## 1. CG Setup (`tools/setup-ui`)

- [x] 1.1 The command line read as NSIS reads it; `/S` (and Tauri's `/P`) hand it to the engine untouched
- [x] 1.2 The trailer: engine, configuration, tile, guide, each hashed; found before a certificate table
- [x] 1.3 The progress model: CG Bridge's logged steps (keyed to `cg-bridge.nsi`, tested); the apps'
      observed steps; within a step only bytes move the bar
- [x] 1.4 The pages' model and layout: Welcome, Location, Installing, Done, Error; the words in one file
- [x] 1.5 The painter: Direct2D / DirectWrite, the palette (tested against `theme.ts`), the mark (from
      `apasai-logo.svg`), lucide icons, the tile rescaled per DPI
- [x] 1.6 The window: frameless, DWM shadow and corners, its title bar, per-monitor DPI, keyboard,
      motion with reduced motion, the engine run and read on worker threads
- [x] 1.7 UI Automation: every text and control, Invoke / Toggle / RangeValue
- [x] 1.8 `cg-setup-pack`: icon, version, CG Bridge's `requireAdministrator`, the engine's version
      checked, the blobs appended
- [x] 1.9 Driven locally with a stand-in engine (the real engines must not run on the owner's machine):
      every page, exit codes 0 / 1 / 2, and the silent pass-through returning the engine's codes

## 2. Release tooling and CI

- [x] 2.1 `tools/release/src/pack-installers.mjs` (+ tests): sizes measured, `cg-setup-pack` per product
- [x] 2.2 `desktop.yml`: CG Setup tested and built (32-bit); the guide for Help; packed; engines kept
- [x] 2.3 The smokes: silent A/B against the engines; the apps' and CG Bridge's windows driven through
      UI Automation (fresh, update, error); the `setup-window` job (Server 2022 and 2025: WebView2
      blocked, the keyboard, 150 % / 200 %)
- [x] 2.4 The `installers`, `smoke`, `bridge-smoke` and `setup-window` jobs COMPLETED and GREEN on the
      pushed commit, each confirmed to have run — `11ff890c`,
      https://github.com/yasermostafaee/cg/actions/runs/37168047465 (`installers` success; `smoke`
      success, 65/65 + the setup flows 64/64; `bridge-smoke` success, 39/39 + 31/31; `setup-window`
      success on `windows-2022` 35/35 and `windows-2025` 35/35; `release` skipped: tag only). The run
      before it (`88e3be9a`, 37166490439) was green on every product behaviour and red on two harness
      defects, fixed in `11ff890c`.
- [x] 2.5 The `pr.yml` `e2e` job COMPLETED and GREEN, confirmed to have run — `11ff890c`,
      https://github.com/yasermostafaee/cg/actions/runs/37168047476 (Designer 293 passed, Runtime 327
      passed)

## 3. Evidence and docs

- [x] 3.1 Every page of every installer captured on the clean runners (run 37168047465's artifacts
      `installer-smoke`, `bridge-smoke`, `setup-window-*`), beside its mockup in the report
- [x] 3.2 Every installer's size before (engine) and after (installer), each under +15 MB — run
      37168047465: CG Bridge 23,630,140 → 24,471,859 (+841,719); CG Control 217,602,964 →
      218,444,598 (+841,634); CG Designer 226,206,057 → 227,047,531 (+841,474)
- [x] 3.3 `CG-BRIDGE-FOR-PLAYOUT.md` §2: what the installer is now, and its size
- [x] 3.4 `P-063` filed and its status kept current; the report written

## 4. `RELEASE-0111-01` Part A — CG Bridge's separate-server page (`P-065`, 2026-10-04)

Lane: FULL (delivery source: what the installer gives its engine).

- [x] 4.1 §A0 established: the engine's options, defaults, store and validation — the engine refuses none
      of the three with an exit code (`--write-service-config` checks only "not empty"; the service checks
      the Playout address when it starts, after the installer exited 0); the report §A0
- [x] 4.2 `address.rs` — `normalisePlayoutAddress` and `splitHostPort`'s host, ported; one table
      (`packages/shared-ipc/tests/fixtures/playout-addresses.json`) read by the TypeScript test and the
      Rust test; `stricter` names what the page refuses on purpose
- [x] 4.3 `field.rs` (one line of text: caret, select-all, paste, Persian digits → ASCII); `server.rs`
      (pre-fill: command line > stored > none; the AMCP host follows; refusals in words; the engine's
      options); the Playout page in `layout.rs`; the painter; the window's keys, `WM_CHAR`, Ctrl+A/V;
      UI Automation Value and SelectionItem; this machine's IPv4 list (`GetAdaptersAddresses`)
- [x] 4.4 Unit tests (`cargo test -p cg-setup`, 66): the table, the field, the page's model and layout
- [ ] 4.5 The CG Bridge smoke (B–G) and both upgrade acceptances COMPLETED and GREEN, each job RAN (URLs)
- [x] 4.6 The screens: unticked, ticked and filled, a refusal, and the upgrade from `0.11.0` opened
      pre-filled — captured on the clean runner by the CG Bridge smoke (Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/37207692158>, `1adacf9a`, artifact `bridge-smoke`),
      in `Claude outputs/RELEASE-0111-01-screens/` beside CG Setup's own previews
- [x] 4.7 `RELEASE-0111-01-A` A2 — a loopback `casparHost` on a separate server: the clean runner has no
      Playout, so `tools/caspar-bridge/tests/service-config.test.ts` joins the file the page writes to
      the Playout host the rewrite keys on (control: the unticked file rewrites nothing); the rewrite
      itself is `playout-address.integration.test.ts` A4 and `central-bridge-service.integration.test.ts`
      §5

## 5. `RELEASE-0111-01` Part D — the release that carries the page (`0.11.1`, 2026-10-04)

Lane: FULL (delivery: the version, the floor and the guide a client follows).

- [x] 5.1 `0.11.1` set through `tools/release` (nine sources, one version); `P-031`'s floor moved to
      `0.11.1` — `0.11.0` was never delivered — with an empty `git diff v0.11.0` over the five floor files
- [x] 5.2 `docs/release/0.11.1/install-guide.fa.md`: the separate server is the page (picture 2, CG
      Setup's own painter with documentation addresses — a runner's capture would carry its real ones),
      not a PowerShell line; the Playout's own checkbox «CG Bridge هم نصب شود» marked
      `[confirm with the Playout team]`; the one side step left (a static IP, in Windows' settings)
- [ ] 5.3 The Welcome and console pictures re-captured at `0.11.1` (CI artifacts) and committed
- [ ] 5.4 The clean-Windows acceptance at `0.11.1`: fresh, from `0.10.0`, from `0.11.0`; the payload scan
      reading every file (count in the job log) — each job RAN (URLs)
- [ ] 5.5 `v0.11.1` tagged on a commit whose PR run and Desktop run COMPLETED GREEN, every job RAN; the
      draft "APASAI CG 0.11.1", five files, read back and re-downloaded; `v0.11.0` retitled superseded
