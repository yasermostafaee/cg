// CG Setup's manifest, compiled in (no resource compiler needed, MSVC or GNU):
//
// - asInvoker: CG Control's and CG Designer's installers install per user, without administrator
//   rights. Without a manifest Windows' installer detection would elevate any 32-bit program
//   called "…setup…". `cg-setup-pack` turns this into requireAdministrator for CG Bridge, whose
//   installer has always asked for administrator rights before anything runs.
// - Per-monitor DPI awareness (v2): the window draws itself sharp at every scale.
// - Common Controls v6 (the builder's default): the system folder picker looks current.
fn main() {
    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        use embed_manifest::manifest::{DpiAwareness, ExecutionLevel, Setting};
        use embed_manifest::{embed_manifest, new_manifest};
        embed_manifest(
            new_manifest("Apasai.CG.Setup")
                .dpi_awareness(DpiAwareness::PerMonitorV2)
                .long_path_aware(Setting::Enabled)
                .requested_execution_level(ExecutionLevel::AsInvoker),
        )
        .expect("the manifest could not be embedded");
    }
    println!("cargo:rerun-if-changed=build.rs");
}
