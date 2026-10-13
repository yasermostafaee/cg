//! The setup's state: which page, what was found on this machine, what the user chose, and how
//! the install went. Pure — the window, the engine and the tests all drive the same model.

use crate::observe::{compare_versions, Progress};
use crate::product::{Config, Home, Product, ProductId};
use crate::server::{ServerSetup, StoredBridge};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    Welcome,
    Location,
    /// `RELEASE-0111-01` Part A — CG Bridge only: where its Playout is (`server.rs`).
    Server,
    Installing,
    Done,
    Failed,
}

/// What this run is, against what Windows lists as installed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Kind {
    Fresh,
    Update { from: String },
    Reinstall,
    Replace { from: String },
}

/// What was found on this machine before anything ran.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Facts {
    /// Installed apps' `DisplayVersion` for this product.
    pub installed_version: Option<String>,
    /// …and where it is (`InstallLocation`).
    pub installed_dir: Option<String>,
    /// The product's program is running (its engine closes it).
    pub app_running: bool,
    /// The WebView2 runtime is missing (the apps' engine installs it).
    pub webview2_missing: bool,
    pub os_is_64bit: bool,
    /// Where the product installs when nothing says otherwise.
    pub default_dir: String,
    /// CG Bridge's data folder.
    pub data_dir: Option<String>,
    /// CG Bridge's stored configuration (`cg-bridge.json`), when an install left one.
    pub bridge_config: Option<StoredBridge>,
    /// This machine's IPv4 addresses (loopback is dropped by the page).
    pub ipv4: Vec<String>,
}

impl Default for Facts {
    fn default() -> Self {
        Facts {
            installed_version: None,
            installed_dir: None,
            app_running: false,
            webview2_missing: false,
            os_is_64bit: true,
            default_dir: String::new(),
            data_dir: None,
            bridge_config: None,
            ipv4: Vec::new(),
        }
    }
}

/// The chosen folder's drive, measured.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Space {
    /// `C:`
    pub drive: String,
    pub free: Option<u64>,
    /// A file can be created there (or in the nearest folder that exists).
    pub writable: bool,
}

/// How the install ended.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Outcome {
    pub ok: bool,
    /// Why it failed, in words.
    pub reason: Option<String>,
    /// It installed, but one thing needs reading (CG Bridge's `WARNINGS:`).
    pub warning: Option<String>,
    /// CG Bridge's service, read once the engine is done.
    pub service_running: Option<bool>,
    pub exit_code: Option<u32>,
}

/// A rail step's state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepState {
    Pending,
    Current,
    Done,
    Failed,
}

/// The rail: CG Control's and CG Designer's four steps; CG Bridge has a fifth, `Playout`.
pub const STEPS: [&str; 4] = ["Welcome", "Location", "Installing", "Done"];
pub const BRIDGE_STEPS: [&str; 5] = ["Welcome", "Location", "Playout", "Installing", "Done"];
/// The most steps a rail has (the window keeps one tick animation per step).
pub const MAX_STEPS: usize = 5;

pub struct Model {
    pub product: &'static Product,
    pub config: Config,
    pub facts: Facts,
    pub kind: Kind,
    pub page: Page,
    /// The install folder the engine is given (or keeps).
    pub dir: String,
    /// The folder was given on the command line (`/D=`).
    pub dir_preset: bool,
    pub space: Space,
    /// The Done page's one option.
    pub launch: bool,
    /// The engine's real progress…
    pub progress: Progress,
    /// …and the value the bar shows, eased toward it by the window.
    pub shown: f32,
    pub outcome: Outcome,
    /// The install guide (PDF) is bundled.
    pub has_guide: bool,
    /// The user asked to cancel while the setup was still preparing.
    pub cancelling: bool,
    /// `RELEASE-0111-01` Part A — CG Bridge's separate-server page.
    pub server: ServerSetup,
}

impl Model {
    pub fn new(
        product: &'static Product,
        config: Config,
        facts: Facts,
        preset: Option<String>,
        has_guide: bool,
    ) -> Model {
        let kind = match facts.installed_version.as_deref() {
            None => Kind::Fresh,
            Some(v) => match compare_versions(v, &config.version) {
                Ordering::Less => Kind::Update {
                    from: v.to_string(),
                },
                Ordering::Equal => Kind::Reinstall,
                Ordering::Greater => Kind::Replace {
                    from: v.to_string(),
                },
            },
        };
        let dir_preset = preset.as_deref().is_some_and(|p| !p.is_empty());
        let dir = match (&preset, &facts.installed_dir) {
            (Some(p), _) if !p.is_empty() => p.clone(),
            (_, Some(d)) if !d.is_empty() => d.clone(),
            _ => facts.default_dir.clone(),
        };
        let server = ServerSetup::new(
            facts.bridge_config.as_ref(),
            &StoredBridge::default(),
            facts.ipv4.clone(),
        );
        Model {
            product,
            config,
            facts,
            kind,
            page: Page::Welcome,
            dir,
            dir_preset,
            space: Space::default(),
            launch: true,
            progress: Progress {
                fraction: 0.0,
                step: 1,
                of: 1,
                words: "Preparing",
                engine_started: false,
            },
            shown: 0.0,
            outcome: Outcome::default(),
            has_guide,
            cancelling: false,
            server,
        }
    }

