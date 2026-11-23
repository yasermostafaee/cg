//! CG Control Setup records the initial interface language alongside the executable.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub const INSTALL_LANGUAGE_FILE: &str = "cg-control-install-language";

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum SetupLanguage {
    #[default]
    English,
    Persian,
    Arabic,
}

impl SetupLanguage {
    pub const fn code(self) -> &'static str {
        self.text("en", "fa", "ar")
    }

    pub const fn is_rtl(self) -> bool {
        !matches!(self, Self::English)
    }

    pub const fn text<'a>(self, english: &'a str, persian: &'a str, arabic: &'a str) -> &'a str {
        match self {
            Self::English => english,
            Self::Persian => persian,
            Self::Arabic => arabic,
        }
    }

    pub fn save_warning(self) -> &'static str {
        self.text(
            "CG Control was installed, but the default language could not be saved.",
            "CG Control نصب شد، اما ذخیرهٔ زبان پیشفرض ممکن نبود.",
            "ثُبّت CG Control، لكن تعذّر حفظ اللغة الافتراضية.",
        )
    }
}

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

fn temporary_suffix() -> String {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let count = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{count}", std::process::id(), time.as_nanos())
}

/// Save the choice beside the executable verified by Setup. Replace a previous seed atomically.
pub fn write_install_language(executable: &Path, language: SetupLanguage) -> io::Result<()> {
    if !executable.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected the installed executable",
        ));
    }
    let destination = executable.with_file_name(INSTALL_LANGUAGE_FILE);
    let temporary = destination.with_extension(format!("tmp-{}", temporary_suffix()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(language.code().as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &destination)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_and_atomically_replaces_only_the_language_seed() {
        let directory =
            std::env::temp_dir().join(format!("cg-setup-language-{}", temporary_suffix()));
        fs::create_dir(&directory).unwrap();
        let executable = directory.join("cg-control.exe");
        let seed = directory.join(INSTALL_LANGUAGE_FILE);
        assert!(write_install_language(&executable, SetupLanguage::English).is_err());
        assert!(!seed.exists());
        fs::write(&executable, b"test executable").unwrap();
        for (language, code) in [
            (SetupLanguage::English, b"en"),
            (SetupLanguage::Persian, b"fa"),
            (SetupLanguage::Arabic, b"ar"),
        ] {
            write_install_language(&executable, language).unwrap();
            assert_eq!(fs::read(&seed).unwrap(), code);
        }
        assert_eq!(fs::read(&executable).unwrap(), b"test executable");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_file(&seed).unwrap();
        fs::remove_file(&executable).unwrap();
        fs::remove_dir(&directory).unwrap();
    }

    #[test]
    fn a_failed_replace_leaves_no_partial_file() {
        let directory =
            std::env::temp_dir().join(format!("cg-setup-language-{}", temporary_suffix()));
        fs::create_dir(&directory).unwrap();
        let executable = directory.join("cg-control.exe");
        fs::write(&executable, b"test executable").unwrap();
        let seed = directory.join(INSTALL_LANGUAGE_FILE);
        fs::create_dir(&seed).unwrap();

        assert!(write_install_language(&executable, SetupLanguage::Persian).is_err());
        assert!(seed.is_dir());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir(&seed).unwrap();
        fs::remove_file(&executable).unwrap();
        fs::remove_dir(&directory).unwrap();
    }

    #[test]
    fn supplies_the_selected_direction_and_text() {
        assert!(!SetupLanguage::default().is_rtl());
        assert!(SetupLanguage::Persian.is_rtl());
        assert!(SetupLanguage::Arabic.is_rtl());
        assert_eq!(
            SetupLanguage::Arabic.text("English", "Persian", "Arabic"),
            "Arabic"
        );
    }
}
