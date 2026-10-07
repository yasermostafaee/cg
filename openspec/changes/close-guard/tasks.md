# Tasks — the installed apps' close is held and asked about (D-162, R-094; `RELEASE-0114-01-B`)

Lane: **FULL** — both Tauri shells, a new app capability, and a predicate that decides whether a
window may close.

## 0. Established first (`design.md` §0)

- [x] 0.1 The browser Designer's warning (`App.tsx` `beforeunload`, `D-088`) and what decides
      "unsaved" (store-core `dirty`, a content hash), read three ways — `design.md` §0.1.
- [x] 0.2 Why the installed apps did not warn (a window close is not a navigation) and the hooks:
      `on_window_event` + `CloseRequested`/`prevent_close`, `eval`, three commands, `destroy`,
      `on_page_load` — from the Tauri 2.11.6 / tao 0.35.3 / tauri-runtime-wry 2.11.4 sources —
      `design.md` §0.2.
- [x] 0.3 Every way a window closes; shutdown / sign-out cannot be held (tao does not process
      `WM_QUERYENDSESSION`) — `design.md` §0.3.

## 1. The shells (shared)

- [x] 1.1 `apps/designer/src-tauri/src/close_guard.rs` — the decision, std-only, 9 tests.
- [x] 1.2 `apps/designer/src-tauri/src/close_window.rs` — the three commands and the two hooks.
- [x] 1.3 CG Designer: `main.rs` (manage, commands, hooks), `build.rs` `AppManifest` (with
      `keyboard_language`), `capabilities/designer.json`.
- [x] 1.4 CG Control: `main.rs` includes both files by `#[path]` (the single-instance plugin stays
      first), logs every close decision to `shell.log`; `build.rs` and `capabilities/console.json`.
- [x] 1.5 `rustc --test close_guard.rs` 9/9 (a planted defect reds 5); `cargo test --offline` of the
      workspace on the scratchpad GNU toolchain: cg-control 14/14, cg-designer 9/9, cg-setup 66/66,
      0 warnings, both capability files accepted by `tauri-build`.

## 2. The page's door (shared)

- [x] 2.1 `@cg/gesture` `closeGuardDoor` + 7 tests (100 % of the module).
- [x] 2.2 `closeGuard` on both bridge contracts; implemented in each `src/platform/`; the Runtime
      parity guard lists it on both backends.

## 3. D-162 — CG Designer

- [x] 3.1 `hasUnsavedChanges` (store-core) — the ONE predicate; `TopToolbar` and `LandingView`
      guards migrated; `state/README.md` updated (engine doc-sync).
- [x] 3.2 `CloseGuard` beside `App` (leave prompt + window close); `UnsavedChangesDialog`.
- [x] 3.3 `close-guard.dom.test.ts` 10/10 — the two doors against the same store states (a planted
      second predicate reds 9); full Designer suite 153 files / 1491 tests green.
- [x] 3.4 Playwright `close-guard.spec.ts` 6/6 (Windows): leave prompt with changes and without
      (control); the dialog with the shell faked — one dialog, Enter and Escape keep, Don't save and
      Save close. Neighbours `desktop-save`, `starter-landing`, `project-rename`, `text-digits` 15/15.

## 4. R-094 — CG Control

- [x] 4.1 `ConsoleCloseGuard` in `App`; `CloseConsoleDialog` (`window` layer; the fact line by
      `airTally`); `leavePrompt.ts` (signed-in only; `reloadOnPurpose` for Retry connection).
