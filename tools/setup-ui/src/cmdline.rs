//! The command line, read the way NSIS reads it.
//!
//! 🔴 This module decides whether CG Setup shows its window or hands the command line to the
//! engine untouched, so it reproduces NSIS's own parse (`exehead/Main.c`, `WinMain`) rather than a
//! convenient one: `/S` is silent only as its own token, upper case, unquoted; `/D=` is honoured
//! only after a space and runs to the end of the line; a quoted argument is skipped whole. Tauri's
//! passive mode is its template's `${GetOptions} $CMDLINE "/P"`, which splits the WHOLE command
//! line on `/` and matches any piece that starts with `P`, case-insensitively.

/// What the command line asks of this installer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    /// Everything after the program's own path, exactly as NSIS's `realcmds` holds it.
    pub tail: String,
    /// NSIS's silent flag: a `/S` token.
    pub silent: bool,
    /// Tauri's passive mode: `${GetOptions} $CMDLINE "/P"` finds an option.
    pub passive: bool,
    /// NSIS's install directory: what follows ` /D=`, to the end of the line.
    pub install_dir: Option<String>,
    /// The tail with ` /D=…` cut off, as NSIS cuts it before passing it on.
    pub rest: String,
}

/// Read a full command line (`GetCommandLineW`) as NSIS would.
pub fn parse(cmdline: &str) -> Parsed {
    let chars: Vec<char> = cmdline.chars().collect();
    let mut i = 0usize;
    // The program's own path: quoted → to the closing quote; else → to the first space. NSIS then
    // steps over that one character (`CharNext`).
    let seek = if chars.first() == Some(&'"') {
        i += 1;
        '"'
    } else {
        ' '
    };
    while i < chars.len() && chars[i] != seek {
        i += 1;
    }
    if i < chars.len() {
        i += 1;
    }
    let realcmds_start = i;
    let tail: String = chars[realcmds_start..].iter().collect();

    let mut silent = false;
    let mut install_dir = None;
    let mut rest_end = chars.len();
    let mut p = realcmds_start;
    while p < chars.len() {
        while p < chars.len() && chars[p] == ' ' {
            p += 1;
        }
        if p >= chars.len() {
            break;
        }
        let mut seek = ' ';
        if chars[p] == '"' {
            p += 1;
            seek = '"';
        }
        if p < chars.len() && chars[p] == '/' {
            p += 1;
            let end_of_arg = |k: usize| k >= chars.len() || chars[k] == ' ';
            if p < chars.len() && chars[p] == 'S' && end_of_arg(p + 1) {
                silent = true;
            }
            // CMP4CHAR(cmdline-2, " /D=") — the character BEFORE the slash must be a space.
            if p >= 2
                && p + 2 <= chars.len()
                && chars[p - 2] == ' '
                && chars[p - 1] == '/'
                && chars.get(p) == Some(&'D')
                && chars.get(p + 1) == Some(&'=')
            {
                install_dir = Some(chars[p + 2..].iter().collect::<String>());
                rest_end = p - 2;
                break;
            }
        }
        while p < chars.len() && chars[p] != seek {
            p += 1;
        }
        if p < chars.len() && chars[p] == '"' {
            p += 1;
        }
    }
    let rest: String = if rest_end > realcmds_start {
        chars[realcmds_start..rest_end].iter().collect()
    } else {
        String::new()
    };
    Parsed {
        tail,
        silent,
        passive: get_options_present(cmdline, "/P"),
        install_dir: install_dir.map(|d| d.trim().to_string()),
        rest,
    }
}

/// FileFunc.nsh's `${GetOptions}`, as far as "is the option there": the string is split on the
/// option's first character, and a piece that starts with the rest of the option (case-insensitive)
/// is a match. Tauri's template asks it of the WHOLE `$CMDLINE`.
pub fn get_options_present(cmdline: &str, option: &str) -> bool {
    let mut chars = option.chars();
    let Some(delim) = chars.next() else {
        return false;
    };
    let want: String = chars.collect::<String>().to_lowercase();
    cmdline
        .split(delim)
        .skip(1)
        .any(|piece| piece.to_lowercase().starts_with(&want))
}

/// The command line the engine is given for a silent run driven by the setup window: `/S`, every
/// argument the user gave this installer (but `/D=`), and the folder as NSIS wants it — LAST and
/// unquoted, spaces and all.
pub fn engine_args(rest: &str, dir: Option<&str>) -> String {
    let mut out = String::from("/S");
    let rest = rest.trim();
    if !rest.is_empty() {
        out.push(' ');
        out.push_str(rest);
    }
    if let Some(dir) = dir {
        out.push_str(" /D=");
        out.push_str(dir);
    }
    out
}

