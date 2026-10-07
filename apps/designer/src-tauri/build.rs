fn main() {
    // The app's own commands, and the permission each generates (`allow-keyboard-language`,
    // `allow-close-guard`, `allow-close-request-seen`, `allow-close-window-now`), granted in
    // `capabilities/designer.json` to the window the app bundles and to nothing else:
    //   - `keyboard_language` (`TEXT-DIGITS-01`): read-only;
    //   - `close_guard`, `close_request_seen`, `close_window_now` (`D-162`): the window's close,
    //     held for the page to answer (`src/close_window.rs`).
    // Declaring them is what puts the app's commands under the capability: before `D-162` the
    // Designer declared none, and every command it registered was open to its page by default.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "keyboard_language",
            "close_guard",
            "close_request_seen",
            "close_window_now",
        ])),
    )
    .expect("tauri-build failed");
}
