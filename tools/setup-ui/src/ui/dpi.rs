//! DPI, asked of whichever Windows this is.
//!
//! `GetDpiForWindow` (Windows 10 1607), `GetDpiForMonitor` (8.1, `shcore.dll`) and
//! `SetProcessDpiAwarenessContext` (10 1703) are looked up at run time, never imported: an import
//! the loader cannot bind stops a program before its first line, and CG Setup's silent path must run
//! wherever its engine ran. Where one is missing the window still opens, at the system DPI.

use windows::core::{s, w};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{GetDC, GetDeviceCaps, ReleaseDC, HMONITOR, LOGPIXELSX};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

type GetDpiForWindowFn = unsafe extern "system" fn(HWND) -> u32;
type GetDpiForMonitorFn = unsafe extern "system" fn(HMONITOR, i32, *mut u32, *mut u32) -> i32;
type SetContextFn = unsafe extern "system" fn(isize) -> i32;

fn system_dpi() -> u32 {
    unsafe {
        let dc = GetDC(None);
        let dpi = GetDeviceCaps(Some(dc), LOGPIXELSX);
        ReleaseDC(None, dc);
        if dpi > 0 {
            dpi as u32
        } else {
            96
        }
    }
}

/// Per-monitor v2 for this process, when Windows has it (the manifest asks for it too).
pub fn per_monitor_v2() {
    unsafe {
        if let Ok(user32) = LoadLibraryW(w!("user32.dll")) {
            if let Some(f) = GetProcAddress(user32, s!("SetProcessDpiAwarenessContext")) {
                let f: SetContextFn = std::mem::transmute(f);
                // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 is (HANDLE)-4.
                f(-4);
            }
        }
    }
}

/// The DPI a window is drawn at.
pub fn for_window(hwnd: HWND) -> u32 {
    unsafe {
        if let Ok(user32) = LoadLibraryW(w!("user32.dll")) {
            if let Some(f) = GetProcAddress(user32, s!("GetDpiForWindow")) {
                let f: GetDpiForWindowFn = std::mem::transmute(f);
                let dpi = f(hwnd);
                if dpi > 0 {
                    return dpi;
                }
            }
        }
    }
    system_dpi()
}

/// The effective DPI of a monitor.
pub fn for_monitor(monitor: HMONITOR) -> u32 {
    unsafe {
        if let Ok(shcore) = LoadLibraryW(w!("shcore.dll")) {
            if let Some(f) = GetProcAddress(shcore, s!("GetDpiForMonitor")) {
                let f: GetDpiForMonitorFn = std::mem::transmute(f);
                let (mut x, mut y) = (0u32, 0u32);
                // MDT_EFFECTIVE_DPI = 0
                if f(monitor, 0, &mut x, &mut y) == 0 && x > 0 {
                    return x;
                }
            }
        }
    }
    system_dpi()
}
