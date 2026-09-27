//! CG Designer — the template editor as a Windows app (ADR 0011).
//!
//! The Designer's built `dist` is bundled inside the app and served from `http://tauri.localhost`,
//! which Chromium counts as a secure context, so OPFS and the file pickers the Designer already
//! uses in a browser work unchanged. It needs no bridge and opens no port.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// `TEXT-DIGITS-01` — the one read-only command: which keyboard language the window types in.
mod keyboard_language;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![keyboard_language::keyboard_language])
        .run(tauri::generate_context!())
        .expect("CG Designer could not start");
}
