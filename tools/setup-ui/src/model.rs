//! The setup's state: which page, what was found on this machine, what the user chose, and how
//! the install went. Pure — the window, the engine and the tests all drive the same model.

use crate::language::SetupLanguage;
use crate::observe::{compare_versions, Progress};
use crate::product::{Config, Home, Product, ProductId};
use crate::server::{ServerSetup, StoredBridge, PLAYOUT_ENGINE_NAME};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Page {
    Language,
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

/// Stable rail identities, independent of their display language.
const STEPS: &[Page] = &[Page::Welcome, Page::Location, Page::Installing, Page::Done];
const CONTROL_STEPS: &[Page] = &[
    Page::Language,
    Page::Welcome,
    Page::Location,
    Page::Installing,
    Page::Done,
];
const BRIDGE_STEPS: &[Page] = &[
    Page::Welcome,
    Page::Location,
    Page::Server,
    Page::Installing,
    Page::Done,
];
/// The most steps a rail has (the window keeps one tick animation per step).
pub const MAX_STEPS: usize = 5;

pub struct Model {
    pub product: &'static Product,
    pub config: Config,
    pub facts: Facts,
    pub kind: Kind,
    pub page: Page,
    pub language: SetupLanguage,
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
            page: if product.id == ProductId::Control {
                Page::Language
            } else {
                Page::Welcome
            },
            language: SetupLanguage::default(),
            dir,
            dir_preset,
            space: Space::default(),
            launch: true,
            progress: Progress {
                fraction: 0.0,
                step: 1,
                of: 1,
                words: "Preparing",
                waiting: false,
                copy: None,
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

    pub fn choose_language(&mut self, language: SetupLanguage) -> bool {
        if self.product.id != ProductId::Control
            || self.page != Page::Language
            || self.language == language
        {
            return false;
        }
        self.language = language;
        true
    }

    pub fn next_page(&self) -> Option<Page> {
        match self.page {
            Page::Language => Some(Page::Welcome),
            Page::Welcome => Some(Page::Location),
            Page::Location if self.has_server_page() => Some(Page::Server),
            _ => None,
        }
    }

    pub fn previous_page(&self) -> Option<Page> {
        match self.page {
            Page::Welcome if self.product.id == ProductId::Control => Some(Page::Language),
            Page::Location => Some(Page::Welcome),
            Page::Server => Some(Page::Location),
            _ => None,
        }
    }

    fn step_pages(&self) -> &'static [Page] {
        match self.product.id {
            ProductId::Control => CONTROL_STEPS,
            ProductId::Bridge => BRIDGE_STEPS,
            ProductId::Designer => STEPS,
        }
    }

    pub fn step_labels(&self) -> Vec<&'static str> {
        let l = self.language;
        self.step_pages()
            .iter()
            .map(|page| match page {
                Page::Language => l.text("Language", "زبان", "اللغة"),
                Page::Welcome => l.text("Welcome", "خوش‌آمد", "مرحبًا"),
                Page::Location => l.text("Location", "محل نصب", "موقع التثبيت"),
                Page::Server if self.server.standalone => "CasparCG",
                Page::Server => PLAYOUT_ENGINE_NAME,
                Page::Installing | Page::Failed => {
                    l.text("Installing", "در حال نصب", "جارٍ التثبيت")
                }
                Page::Done => l.text("Done", "پایان", "تم"),
            })
            .collect()
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
        let pages = self.step_pages();
        let failed = self.page == Page::Failed;
        let target = if failed { Page::Installing } else { self.page };
        let current = if self.page == Page::Done {
            pages.len()
        } else {
            pages.iter().position(|&page| page == target).unwrap_or(0)
        };
        (0..pages.len())
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
        let l = self.language;
        let text = match self.page {
            Page::Language => l.text("Choose a language", "انتخاب زبان", "اختر اللغة"),
            Page::Welcome => match self.kind {
                Kind::Update { .. } => l.text(
                    "Update {name}?",
                    "{name} به‌روزرسانی شود؟",
                    "هل تريد تحديث {name}؟",
                ),
                Kind::Reinstall => l.text(
                    "Reinstall {name}?",
                    "{name} دوباره نصب شود؟",
                    "هل تريد إعادة تثبيت {name}؟",
                ),
                Kind::Fresh | Kind::Replace { .. } => l.text(
                    "Install {name}?",
                    "{name} نصب شود؟",
                    "هل تريد تثبيت {name}؟",
                ),
            },
            Page::Location => l.text("Location", "محل نصب", "موقع التثبيت"),
            Page::Server if self.server.standalone => "CasparCG",
            Page::Server => PLAYOUT_ENGINE_NAME,
            Page::Installing if self.is_update() => l.text(
                "Updating {name}",
                "در حال به‌روزرسانی {name}",
                "جارٍ تحديث {name}",
            ),
            Page::Installing => {
                l.text("Installing {name}", "در حال نصب {name}", "جارٍ تثبيت {name}")
            }
            Page::Done if self.is_update() => l.text(
                "{name} is updated",
                "{name} به‌روزرسانی شد",
                "تم تحديث {name}",
            ),
            Page::Done => l.text("{name} is installed", "{name} نصب شد", "تم تثبيت {name}"),
            Page::Failed if self.is_update() => l.text(
                "{name} was not updated",
                "{name} به‌روزرسانی نشد",
                "تعذّر تحديث {name}",
            ),
            Page::Failed => l.text(
                "{name} was not installed",
                "{name} نصب نشد",
                "تعذّر تثبيت {name}",
            ),
        };
        text.replace("{name}", self.product.name)
    }

    /// Welcome's one line about an installed copy.
    pub fn version_line(&self) -> Option<String> {
        let l = self.language;
        let (text, previous) = match &self.kind {
            Kind::Fresh => return None,
            Kind::Update { from } => (
                l.text(
                    "Update from {previous} to {version}. Your settings are kept.",
                    "به‌روزرسانی از {previous} به {version}. تنظیمات شما حفظ می‌شود.",
                    "التحديث من {previous} إلى {version}. ستُحفظ إعداداتك.",
                ),
                Some(from),
            ),
            Kind::Reinstall => (
                l.text(
                    "{name} {version} is installed. Your settings are kept.",
                    "{name} نسخهٔ {version} نصب است. تنظیمات شما حفظ می‌شود.",
                    "الإصدار {version} من {name} مثبت. ستُحفظ إعداداتك.",
                ),
                None,
            ),
            Kind::Replace { from } => (
                l.text(
                    "Replace {previous} with {version}. Your settings are kept.",
                    "نسخهٔ {previous} با {version} جایگزین می‌شود. تنظیمات شما حفظ می‌شود.",
                    "سيُستبدل الإصدار {previous} بالإصدار {version}. ستُحفظ إعداداتك.",
                ),
                Some(from),
            ),
        };
        let text = text
            .replace("{version}", &self.config.version)
            .replace("{name}", self.product.name);
        Some(match previous {
            Some(from) => text.replace("{previous}", from),
            None => text,
        })
    }

    /// Lines that need reading before Next, in caution ink.
    pub fn welcome_cautions(&self) -> Vec<String> {
        let l = self.language;
        let mut out = Vec::new();
        if !self.platform_ok() {
            out.push(format!("{} needs 64-bit Windows.", self.product.name));
        }
        if self.facts.app_running && self.product.id != ProductId::Bridge {
            out.push(
                l.text(
                    "{name} is open. Setup closes it.",
                    "{name} باز است. نصب‌کننده آن را می‌بندد.",
                    "{name} مفتوح. سيغلقه برنامج التثبيت.",
                )
                .replace("{name}", self.product.name),
            );
        }
        out
    }

    pub fn location_cautions(&self) -> Vec<String> {
        let l = self.language;
        if !self.space.writable {
            return vec![l
                .text(
                    "This folder needs administrator rights.",
                    "این پوشه به دسترسی مدیر نیاز دارد.",
                    "يتطلب هذا المجلد صلاحيات المسؤول.",
                )
                .to_string()];
        }
        if !self.space_ok() {
            return vec![l
                .text(
                    "Not enough space on {drive}.",
                    "فضای کافی روی درایو {drive} نیست.",
                    "المساحة غير كافية على محرك الأقراص {drive}.",
                )
                .replace("{drive}", &self.space.drive)];
        }
        Vec::new()
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
    use crate::product::{MainFile, BRIDGE, CONTROL, DESIGNER};

    fn config(product: ProductId) -> Config {
        Config {
            product,
            version: "0.10.0".into(),
            build_id: None,
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
    fn only_control_starts_on_language_and_uses_stable_transitions() {
        let mut m = Model::new(&CONTROL, config(ProductId::Control), facts(), None, false);
        assert_eq!(m.page, Page::Language);
        assert_eq!(m.language, SetupLanguage::English);
        assert_eq!(m.steps()[0], StepState::Current);
        assert_eq!(
            m.step_labels(),
            ["Language", "Welcome", "Location", "Installing", "Done"]
        );
        assert!(m.choose_language(SetupLanguage::Persian));
        assert_eq!(m.step_labels()[0], "زبان");
        assert_eq!(m.title(), "انتخاب زبان");
        assert_eq!(m.steps()[0], StepState::Current);
        m.page = m.next_page().unwrap();
        assert_eq!(m.page, Page::Welcome);
        assert_eq!(m.steps()[0], StepState::Done);
        assert_eq!(m.previous_page(), Some(Page::Language));
        assert_eq!(m.next_page(), Some(Page::Location));
        assert!(!m.choose_language(SetupLanguage::Arabic));
        assert_eq!(m.title(), "CG Control نصب شود؟");
        m.page = Page::Failed;
        assert_eq!(m.steps()[3], StepState::Failed);

        for product in [&DESIGNER, &BRIDGE] {
            let mut model = Model::new(product, config(product.id), facts(), None, false);
            assert_eq!(model.page, Page::Welcome);
            assert_eq!(model.previous_page(), None);
            assert!(!model.choose_language(SetupLanguage::Arabic));
        }
    }

    #[test]
    fn a_first_install_asks_to_install_and_may_choose_a_folder() {
        let mut m = Model::new(&CONTROL, config(ProductId::Control), facts(), None, false);
        m.page = Page::Welcome;
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
        m.page = Page::Welcome;
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
        let mut same = Model::new(
            &CONTROL,
            config(ProductId::Control),
            Facts {
                installed_version: Some("0.10.0".into()),
                ..facts()
            },
            None,
            false,
        );
        same.page = Page::Welcome;
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
