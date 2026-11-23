//! Read the optional language default and one-time request from interactive CG Control Setup.

use std::{env, fs, path::Path};

const FILE_NAME: &str = "cg-control-install-language";
const MAX_REQUEST_LENGTH: usize = 96;

pub fn initialization_script() -> Option<String> {
    script_next_to(&env::current_exe().ok()?)
}

fn script_next_to(executable: &Path) -> Option<String> {
    let selected = fs::read_to_string(executable.parent()?.join(FILE_NAME)).ok()?;
    let mut lines = selected.trim_start_matches('\u{feff}').trim_start().lines();
    let locale = match lines.next()?.trim() {
        locale @ ("en" | "fa" | "ar") => locale,
        _ => return None,
    };
    let mut script = format!("globalThis.__CG_INSTALL_LANGUAGE__ = '{locale}';");
    if let Some(request) = lines.next().filter(|request| {
        request.len() <= MAX_REQUEST_LENGTH
            && request
                .split('-')
                .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
            && lines.next().is_none()
    }) {
        script.push_str(&format!(
            "globalThis.__CG_INSTALL_LANGUAGE_REQUEST__ = '{request}';"
        ));
    }
    Some(script)
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
            assert_eq!(script_next_to(&executable).as_deref(), Some(expected));
        }
        let persian = "globalThis.__CG_INSTALL_LANGUAGE__ = 'fa';";
        for request in ["123-456-0".to_string(), "9".repeat(MAX_REQUEST_LENGTH)] {
            let contents = format!("fa\r\n{request}\r\n");
            fs::write(&selection, contents)?;
            assert_eq!(
                script_next_to(&executable),
                Some(format!(
                    "{persian}globalThis.__CG_INSTALL_LANGUAGE_REQUEST__ = '{request}';"
                ))
            );
        }
        for request in ["-1", "1-", "1--2", " 1", "1 ", "۱", "5' + code", "123\n456"] {
            fs::write(&selection, format!("fa\n{request}"))?;
            assert_eq!(script_next_to(&executable).as_deref(), Some(persian));
        }
        fs::write(
            &selection,
            format!("fa\n{}", "9".repeat(MAX_REQUEST_LENGTH + 1)),
        )?;
        assert_eq!(script_next_to(&executable).as_deref(), Some(persian));
        fs::write(&selection, "fa; extra code")?;
        assert_eq!(script_next_to(&executable), None);
        fs::write(&selection, [0xff])?;
        assert_eq!(script_next_to(&executable), None);
        fs::remove_file(selection)?;
        fs::remove_dir(folder)
    }
}
