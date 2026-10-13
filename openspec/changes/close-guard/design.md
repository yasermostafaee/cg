# Design — the installed apps' close is held and asked about (D-162, R-094)

## §0 — Established first

### §0.1 How the browser Designer warned, and what decides "unsaved"

- **The warning** was a `beforeunload` listener in `apps/designer/src/renderer/App.tsx` (`D-088`),
  attached only while the store's `dirty` was true: `e.preventDefault(); e.returnValue = ''`. The
  browser draws its own generic prompt; custom text is ignored.
- **"Unsaved" is the store's `dirty` flag** (`apps/designer/src/renderer/state/store-core.ts`,
  `D-088`, documented in `state/README.md` "dirty is a content hash"): optimistic on every `set()`
  (a scene edit is dirty by identity against the saved object), made authoritative by
  `reconcileDirty()` — an FNV-1a hash of the canonical scene (`scene-hash.ts`) against the hash
  recorded at the last load or save (`setSavedBaseline`, called by `setScene` and `markSaved`).
- **It was read three ways**: `App.tsx` armed on `dirty`; `TopToolbar.guardedSwitch` and
  `LandingView.guardedSwitch` each spelled `scene === null || !designerStore.get().dirty`. Same
  answer today, three spellings — the drift golden rule 6 forbids.
- **Now ONE predicate**: `hasUnsavedChanges(state)` = `state.scene !== null && state.dirty`
  (store-core, re-exported from `store.ts`). The leave prompt, the window close and both
  save-before-switch guards ask it, at the moment of the decision.

### §0.2 Why the installed apps did not warn, and the hooks used

- **A window close is not a navigation.** In Tauri 2.11, `WM_CLOSE` becomes tao's
  `WindowEvent::CloseRequested` (tao 0.35.3 `platform_impl/windows/event_loop.rs:1061-1068`);
  tauri-runtime-wry runs every window-event handler and the app's callback with a `signal_tx`, and
  destroys the window unless a handler sent `true` on it (`tauri-runtime-wry 2.11.4 lib.rs:4307`,
  `4454-4465`). WebView2 is torn down with the window; the page is never navigated, so
  `beforeunload` never runs. The browser warning is unreachable in the installed app by
  construction, not by a bug in it.
- **The hooks** (all Tauri 2.11.6):
  - `Builder::on_window_event` (`app.rs:2060`) with `WindowEvent::CloseRequested { api, .. }` and
    `CloseRequestApi::prevent_close()` (`app.rs:97-121`) — the shell decides every close.
  - **The page is told** with `WebviewWindow::eval` (`webview/webview_window.rs:2403`) running one
    constant script, `window.dispatchEvent(new Event('cg:close-requested'))`. `eval` needs no
    permission; the event plugin's `listen` would need `core:event:*` granted (the Designer had no
    capability file at all) and the JS `@tauri-apps/api` `onCloseRequested`, which is that `listen`
    plus a `destroy`, is not a dependency of either app.
  - **The page answers** through three app commands: `close_guard { armed }` (the page holds every
    close it can be asked about, or lets go), `close_request_seen` (it has the ask), and
    `close_window_now`, which calls `WebviewWindow::destroy` — "does not emit any events and force
    close the window" (`webview_window.rs:2221`) — so no second `CloseRequested` arrives.
  - `Builder::on_page_load` (`app.rs:1783`) with `PageLoadEvent::Started`: a navigation lets go of
    whatever the last page held.

### §0.3 Every way a window closes, and which the shell can hold