/// The engine's full command line for a pass-through: its own path quoted, then this installer's
/// `realcmds` exactly — so NSIS in the engine finds the same tokens, `/D=` and all.
pub fn passthrough_command_line(engine: &str, tail: &str) -> String {
    if tail.is_empty() {
        format!("\"{engine}\"")
    } else if tail.starts_with(' ') {
        format!("\"{engine}\"{tail}")
    } else {
        format!("\"{engine}\" {tail}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_launch_is_interactive() {
        let p = parse(r#""C:\Downloads\CG-Bridge_0.10.0_x64-setup.exe""#);
        assert!(!p.silent && !p.passive);
        assert_eq!(p.tail, "");
        assert_eq!(p.install_dir, None);
    }

    #[test]
    fn slash_s_is_silent_only_as_its_own_upper_case_token() {
        assert!(parse(r#""x.exe" /S"#).silent);
        assert!(parse(r#"x.exe /S /PLAYOUT=http://127.0.0.1:8080"#).silent);
        assert!(parse(r#""x.exe" /PLAYOUT=http://h:8080 /S"#).silent);
        assert!(
            !parse(r#""x.exe" /s"#).silent,
            "lower case is not NSIS's silent"
        );
        assert!(!parse(r#""x.exe" /SILENT"#).silent);
        assert!(!parse(r#""x.exe" "/S""#).silent, "a quoted /S is not seen");
    }

    #[test]
    fn slash_d_is_last_unquoted_and_runs_to_the_end() {
        let p = parse(r#""x.exe" /S /D=C:\Program Files\CG Bridge"#);
        assert!(p.silent);
        assert_eq!(
            p.install_dir.as_deref(),
            Some(r"C:\Program Files\CG Bridge")
        );
        assert_eq!(p.rest, " /S");
        let q = parse(r#""x.exe" /PLAYOUT=http://h:8080 /D=D:\Apps\CG Control"#);
        assert_eq!(q.install_dir.as_deref(), Some(r"D:\Apps\CG Control"));
        assert_eq!(q.rest.trim(), "/PLAYOUT=http://h:8080");
    }

    #[test]
    fn a_quoted_argument_is_skipped_whole() {
        let p = parse(r#""x.exe" "/PLAYOUT=http://a b" /S"#);
        assert!(p.silent);
        let q = parse(r#""x.exe" "/D=C:\x""#);
        assert_eq!(q.install_dir, None, "a quoted /D= is not NSIS's");
    }

    #[test]
    fn the_tail_is_kept_byte_for_byte() {
        let line = r#""C:\a b\x.exe" /S /PLAYOUT="http://h:8080"  /AMCPHOST=127.0.0.1"#;
        let p = parse(line);
        assert_eq!(
            p.tail,
            r#" /S /PLAYOUT="http://h:8080"  /AMCPHOST=127.0.0.1"#
        );
        assert_eq!(
            passthrough_command_line(r"C:\T\engine.exe", &p.tail),
            r#""C:\T\engine.exe" /S /PLAYOUT="http://h:8080"  /AMCPHOST=127.0.0.1"#
        );
        let bare = parse(r"C:\x.exe /S");
        assert_eq!(bare.tail, "/S");
        assert_eq!(
            passthrough_command_line("e.exe", &bare.tail),
            r#""e.exe" /S"#
        );
        assert_eq!(passthrough_command_line("e.exe", ""), r#""e.exe""#);
    }

    #[test]
    fn tauri_passive_is_get_options_on_the_whole_line() {
        assert!(parse(r#""x.exe" /P"#).passive);
        assert!(parse(r#""x.exe" /p"#).passive);
        assert!(parse(r#""x.exe" /P /R"#).passive);
        assert!(!parse(r#""x.exe" /R /UPDATE"#).passive);
        assert!(!parse(r#""C:\Users\x.exe""#).passive);
    }

    #[test]
    fn the_engine_gets_slash_s_the_users_arguments_and_the_folder_last() {
        assert_eq!(engine_args("", None), "/S");
        assert_eq!(
            engine_args("  /PLAYOUT=http://h:8080 ", None),
            "/S /PLAYOUT=http://h:8080"
        );
        assert_eq!(
            engine_args("", Some(r"D:\My Apps\CG Control")),
            r"/S /D=D:\My Apps\CG Control"
        );
    }
}
