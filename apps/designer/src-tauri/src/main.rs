//! CG Designer — the template editor as a Windows app (ADR 0011).
//!
//! The Designer's built `dist` is bundled inside the app and served from `http://tauri.localhost`,
//! which Chromium counts as a secure context, so OPFS and the file pickers the Designer already
//! uses in a browser work unchanged. It needs no bridge and opens no port.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// `D-162` — the window's close, held for the page to answer: the decision, and its Tauri half.
// Both files are shared with CG Control's shell, which includes them with `#[path]`.
mod close_guard;
mod close_window;
// `TEXT-DIGITS-01` — the one read-only command: which keyboard language the window types in.
mod keyboard_language;

fn main() {
    tauri::Builder::default()
        // `D-162` — whether the page holds the window's close (the page arms it once it can ask
        // about unsaved changes; until then, and after any navigation, a close goes through).
        .manage(close_guard::Guard::default())
        .invoke_handler(tauri::generate_handler![
            keyboard_language::keyboard_language,
            close_window::close_guard,
            close_window::close_request_seen,
            close_window::close_window_now
        ])
        // `D-162` — every close request: held and asked about while the page holds it.
        .on_window_event(|window, event| {
            let _ = close_window::on_window_event(window, event);
        })
        // `D-162` — a page that starts to load lets go of what the last one held.
        .on_page_load(|webview, payload| close_window::on_page_load(webview, payload))
        .run(tauri::generate_context!())
        .expect("CG Designer could not start");
}
