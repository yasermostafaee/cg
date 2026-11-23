//! Read the locale chosen by interactive CG Control Setup.

use std::{env, fs, path::Path};

const FILE_NAME: &str = "cg-control-install-language";

pub fn initialization_script() -> Option<&'static str> {
    script_next_to(&env::current_exe().ok()?)
}

fn script_next_to(executable: &Path) -> Option<&'static str> {
    let selected = fs::read_to_string(executable.parent()?.join(FILE_NAME)).ok()?;
    match selected.trim_start_matches('\u{feff}').trim() {
        "en" => Some("globalThis.__CG_INSTALL_LANGUAGE__ = 'en';"),
        "fa" => Some("globalThis.__CG_INSTALL_LANGUAGE__ = 'fa';"),
        "ar" => Some("globalThis.__CG_INSTALL_LANGUAGE__ = 'ar';"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reads_only_supported_utf8_languages_next_to_the_executable() -> std::io::Result<()> {
        let salt = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let folder =
            env::temp_dir().join(format!("cg-install-language-{}-{salt}", std::process::id()));
        fs::create_dir(&folder)?;
        let executable = folder.join("cg-control.exe");
        let selection = folder.join(FILE_NAME);
        assert_eq!(script_next_to(&executable), None);
        for (value, expected) in [
            ("en", "globalThis.__CG_INSTALL_LANGUAGE__ = 'en';"),
            ("fa\r\n", "globalThis.__CG_INSTALL_LANGUAGE__ = 'fa';"),
            ("\u{feff}ar", "globalThis.__CG_INSTALL_LANGUAGE__ = 'ar';"),
        ] {
            fs::write(&selection, value)?;
            assert_eq!(script_next_to(&executable), Some(expected));
        }
        fs::write(&selection, "fa; extra code")?;
        assert_eq!(script_next_to(&executable), None);
        fs::write(&selection, [0xff])?;
        assert_eq!(script_next_to(&executable), None);
        fs::remove_file(selection)?;
        fs::remove_dir(folder)
    }
}
