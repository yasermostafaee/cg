//! CG Control's own log, `%APPDATA%\CG Control\logs\shell.log` (ADR 0011). Its bridge is no longer
//! here (`CENTRAL-BRIDGE-01`: CG Bridge is a service on the Playout machine); what the window does
//! still has to leave a record somewhere, and a windowed app has no console to print to.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// `%APPDATA%\CG Control\logs` — resolved without Tauri, so the very first line and a panic before
/// the app is built still have somewhere to go.
fn logs_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("CG Control").join("logs")
}

/// One line in `shell.log`, stamped with UTC epoch seconds. Never fails the caller.
pub fn log(message: &str) {
    let dir = logs_dir();
    let _ = fs::create_dir_all(&dir);
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("shell.log"))
    {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{secs}] {message}");
    }
}

/// A panic in a windowed app is otherwise invisible.
pub fn install_panic_log() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log(&format!("PANIC: {info}"));
        default(info);
    }));
}
