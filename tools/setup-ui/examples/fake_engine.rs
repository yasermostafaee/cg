//! A stand-in engine for driving the setup window on a developer's machine, where the real
//! engines must not run (a real install would replace the machine's own CG apps).
//!
//! `fake_engine.exe /S /D=<dir>` writes `<dir>\%FAKE_MAIN%` (default `cg-designer.exe`) in steps,
//! `%FAKE_BYTES%` bytes (default 20 MB), then exits `%FAKE_EXIT%` (default 0). It refuses any folder
//! outside one whose path contains `%FAKE_ROOT_MARK%` (default `cgrs`), and anything without `/S`.

use std::io::Write;
use std::time::Duration;

fn main() {
    let line: String = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    if !line.split(' ').any(|t| t == "/S") {
        std::process::exit(2);
    }
    let Some(dir) = line
        .split_once(" /D=")
        .map(|(_, d)| d.trim().to_string())
        .or_else(|| line.strip_prefix("/D=").map(String::from))
    else {
        std::process::exit(2);
    };
    let mark = std::env::var("FAKE_ROOT_MARK").unwrap_or_else(|_| "cgrs".into());
    if !dir.to_lowercase().contains(&mark.to_lowercase()) {
        std::process::exit(2);
    }
    let name = std::env::var("FAKE_MAIN").unwrap_or_else(|_| "cg-designer.exe".into());
    let total: usize = std::env::var("FAKE_BYTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(20 << 20);
    let code: i32 = std::env::var("FAKE_EXIT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let _ = std::fs::create_dir_all(&dir);
    let path = std::path::Path::new(&dir).join(name);
    let Ok(mut f) = std::fs::File::create(&path) else {
        std::process::exit(2);
    };
    let chunk = vec![0x5au8; 512 << 10];
    let mut written = 0;
    std::thread::sleep(Duration::from_millis(600));
    while written < total {
        let n = chunk.len().min(total - written);
        let _ = f.write_all(&chunk[..n]);
        let _ = f.flush();
        written += n;
        std::thread::sleep(Duration::from_millis(60));
    }
    std::thread::sleep(Duration::from_millis(800));
    std::process::exit(code);
}