| Way                                                 | What Windows sends                                                                                                                                        | Held?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title bar ×                                         | `WM_SYSCOMMAND SC_CLOSE` → `DefWindowProc` → `WM_CLOSE` → `CloseRequested`                                                                                | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Alt+F4                                              | `WM_SYSKEYDOWN` → `SC_CLOSE` → `WM_CLOSE`                                                                                                                 | **Yes**, by the same path (not driven separately by the smoke, which posts `WM_CLOSE`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Taskbar "Close window", thumbnail ×                 | `SC_CLOSE` → `WM_CLOSE`                                                                                                                                   | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Window menu (Alt+Space → Close)                     | `SC_CLOSE` → `WM_CLOSE`                                                                                                                                   | **Yes**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The app's own menu                                  | Neither app has a native menu, a tray or an in-page Exit (checked: no `menu`/`tray` in either `tauri.conf.json`, no Exit/Quit control in either renderer) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `taskkill /PID` (no `/F`)                           | `WM_CLOSE` to every top-level window of the process                                                                                                       | **Yes** for the main window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `taskkill /F`, a crash, an installer's process kill | `TerminateProcess` — no message, no page code                                                                                                             | **No**, and nothing needs to be: none is a slip of the hand. Tauri's NSIS template stops a running app with `nsis_tauri_utils::KillProcess(CurrentUser)` (`utils.nsh`, `CheckIfAppIsRunning`). **Read (`RELEASE-0114-01-C`):** the DLL tauri-cli 2.11.5's bundler pins is nsis-tauri-utils `v0.5.3` (`nsis/mod.rs`, `NSIS_TAURI_UTILS_URL`), whose `crates/nsis-process/src/lib.rs` `fn kill` is `OpenProcess(PROCESS_TERMINATE)` then `TerminateProcess(handle, 1)` — no message, so the guard is never asked; and under `/S`, which CG Setup hands every run, the template skips its OK/Cancel prompt (`IfSilent kill_…`). Measured by the `acceptance-upgrade-0113` job's `upgrade-apps-open` phase |
| **Windows shutdown, restart, sign-out**             | `WM_QUERYENDSESSION`, then `WM_ENDSESSION` — never `WM_CLOSE`                                                                                             | **No. Tauri/tao cannot hold it.** tao 0.35.3 `event_loop.rs:2382-2392`: _"We don't process `WM_QUERYENDSESSION` yet"_; the main window's procedure leaves it to `DefWindowProc`, which answers TRUE (end the session), and on `WM_ENDSESSION(TRUE)` tao calls `loop_destroyed()` and Windows ends the process. No `CloseRequested` is raised, so the guard is never asked. Holding a shutdown would need our own Win32 subclass of the window answering FALSE to `WM_QUERYENDSESSION` with `ShutdownBlockReasonCreate` — not built here, by the owner's instruction, and no autosave is built either                                                                                                   |

## Decisions

1. **One decision, two shells.** `close_guard.rs` (std-only) decides; `close_window.rs` wires it.
   CG Control includes both from CG Designer's shell with `#[path]`, as it includes
   `keyboard_language.rs`, so the two apps cannot come to hold a close two ways. std-only makes the
   decision testable without a window: `rustc --test` on the file alone, and
   `cargo test -p cg-control` in CI runs the same tests through CG Control's crate.
2. **Nothing holds the window until its page does.** The page arms the guard when it mounts the
   component that can answer; until then — a blank page, a page that failed before it armed, CG
   Control's Playout-address question — every close goes straight through, as before. A navigation
   lets go (`PageLoadEvent::Started`), so a page that reloads into a failure is closable.
3. **A page that cannot answer is not allowed to trap the window.** Each ask must be acknowledged
   (`close_request_seen`); a close that arrives `UNANSWERED_AFTER` (5 s) after an ask that was never
   acknowledged goes straight through, and the guard lets go. Two closes in quick succession on a
   healthy page are two asks, never a close; the dialog does not stack because the page's state is
   one boolean.
4. **The JS half is spelled once**, in `@cg/gesture` (`closeGuardDoor`) — the package that already
   holds the apps' shared headless behaviour — and reached ONLY through each app's bridge contract
   (`closeGuard: { held, hold, closeNow }`), implemented in `src/platform/` (golden rule 1). Holds are
   counted; an ask reaches the newest holder only.
5. **The Designer decides at the moment of the close**, with the same predicate as the leave prompt:
   the page holds every close while mounted and answers each one — closing at once with nothing to
   lose, asking otherwise. Arming only while dirty would leave an edit-to-arm window, and would make
   the two doors read the predicate at different times.
6. **The Designer's dialog** is the shared `Modal`: title `Unsaved changes`, the project's name in a
   `<bdi>`, the owner's buttons in the owner's order (`Save`, `Don't save`, `Cancel`), focus on
   Cancel (`ModalButton autoFocus`, the pattern seven dialogs already use), Escape / ✕ / backdrop =
   Cancel. Save follows the save-before-switch path (a write that fails asks where to save; a
   cancelled picker saves nothing and keeps the window); while a save runs nothing can dismiss the
   dialog, or a Cancel would leave a save in flight that goes on to close the window.
7. **CG Control's dialog** is the runtime's `Modal`: `Close CG Control?`, `Cancel` then `Close`
   (cancel first in DOM, the primitive's rule), focus on Cancel through `data-modal-autofocus`, and
   one fact line only when true. The `Close` action is NAMED `Close CG Control`: the primitive's ✕ is
   named `Close` and means Cancel (found by the Playwright spec — two alike-named buttons with
   opposite effects).
8. **The fact line counts the whole stack** with `airTally` — the console's one air count, over
   `isOnAirStatus` (unknown counts as on air) — not the channel on screen: closing the window leaves
   every channel's items on air, so the window-wide surface counts window-wide (the status bar's
   rule, `MULTI-CHANNEL-01` §2 L). On a one-channel console it equals the layer table's header.
9. **A `window` layer on the Modal** (z 1050): above the lock (1000), the sign-in gate (1001) and
   first-run (1002), below the anchored panels (1100) and the tooltip (3000). Without it a close
   asked while signed out would be held behind the gate — a window that silently refuses to close.
10. **Closing sends nothing.** The three commands go to the shell; nothing reaches CG Bridge or
    CasparCG and the console does not close its socket. Pinned at the wire by
    `closeConsole.dom.test.ts` against the real `WebSocketRuntime`.
11. **The browser console asks only while signed in**, through the tab's own `beforeunload`,
    registered only where there is no shell (inside CG Control the shell's dialog is the question,
    and a native prompt on top would be a second one in browser chrome). A reload the console
    starts itself — `Retry connection`, `Set up again` — does not ask (`reloadOnPurpose`).
12. **CG Designer now declares its commands** (`build.rs` `AppManifest`) and grants them in
    `capabilities/designer.json`, as CG Control does. Before, it declared none, and every command it
    registered was open to its page by default (`webview/mod.rs:1823`, `has_app_acl_manifest`).

## Verification

- Rust: `close_guard.rs` 9 tests (`rustc --test`, GNU toolchain, here; a planted defect reds 5);
  `cargo test --offline` of the whole workspace here — CG Control 14/14, CG Designer 9/9, CG Setup
  66/66, zero warnings, `tauri-build` accepting both capability files. CI's MSVC build is the
  authority.
- Unit (jsdom): Designer `close-guard.dom.test.ts` 10 (a planted second predicate reds 9);
  Runtime `closeConsole.dom.test.ts` 11; `@cg/gesture` `closeGuard.test.ts` 7.
- Browser (Playwright, Windows, non-authoritative): Designer `close-guard.spec.ts` 6, Runtime
  `close-guard.spec.ts` 2, plus the neighbouring specs named in `tasks.md`.
- Installed apps: `installer-smoke.mjs` (Windows CI runner only; `node --check` here).
