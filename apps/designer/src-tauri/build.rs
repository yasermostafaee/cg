fn main() {
    // The app's own commands, and the permission each generates (`allow-keyboard-language`,
    // `allow-close-guard`, `allow-close-request-seen`, `allow-close-window-now`,
    // `allow-pick-text-source-file`, `allow-reload-text-source-file`), granted in
    // `capabilities/designer.json` to the window the app bundles and to nothing else:
    //   - `keyboard_language` (`TEXT-DIGITS-01`): read-only;
    //   - `close_guard`, `close_request_seen`, `close_window_now` (`D-162`): the window's close,
    //     held for the page to answer (`src/close_window.rs`).
    //   - `pick_text_source_file`, `reload_text_source_file`, `save_text_source_sample` (`B-356` /
    //     `D-180`): choose one bounded UTF-8 file, re-read only that session-authorized path, or
    //     save generated JSON only to the destination the author picks (`src/text_source_file.rs`).
    // Declaring them is what puts the app's commands under the capability: before `D-162` the
    // Designer declared none, and every command it registered was open to its page by default.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "keyboard_language",
            "close_guard",
            "close_request_seen",
            "close_window_now",
            "pick_text_source_file",
            "reload_text_source_file",
            "pick_structured_rows_file",
            "reload_structured_rows_file",
            "save_text_source_sample",
        ]),
    ))
    .expect("tauri-build failed");
}
