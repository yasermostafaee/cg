# The installed apps' close is held and asked about (D-162, R-094 — `RELEASE-0114-01-B`)

## Why

Both installed apps close without asking. A Tauri window runs no `beforeunload` when it is closed —
WebView2 is torn down with the window, it is not navigated — so the Designer's browser warning
(`D-088`) never fires in CG Designer, and an author who presses × with unsaved work loses it
silently. CG Control closes the same way on any slip: the title bar's ×, Alt+F4, the taskbar's
Close window. The owner: _CG Designer must warn about unsaved work, and CG Control must not close
on a slip._

## What Changes

- **The shells hold the close.** ONE decision (`apps/designer/src-tauri/src/close_guard.rs`,
  std-only, unit-tested) and its Tauri half (`close_window.rs`), shared by both shells with
  `#[path]` as `keyboard_language.rs` already is. Every `WindowEvent::CloseRequested` is decided:
  nothing holds the window until its page arms the guard; a held close is prevented and the page is
  asked with one DOM event (`cg:close-requested`, sent by `eval`); the page answers through three
  new commands — `close_guard { armed }`, `close_request_seen`, `close_window_now` — declared in
  each `build.rs` and granted in each app's capability file. A navigation lets go, so a page that
  failed to load can always be closed; a page that never answers lets the next close through after
  5 s. CG Designer now declares its commands and grants them (`capabilities/designer.json`), as
  CG Control does.
- **The JS half is spelled once**: `@cg/gesture`'s `closeGuardDoor`, behind each app's bridge
  contract (`closeGuard: { held, hold, closeNow }`) and implemented in `src/platform/` (golden rule 1).
- **D-162 — CG Designer.** ONE predicate, `hasUnsavedChanges` (store-core; golden rule 6), now asked
  by the browser's leave prompt, the window close and both save-before-switch guards. With unsaved
  changes a held close opens ONE `Unsaved changes` dialog (the shared Modal): the project's name,
  `Save` / `Don't save` / `Cancel`, focus on Cancel. Save saves then closes; a failed save keeps the
  window open and shows the reason. With none, the window closes at once, as before. The browser
  keeps its warning.
- **R-094 — CG Control.** A held close opens ONE `Close CG Control?` dialog (the runtime's Modal, on
  a new `window` layer above the lock, the sign-in gate and first-run): `Cancel` / `Close`, focus on
  Cancel, Escape = Cancel, and one fact line only when true — `N items stay on air.` /
  `1 item stays on air.` — counted by `airTally` over the stack the console holds. Closing sends
  NOTHING to CG Bridge or CasparCG: it is a window close, not a CLEAR. The browser console gains the
  tab's own leave prompt while signed in; a reload the console starts itself does not ask.
- **The desktop smoke** drives both: WM_CLOSE on the main window, the dialog shown while the window
  stays, Cancel keeps it, Don't save / Close ends it, and a Designer with no change closes at once;
  each dialog's picture is kept in the evidence folder.

## Not changed, and said

- **Windows shutdown and sign-out cannot be held.** tao does not process `WM_QUERYENDSESSION` and
  ends the event loop on `WM_ENDSESSION`; no close request reaches the shell (`design.md` §0.3).
  No autosave is built.
- Forced ends (`taskkill /F`, a crash, an installer's process kill) run no page code and are not a
  slip of the hand.

## Impact

- `apps/designer/src-tauri/**`, `apps/runtime/src-tauri/**` (both shells; a new capability file).
- `packages/gesture` (one new module), both bridge contracts, both platforms, both renderers.
- `apps/runtime/src/renderer/ui/Modal.tsx` — the `window` layer.
- `apps/runtime/tests/desktop/installer-smoke.mjs` — the smoke closes the apps through the guard.
- Specs: `designer-project-persistence`, `desktop-delivery`, `runtime-ui` (ADDED requirements).