- [x] 4.2 The Modal primitive's `window` layer (z 1050, above lock / sign-in / first-run).
- [x] 4.3 `closeConsole.dom.test.ts` 11/11 — Close sends no frame and does not close the socket
      (control: the same recorder sees a read right after); `readsAfterSignIn` census updated (the
      shell's door is never a bridge request); full Runtime suite 229 files / 2273 tests green.
- [x] 4.4 Playwright `close-guard.spec.ts` 2/2 (Windows): the tab asks signed in, not signed out
      (control); the console's dialog with the shell faked — the fact line agrees with the header
      tally, Enter and Escape keep, Close closes, nothing comes off air. Found and fixed on the way:
      two buttons named `Close` (the ✕ cancels) — the action is named `Close CG Control`.
      Neighbours `playout-auth-reload` (five reloads while signed in), `playout-address-gate`,
      `splash`, `text-digits`, `modal-frame-chrome`, `modal-geometry`, `settings-polish`,
      `two-consoles` 33/33.

## 5. The desktop smoke

- [x] 5.1 `installer-smoke.mjs`: `WM_CLOSE` to the main window (`sendClose`); Designer unchanged →
      closes at once; relaunched, edited → held, one dialog, Cancel keeps, Don't save closes; CG
      Control → held over first-run, Cancel keeps, Close exits; `shell.log` records the held close;
      `designer-unsaved-dialog.png`, `control-close-dialog.png`. `node --check` only — it runs on the
      Windows CI runner.
- [ ] 5.2 **OWED** — the `smoke` job on the Windows runner, RAN and green, for the commit that
      carries this change: run URL here.
- [x] 5.3 `RELEASE-0114-01-C` — the smoke's landing-page match was by TEXT (`New project`), and the
      button reads `+ New project` (its NAME is `New project`): both `D-162` steps would have timed out
      at the landing page. Matched by name; proved in local Chrome against the built Designer (the old
      match finds nothing, the new one finds the button).
- [x] 5.4 `RELEASE-0114-01-C` — the installed Designer's own work under its new capability, in the
      smoke: a composition setting (duration 50 → 137), Save (`.cgproj`, a zip), Export (`.vcg`, a
      zip), Open from Recent and File → Open (Ctrl+O) from another project — the setting read back
      from the file both times. Windows' file pickers are replaced by OPFS files; the page's own save,
      export and open code runs. Dry-run in local Chrome: every step passes (747-byte `.cgproj`,
      136,805-byte `.vcg`, 137 read back twice).
- [x] 5.5 The capability proof (`RELEASE-0114-01-C`): every command the Designer page invokes is
      granted — 4 distinct (`keyboard_language`, `close_guard`, `close_request_seen`,
      `close_window_now`) at 5 call sites, 4 registered in `generate_handler!`, 4 declared in
      `build.rs`, 4 granted in `capabilities/designer.json`; no plugin, and the close reaches the page
      by `eval` (no permission). CG Control: 7 distinct at 8 call sites, 7 / 7 / 7.
- [x] 5.6 `sendClose`, the dialog probe and the Designer page functions are ONE copy,
      `tests/desktop/app-window.mjs`, used by the smoke and the release acceptance.

## 6. Owed before this is done

- [ ] 6.1 **OWED** — a COMPLETED, GREEN Linux `e2e` job on GitHub Actions for the commit carrying
      this change (CLAUDE.md "E2E coverage"); the Windows runs above do not discharge it. Run URL
      here.
- [ ] 6.2 **OWED** — the owner's hand check on the installed apps: Alt+F4 with focus inside the page,
      the taskbar's Close window, and a Windows sign-out with unsaved work (expected: not held — the
      app ends; `design.md` §0.3).
- [x] 6.3a Read from source (`RELEASE-0114-01-C`): `KillProcess(CurrentUser)` is a hard terminate —
      nsis-tauri-utils `v0.5.3` (pinned by tauri-cli 2.11.5's bundler), `crates/nsis-process/src/lib.rs`
      `fn kill`: `OpenProcess(PROCESS_TERMINATE)` + `TerminateProcess(handle, 1)`, never `WM_CLOSE`; under
      `/S` (every CG Setup run) the template's OK/Cancel prompt is skipped. `design.md` §0.3.
- [ ] 6.3b **OWED** — measured: the `acceptance-upgrade-0113` job's `upgrade-apps-open` phase, RAN and
      green — CG Control's and CG Designer's installers over both apps open (Designer with unsaved
      changes), from `0.11.3` and again over the guarded `0.11.4` apps (a held `WM_CLOSE` first);
      each exits 0 within its bound, the app ended, nothing on air cleared. Run URL here.
- [x] 6.4 PRD items `D-162` and `R-094` read `[~]` with this change dir (checked on `dev`,
      `RELEASE-0114-01-C`: `docs/prd/designer.md`, `docs/prd/runtime.md`).
