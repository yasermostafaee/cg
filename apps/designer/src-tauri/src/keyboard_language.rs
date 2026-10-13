//! `TEXT-DIGITS-01` — **THE KEYBOARD LANGUAGE THE WINDOW IS TYPING IN**, for the Digits choice's
//! **Keyboard** mode: a typed digit follows the keyboard language active when it is typed.
//!
//! ONE read-only command, shared by both shells (CG Control includes this file with `#[path]`): it
//! reads Windows' keyboard layout and sets nothing.
//!
//! ⚠ **WHICH THREAD.** WebView2 takes text input in its own window, `Chrome_RenderWidgetHostHWND`,
//! owned by a thread of the WebView2 browser process. Measured on the installed CG Designer
//! (`text-digits` design §0.3): a layout switch reaches THAT thread, while the app's own thread
//! keeps the layout it had — so `GetKeyboardLayout` is asked about the thread that owns the webview's
//! input window, never about the app's thread. The browser's `navigator.keyboard.getLayoutMap()` is
//! no help: it reports the ASCII-capable layout, `q` on `KeyQ`, even with Persian active.

/// `persian`, `arabic`, `latin` or `unknown` — never a guess: only the Persian, Arabic and English
/// layouts are named, and every other layout, or a window that cannot be read, is `unknown`.
#[tauri::command]
pub fn keyboard_language(window: tauri::WebviewWindow) -> String {
    #[cfg(windows)]
    {
        match window.hwnd() {
            Ok(hwnd) => win::language(hwnd.0 as isize).to_string(),
            Err(_) => "unknown".to_string(),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        "unknown".to_string()
    }
}

#[cfg(windows)]
mod win {
    use core::ffi::c_void;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetKeyboardLayout;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, GetClassNameW, GetWindowThreadProcessId,
    };

    /// WebView2's input window — a descendant of the app's window, owned by another process.
    const INPUT_CLASS: &str = "Chrome_RenderWidgetHostHWND";

    /// The language of the layout active on the thread that owns the webview's input window
    /// (the app's own window when no such child exists yet).
    pub fn language(top: isize) -> &'static str {
        let mut found: *mut c_void = core::ptr::null_mut();
        // SAFETY: `find_input` only writes one window handle through the pointer it is handed,
        // which outlives the enumeration.
        unsafe {
            EnumChildWindows(
                top as *mut c_void,
                Some(find_input),
                &mut found as *mut *mut c_void as isize,
            );
        }
        let window = if found.is_null() { top as *mut c_void } else { found };
        // SAFETY: plain reads of the window's owning thread and of that thread's layout.
        let thread = unsafe { GetWindowThreadProcessId(window, core::ptr::null_mut()) };
        if thread == 0 {
            return "unknown";
        }
        let layout = unsafe { GetKeyboardLayout(thread) } as usize;
        // The layout's language is its low word; the primary language is its low ten bits.
        match layout & 0x3ff {
            0x29 => "persian",
            0x01 => "arabic",
            0x09 => "latin",
            _ => "unknown",
        }
    }

    unsafe extern "system" fn find_input(window: *mut c_void, found: isize) -> i32 {
        let mut name = [0u16; 64];
        let length = GetClassNameW(window, name.as_mut_ptr(), name.len() as i32);
        if length > 0 && String::from_utf16_lossy(&name[..length as usize]) == INPUT_CLASS {
            *(found as *mut *mut c_void) = window;
            return 0; // found: stop
        }
        1 // keep looking
    }
}
