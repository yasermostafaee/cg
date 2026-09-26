fn main() {
    // DESKTOP-APPS-01-A — the app commands, `set_playout_address` and (`FIELD-FIXES-01` G)
    // `open_bridge_log`: their permissions are generated here (`allow-set-playout-address`,
    // `allow-open-bridge-log`) and granted, in `capabilities/console.json`, to the console page
    // the bridge serves and to nothing else.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["set_playout_address", "open_bridge_log"]),
        ),
    )
    .expect("tauri-build failed");
}
