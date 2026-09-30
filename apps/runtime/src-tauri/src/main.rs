//! CG Control — the console (ADR 0011; `CENTRAL-BRIDGE-01`).
//!
//! The window holds the console itself, bundled with the app (`http://tauri.localhost`). There is
//! no bridge here any more: CG Bridge is ONE service on the Playout machine, and every console
//! connects to it over the network (`ws://<Playout host>:5280`, or the address a station admin set).
//! So this shell starts nothing, stops nothing and opens no port. It keeps three jobs:
//!
//!   - one window (a second launch focuses the first);
//!   - the Playout sign-in, natively, with no `Origin` (`playout::playout_post`, rule 8);
//!   - the keyboard language the window types in (`TEXT-DIGITS-01`).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod playout;
mod shell_log;

// `TEXT-DIGITS-01` — the keyboard language the window types in: ONE source file, shared with CG
// Designer's shell, so the two apps cannot come to read the layout two ways.
#[path = "../../../designer/src-tauri/src/keyboard_language.rs"]
mod keyboard_language;

use tauri::webview::PageLoadEvent;
use tauri::Manager;

fn main() {
    shell_log::install_panic_log();
    shell_log::log("CG Control starting");
    tauri::Builder::default()
        // Registered first, so a second launch is caught before anything else starts: it focuses
        // the window that is already open, and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            shell_log::log("a second launch focused the open window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            playout::playout_post,
            keyboard_language::keyboard_language
        ])
        .on_page_load(|_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                shell_log::log(&format!("page loaded: {}", payload.url()));
            }
        })
        .run(tauri::generate_context!())
        .expect("CG Control could not start");
}
