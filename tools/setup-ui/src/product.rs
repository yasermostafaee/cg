//! The three products this one front end installs, and what each one's setup says.
//!
//! ⚠ Every user-facing sentence of the setup window lives in this file (and the page titles in
//! `layout.rs`). Change one and sweep for the OLD wording (golden rule 9): the clean-Windows smoke
//! reads several of them back through UI Automation.

use crate::icons::Icon;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProductId {
    Bridge,
    Control,
    Designer,
}

/// What `cg-setup-pack` stamps into each installer: the release, read from every file that
/// carries it (`tools/release/src/release-version.mjs`) — never typed by hand — and the sizes the
/// window shows and measures progress against.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub product: ProductId,
    pub version: String,
    /// The engine's file name (today's installer, as NSIS built it).
    pub engine_name: String,
    /// What the engine copies to disk, in bytes ("Space · Needed").
    pub install_bytes: u64,
    /// The program files whose bytes landing ARE the "Copying files" step.
    pub main_files: Vec<MainFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MainFile {
    /// Relative to the install folder.
    pub path: String,
    pub bytes: u64,
}

/// Where a product installs by default.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Home {
    /// `%LOCALAPPDATA%\<name>` — Tauri's per-user default, which the user may change.
    LocalAppData,
    /// `%ProgramW6432%\<name>` — CG Bridge's, fixed: the Playout team's uninstall line names it.
    ProgramFiles,
}

pub struct Product {
    pub id: ProductId,
    /// "CG Control" — the product's own name everywhere Windows shows it.
    pub name: &'static str,
    /// The wordmark's role, as the splash sets it: `CG` heavy, this light.
    pub role: &'static str,
    pub home: Home,
    /// Under HKCU (per user) or HKLM's 64-bit view (per machine).
    pub uninstall_key: &'static str,
    /// The program a Finish launches, and a running copy of which the engine closes.
    pub main_exe: &'static str,
    /// The two or three short lines: what it installs.
    pub lines: &'static [(Icon, &'static str)],
    /// Its engine installs the WebView2 runtime when it is missing.
    pub uses_webview2: bool,
    /// The Done page's one option.
    pub launch_label: &'static str,
    /// The B-290 tile it wears: the dark one (CG Control's) or the light one (CG Designer's).
    pub dark_tile: bool,
}

pub const PUBLISHER: &str = "APASAI";

pub const BRIDGE: Product = Product {
    id: ProductId::Bridge,
    name: "CG Bridge",
    role: "Bridge",
    home: Home::ProgramFiles,
    uninstall_key: r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CGBridge",
    main_exe: "cg-bridge.exe",
    lines: &[
        (
            Icon::Server,
            "A Windows service · ports 5280, 7911 · UDP 6251",
        ),
        (Icon::Users, "Per machine · starts with Windows"),
    ],
    uses_webview2: false,
    launch_label: "Open CG Bridge status",
    // CG Bridge has no window of its own; it is CG Control's service, so it wears CG Control's tile.
    dark_tile: true,
};

pub const CONTROL: Product = Product {
    id: ProductId::Control,
    name: "CG Control",
    role: "Control",
    home: Home::LocalAppData,
    uninstall_key: r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CG Control",
    main_exe: "cg-control.exe",
    lines: &[
        (Icon::Monitor, "The playout console · connects to CG Bridge"),
        (Icon::User, "This user only · no administrator rights"),
    ],
    uses_webview2: true,
    launch_label: "Launch when ready",
    dark_tile: true,
};

pub const DESIGNER: Product = Product {
    id: ProductId::Designer,
    name: "CG Designer",
    role: "Designer",
    home: Home::LocalAppData,
    uninstall_key: r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CG Designer",
    main_exe: "cg-designer.exe",
    lines: &[
        (
            Icon::PenTool,
            "The template designer · exports .vcg packages",
        ),
        (Icon::User, "This user only · no administrator rights"),
    ],
    uses_webview2: true,
    launch_label: "Launch when ready",
    dark_tile: false,
};

pub fn product(id: ProductId) -> &'static Product {
    match id {
        ProductId::Bridge => &BRIDGE,
        ProductId::Control => &CONTROL,
        ProductId::Designer => &DESIGNER,
    }
}

/// The WebView2 line, shown only when the runtime is missing (the engine then installs it).
pub const WEBVIEW2_LINE: &str = "Microsoft WebView2 runtime";
/// CG Bridge's data folder, kept by an uninstall.
pub const BRIDGE_DATA: &str = "CG Bridge";
/// CG Bridge's service, as Windows names it.
pub const BRIDGE_SERVICE: &str = "CGBridge";
