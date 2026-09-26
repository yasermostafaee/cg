//! CG Control — the desktop shell for the Runtime console and its bridge (ADR 0011).
//!
//! The window never holds the console itself. It starts the bridge sidecar, waits until the
//! bridge answers on the console origin, and then loads the console FROM the bridge at
//! `http://127.0.0.1:5174`. That keeps two things true with no console change: the console
//! derives its bridge address from the host that served it, and its origin is one fixed string
//! on every install — the one entry a client Playout's CORS list needs.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent};

fn main() {
    sidecar::install_panic_log();
    sidecar::log("CG Control starting");
    let app = tauri::Builder::default()
        // Registered first, so a second launch is caught before anything else starts: it
        // focuses the window that is already open, and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            sidecar::log("a second launch focused the open window");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(sidecar::Bridge::default())
        // `FIELD-FIXES-01` G — NO NATIVE MENU. Its one submenu, titled "CG Control", was the
        // second line under the title bar that repeated the name. Its three items live on:
        // Quit is the window's close button (the exit stops the bridge, below); Reload is F5,
        // which the console leaves to WebView2; and "Open bridge log" is a console button
        // (the audit log's tools row) through `open_bridge_log`.
        .invoke_handler(tauri::generate_handler![
            sidecar::set_playout_address,
            sidecar::open_bridge_log
        ])
        // A start failure can land before the starting page has loaded its script; replaying it
        // on every finished load is what makes the failure impossible to miss.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                sidecar::log(&format!("page loaded: {}", payload.url()));
                sidecar::replay_failure(webview);
            }
        })
        .setup(|app| {
            sidecar::log("setup: starting the bridge thread");
            let handle = app.handle().clone();
            std::thread::spawn(move || sidecar::start(&handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("CG Control could not start");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            sidecar::log("exit: stopping the bridge");
            sidecar::stop(app);
        }
    });
}