    /// CG Bridge asks where its Playout is, on a page of its own (`RELEASE-0111-01` Part A).
    pub fn has_server_page(&self) -> bool {
        self.product.id == ProductId::Bridge
    }

    /// The rail's steps, for this product.
    pub fn step_labels(&self) -> &'static [&'static str] {
        if self.has_server_page() {
            &BRIDGE_STEPS
        } else {
            &STEPS
        }
    }

    pub fn is_update(&self) -> bool {
        matches!(self.kind, Kind::Update { .. })
    }

    /// The folder may be changed: a per-user product, installed for the first time. CG Bridge's
    /// folder is fixed (the Playout team's uninstall line names it), and an installed product
    /// stays where it is.
    pub fn dir_changeable(&self) -> bool {
        self.product.home == Home::LocalAppData
            && self.facts.installed_dir.is_none()
            && !self.dir_preset
    }

    /// The engine may run at all here.
    pub fn platform_ok(&self) -> bool {
        self.product.id != ProductId::Bridge || self.facts.os_is_64bit
    }

    /// The chosen folder takes the install.
    pub fn space_ok(&self) -> bool {
        self.space
            .free
            .is_none_or(|free| free >= self.config.install_bytes)
    }

    pub fn can_install(&self) -> bool {
        self.platform_ok() && self.space.writable && self.space_ok()
    }

    /// `/D=` is passed only when the folder is the user's choice; otherwise the engine keeps the
    /// installed folder (Tauri's `RestorePreviousInstallLocation`) or its own default.
    pub fn engine_dir(&self) -> Option<&str> {
        let chosen =
            self.dir_preset || (self.dir_changeable() && self.dir != self.facts.default_dir);
        chosen.then_some(self.dir.as_str())
    }

    /// Each step's state, one per `step_labels()`.
    pub fn steps(&self) -> Vec<StepState> {
        use StepState::*;
        let labels = self.step_labels();
        let at = |label: &str| labels.iter().position(|l| *l == label).unwrap_or(0);
        let (current, failed) = match self.page {
            Page::Welcome => (at("Welcome"), false),
            Page::Location => (at("Location"), false),
            Page::Server => (at("Playout"), false),
            Page::Installing => (at("Installing"), false),
            Page::Done => (labels.len(), false),
            Page::Failed => (at("Installing"), true),
        };
        (0..labels.len())
            .map(|i| match i.cmp(&current) {
                Ordering::Less => Done,
                Ordering::Equal if failed => Failed,
                Ordering::Equal => Current,
                Ordering::Greater => Pending,
            })
            .collect()
    }

    /// The page's title.
    pub fn title(&self) -> String {
        let name = self.product.name;
        let update = self.is_update();
        match self.page {
            Page::Welcome => match self.kind {
                Kind::Update { .. } => format!("Update {name}?"),
                Kind::Reinstall => format!("Reinstall {name}?"),
                Kind::Fresh | Kind::Replace { .. } => format!("Install {name}?"),
            },
            Page::Location => "Location".into(),
            Page::Server => "Playout".into(),
            Page::Installing if update => format!("Updating {name}"),
            Page::Installing => format!("Installing {name}"),
            Page::Done if update => format!("{name} is updated"),
            Page::Done => format!("{name} is installed"),
            Page::Failed if update => format!("{name} was not updated"),
            Page::Failed => format!("{name} was not installed"),
        }
    }

    /// Welcome's one line about an installed copy.
    pub fn version_line(&self) -> Option<String> {
        let (name, v) = (self.product.name, &self.config.version);
        match &self.kind {
            Kind::Fresh => None,
            Kind::Update { from } => Some(format!(
                "Update from {from} to {v}. Your settings are kept."
            )),
            Kind::Reinstall => Some(format!("{name} {v} is installed. Your settings are kept.")),
            Kind::Replace { from } => {
                Some(format!("Replace {from} with {v}. Your settings are kept."))
            }
        }
    }

    /// Lines that need reading before Next, in caution ink.
    pub fn welcome_cautions(&self) -> Vec<String> {
        let mut out = Vec::new();
        if !self.platform_ok() {
            out.push(format!("{} needs 64-bit Windows.", self.product.name));
        }
        if self.facts.app_running && self.product.id != ProductId::Bridge {
            out.push(format!("{} is open. Setup closes it.", self.product.name));
        }
        out
    }

    pub fn location_cautions(&self) -> Vec<String> {
        let mut out = Vec::new();
        if !self.space.writable {
            out.push("This folder needs administrator rights.".to_string());
        } else if !self.space_ok() {
            out.push(format!("Not enough space on {}.", self.space.drive));
        }
        out
    }
}

