//! 🔴 `D-162` (CG Designer) / `R-094` (CG Control) — **THE TAURI HALF OF THE CLOSE GUARD**:
//! `close_guard.rs` decides, this file wires the decision to the window. Shared by both shells
//! (CG Control includes it with `#[path]`, as it does `keyboard_language.rs`).
//!
//! A Tauri window does not run the page's `beforeunload` when it is closed — WebView2 is torn down
//! with the window, it is not navigated — so the shell holds the close itself: every
//! `WindowEvent::CloseRequested` is decided here, and a held one is prevented
//! (`CloseRequestApi::prevent_close`) while the page is asked.
//!
//! THE PROTOCOL, spelled once on each side (the JS half is `@cg/gesture`'s `closeGuard.ts`):
//!   - the page is asked with ONE DOM event on its window, `cg:close-requested`, sent by `eval` —
//!     which needs no permission and no event plugin;
//!   - `close_guard { armed }` — the page holds every close it can be asked about, or lets go;
//!   - `close_request_seen` — the page has the ask: it is alive and answering;
//!   - `close_window_now` — the page has answered: the window closes with no further question
//!     (`destroy`, which emits no second `CloseRequested`).
//! The three commands are each app's own, listed in its `build.rs` and granted in its capability
//! file to the window the app bundles and to nothing else.
//!
//! The builder registers two hooks: every window event (`on_window_event`), and every page load
//! (`on_page_load` — a navigation lets go, so a page that never arms can always be closed).

use std::time::Instant;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{Manager, State, Webview, WebviewWindow, Window, WindowEvent};

use crate::close_guard::{Decision, Guard};

/// The ask: one DOM event on the page's window (`CLOSE_REQUESTED_EVENT` in `@cg/gesture`).
const ASK_THE_PAGE: &str = "window.dispatchEvent(new Event('cg:close-requested'))";

/// The page holds every close it can be asked about (`armed: true`), or lets go.
#[tauri::command]
pub fn close_guard(armed: bool, guard: State<'_, Guard>) {
    guard.set_armed(armed);
}

/// The page has the ask: it is answering, so the next close is asked again rather than let through.
#[tauri::command]
pub fn close_request_seen(guard: State<'_, Guard>) {
    guard.answered();
}

/// The page has answered: close the window now. `destroy` emits no `CloseRequested`, so nothing
/// asks a second time.
#[tauri::command]
pub fn close_window_now(window: WebviewWindow, guard: State<'_, Guard>) -> Result<(), String> {
    guard.set_armed(false);
    window.destroy().map_err(|err| err.to_string())
}

/// Every window event. A close request is decided by the guard; the line it returns says what
/// happened to it, for a shell that keeps a log (CG Control's `shell.log`). Every other event:
/// `None`.
pub fn on_window_event(window: &Window, event: &WindowEvent) -> Option<&'static str> {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return None;
    };
    let guard = window.state::<Guard>();
    Some(match guard.close_requested(Instant::now()) {
        Decision::Close => "a close went through: nothing holds the window",
        Decision::CloseUnanswered => "a close went through: the page did not answer the last one",
        Decision::AskPage => {
            let asked = window
                .get_webview_window(window.label())
                .map(|page| page.eval(ASK_THE_PAGE));
            if let Some(Ok(())) = asked {
                api.prevent_close();
                "a close was held: the page is asked"
            } else {
                // A page that cannot be asked cannot answer: the window closes rather than hangs.
                guard.set_armed(false);
                "a close went through: the page could not be asked"
            }
        }
    })
}

/// Every page load. A page that starts to load lets go of whatever the last page held.
pub fn on_page_load(webview: &Webview, payload: &PageLoadPayload<'_>) {
    if payload.event() == PageLoadEvent::Started {
        webview.state::<Guard>().page_loading();
    }
}
