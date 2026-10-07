//! CG Control — the console (ADR 0011; `CENTRAL-BRIDGE-01`).
//!
//! The window holds the console itself, bundled with the app (`http://tauri.localhost`). There is
//! no bridge here any more: CG Bridge is ONE service on the Playout machine, and every console
//! connects to it over the network (`ws://<Playout host>:5280`, or the address a station admin set).
//! So this shell runs no bridge and opens no port. It keeps four jobs:
//!
//!   - one window (a second launch focuses the first);
//!   - the Playout sign-in, natively, with no `Origin` (`playout::playout_post`, rule 8);
//!   - the keyboard language the window types in (`TEXT-DIGITS-01`);
//!   - `R-091`: when CG Bridge's address is THIS machine and nothing answers, what Windows says about
//!     it, and the two steps a person may ask for — start its service, free its port from a holder
//!     of OURS — each as its own administrator step (`local_bridge`).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_bridge;
mod playout;
mod shell_log;

// `TEXT-DIGITS-01` — the keyboard language the window types in: ONE source file, shared with CG
// Designer's shell, so the two apps cannot come to read the layout two ways.
#[path = "../../../designer/src-tauri/src/keyboard_language.rs"]
mod keyboard_language;

use tauri::webview::PageLoadEvent;
use tauri::Manager;

/// `R-091` — the page's read of CG Bridge on `host` (here or elsewhere). Blocking, off the main thread.
#[tauri::command]
async fn local_bridge_state(host: String) -> Result<local_bridge::LocalBridge, String> {
    tauri::async_runtime::spawn_blocking(move || local_bridge::state(&host))
        .await
        .map_err(|e| e.to_string())
}

/// `R-091` — the page's two administrator steps: `start` the service, `free` a holder of ours.
#[tauri::command]
async fn local_bridge_act(
    action: String,
    pid: Option<u32>,
) -> Result<local_bridge::ActOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || local_bridge::act_on(&action, pid))
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    // 🔴 `R-091` — relaunched elevated to start CG Bridge's service or free a port of ours: do that ONE
    // thing and exit, before anything of the app (its log, its window, its single-instance hand-off).
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = local_bridge::service_verb(&args) {
        std::process::exit(code);
    }
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
            keyboard_language::keyboard_language,
            local_bridge_state,
            local_bridge_act
        ])
        .on_page_load(|_webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                shell_log::log(&format!("page loaded: {}", payload.url()));
            }
        })
        .run(tauri::generate_context!())
        .expect("CG Control could not start");
}
