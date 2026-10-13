//! What CG Setup does when it starts.
//!
//! 1. Read the command line as NSIS reads it (`cmdline`).
//! 2. Find what was appended behind this program (`engine::locate`).
//! 3. `/S` — or Tauri's `/P` for the two apps — hands the command line to the engine untouched and
//!    returns its exit code: THE SILENT PATH IS THE ENGINE'S (`engine::passthrough`).
//! 4. Otherwise: the setup window.
//!
//! A bare program (a developer's build, nothing appended) offers only the developer's preview.

use crate::cmdline;
use crate::engine;
use crate::product::ProductId;
use windows::Win32::System::Com::{
    CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::System::Environment::GetCommandLineW;

pub fn run() -> u32 {
    let line = unsafe { GetCommandLineW().to_string().unwrap_or_default() };
    let parsed = cmdline::parse(&line);
    let payload = match engine::locate() {
        Ok(p) => p,
        Err(_) => return 2,
    };
    let Some(payload) = payload else {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        }
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.first().map(String::as_str) == Some("--cg-preview") {
            return crate::dev::preview(&args[1..]);
        }
        return 2;
    };
    let tauri = payload.config.product != ProductId::Bridge;
    if parsed.silent || (tauri && parsed.passive) {
        return engine::passthrough(&payload, &parsed.tail);
    }
    crate::ui::window::run(payload, parsed)
}