/// Bytes, as the window shows them.
pub fn format_bytes(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        if b >= 100.0 * GB {
            format!("{:.0} GB", b / GB)
        } else {
            format!("{:.1} GB", b / GB)
        }
    } else {
        // Rounded UP to a tenth: "Needed" never under-states.
        format!("{:.1} MB", ((b / MB) * 10.0).ceil() / 10.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::product::{MainFile, BRIDGE, CONTROL};

    fn config(product: ProductId) -> Config {
        Config {
            product,
            version: "0.10.0".into(),
            engine_name: "e.exe".into(),
            install_bytes: 19_600_000,
            main_files: vec![MainFile {
                path: "cg-control.exe".into(),
                bytes: 19_000_000,
            }],
        }
    }

    fn facts() -> Facts {
        Facts {
            default_dir: r"C:\Users\op\AppData\Local\CG Control".into(),
            ..Facts::default()
        }
    }

    #[test]
    fn a_first_install_asks_to_install_and_may_choose_a_folder() {
        let m = Model::new(&CONTROL, config(ProductId::Control), facts(), None, false);
        assert_eq!(m.kind, Kind::Fresh);
        assert_eq!(m.title(), "Install CG Control?");
        assert_eq!(m.version_line(), None);
        assert!(m.dir_changeable());
        assert_eq!(
            m.engine_dir(),
            None,
            "the default folder is the engine's own"
        );
    }

    #[test]
    fn an_older_copy_is_an_update_that_keeps_its_folder() {
        let f = Facts {
            installed_version: Some("0.9.1".into()),
            installed_dir: Some(r"D:\Apps\CG Control".into()),
            ..facts()
        };
        let mut m = Model::new(&CONTROL, config(ProductId::Control), f, None, false);
        assert_eq!(m.title(), "Update CG Control?");
        assert_eq!(
            m.version_line().unwrap(),
            "Update from 0.9.1 to 0.10.0. Your settings are kept."
        );
        assert!(!m.dir_changeable());
        assert_eq!(m.dir, r"D:\Apps\CG Control");
        assert_eq!(m.engine_dir(), None);
        m.page = Page::Done;
        assert_eq!(m.title(), "CG Control is updated");
    }

    #[test]
    fn the_same_or_a_newer_copy_is_named() {
        let same = Model::new(
            &CONTROL,
            config(ProductId::Control),
            Facts {
                installed_version: Some("0.10.0".into()),
                ..facts()
            },
            None,
            false,
        );
        assert_eq!(same.title(), "Reinstall CG Control?");
        let newer = Model::new(
            &CONTROL,
            config(ProductId::Control),
            Facts {
                installed_version: Some("0.11.0".into()),
                ..facts()
            },
            None,
            false,
        );
        assert_eq!(
            newer.version_line().unwrap(),
            "Replace 0.11.0 with 0.10.0. Your settings are kept."
        );
    }

    #[test]
    fn a_chosen_folder_reaches_the_engine() {
        let mut m = Model::new(&CONTROL, config(ProductId::Control), facts(), None, false);
        m.dir = r"D:\Broadcast\CG Control".into();
        assert_eq!(m.engine_dir(), Some(r"D:\Broadcast\CG Control"));
        let preset = Model::new(
            &CONTROL,
            config(ProductId::Control),
            facts(),
            Some(r"E:\X".into()),
            false,
        );
        assert_eq!(preset.engine_dir(), Some(r"E:\X"));
        assert!(
            !preset.dir_changeable(),
            "a /D= on the command line is the folder"
        );
    }

    #[test]
    fn cg_bridges_folder_is_fixed_and_its_platform_is_checked() {
        let f = Facts {
            os_is_64bit: false,
            default_dir: r"C:\Program Files\CG Bridge".into(),
            ..Facts::default()
        };
        let m = Model::new(&BRIDGE, config(ProductId::Bridge), f, None, false);
        assert!(!m.dir_changeable());
        assert!(!m.platform_ok());
        assert_eq!(
            m.welcome_cautions(),
            vec!["CG Bridge needs 64-bit Windows.".to_string()]
        );
    }

    #[test]
    fn a_folder_that_cannot_take_the_install_says_why() {
        let mut m = Model::new(&CONTROL, config(ProductId::Control), facts(), None, false);
        m.space = Space {
            drive: "C:".into(),
            free: Some(1000),
            writable: true,
        };
        assert!(!m.can_install());
        assert_eq!(
            m.location_cautions(),
            vec!["Not enough space on C:.".to_string()]
        );
        m.space.writable = false;
        assert_eq!(
            m.location_cautions(),
            vec!["This folder needs administrator rights.".to_string()]
        );
        m.space = Space {
            drive: "C:".into(),
            free: Some(1 << 40),
            writable: true,
        };
        assert!(m.can_install());
    }

    #[test]
    fn bytes_read_as_the_window_writes_them() {
        assert_eq!(format_bytes(19_600_000), "18.7 MB");
        assert_eq!(format_bytes(126_000_000_000), "117 GB");
        assert_eq!(format_bytes(5 * 1024 * 1024 * 1024), "5.0 GB");
    }
}
