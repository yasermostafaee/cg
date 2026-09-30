fn main() {
    // The app's own commands, and the permission each generates (`allow-playout-post`,
    // `allow-keyboard-language`), granted in `capabilities/console.json` to the console the app
    // bundles and to nothing else:
    //   - `playout_post` (`CENTRAL-BRIDGE-01` rule 8): the console's D1/D2, natively, with no `Origin`;
    //   - `keyboard_language` (`TEXT-DIGITS-01`): read-only.
    // `set_playout_address` and `open_bridge_log` are gone with the bridge this app no longer runs.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["playout_post", "keyboard_language"]),
        ),
    )
    .expect("tauri-build failed");
}
