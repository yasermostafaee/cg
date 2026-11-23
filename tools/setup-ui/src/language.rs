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

/// Save the language beside the executable verified by Setup. Return whether it was written.
pub fn write_install_language(
    executable: &Path,
    language: SetupLanguage,
    explicitly_selected: bool,
) -> io::Result<bool> {
    if !executable.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected the installed executable",
        ));
    }
    let destination = executable.with_file_name(INSTALL_LANGUAGE_FILE);
    if !explicitly_selected && destination.try_exists()? {
        return Ok(false);
    }
    let request = temporary_suffix();
    let temporary = destination.with_extension(format!("tmp-{request}"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let result = (|| {
        file.write_all(language.code().as_bytes())?;
        if explicitly_selected {
            write!(file, "\n{request}")?;
        }
        file.sync_all()?;
        drop(file);
        if explicitly_selected {
            fs::rename(&temporary, &destination)?;
        } else {
            match publish_new_seed(&temporary, &destination) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
                Err(error) => return Err(error),
            }
        }
        Ok(true)
    })();
    let _ = fs::remove_file(&temporary);
    result
}

// A plain default must never overwrite an explicit choice, even if both installers finish together.
#[cfg(windows)]
fn publish_new_seed(temporary: &Path, destination: &Path) -> io::Result<()> {
    use windows::{core::HSTRING, Win32::Storage::FileSystem::MoveFileW};

    let source = HSTRING::from(temporary.as_os_str());
    let destination = HSTRING::from(destination.as_os_str());
    unsafe { MoveFileW(&source, &destination) }
        .map_err(|error| io::Error::from_raw_os_error(error.code().0 & 0xffff))
}

#[cfg(not(windows))]
fn publish_new_seed(temporary: &Path, destination: &Path) -> io::Result<()> {
    fs::hard_link(temporary, destination)
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
        assert!(write_install_language(&executable, SetupLanguage::English, false).is_err());
        assert!(!seed.exists());
        fs::write(&executable, b"test executable").unwrap();
        assert!(write_install_language(&executable, SetupLanguage::English, false).unwrap());
        assert_eq!(fs::read(&seed).unwrap(), b"en");
        assert!(!write_install_language(&executable, SetupLanguage::Persian, false).unwrap());
        assert_eq!(fs::read(&seed).unwrap(), b"en");
        let mut previous_request = String::new();
        for (language, code) in [
            (SetupLanguage::English, "en"),
            (SetupLanguage::Persian, "fa"),
            (SetupLanguage::Arabic, "ar"),
            (SetupLanguage::Arabic, "ar"),
        ] {
            assert!(write_install_language(&executable, language, true).unwrap());
            let saved = fs::read_to_string(&seed).unwrap();
            let (locale, request) = saved.split_once('\n').unwrap();
            assert_eq!(locale, code);
            assert!(request.split('-').all(|part| {
                !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())
            }));
            assert_ne!(request, previous_request);
            assert!(!write_install_language(&executable, SetupLanguage::English, false).unwrap());
            assert_eq!(fs::read_to_string(&seed).unwrap(), saved);
            previous_request = request.to_owned();
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

        assert!(write_install_language(&executable, SetupLanguage::Persian, true).is_err());
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
