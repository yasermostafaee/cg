fn main() {
    // DESKTOP-APPS-01-A — the one app command, `set_playout_address`: its permission is
    // generated here (`allow-set-playout-address`) and granted, in `capabilities/console.json`,
    // to the console page the bridge serves and to nothing else.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["set_playout_address"]),
        ),
    )
    .expect("tauri-build failed");
}
