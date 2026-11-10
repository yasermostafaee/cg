/// Open the fixed APASAI site in Windows' default browser. The webview supplies no arguments.
#[tauri::command]
pub fn open_company_site() -> Result<(), String> {
    open()
}

#[cfg(windows)]
fn open() -> Result<(), String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

    // The URL and verb are NUL-terminated constants. No parameters or working directory.
    let result = unsafe {
        ShellExecuteW(
            null_mut(),
            windows_sys::w!("open"),
            windows_sys::w!("https://apasai.com/"),
            null(),
            null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err("Windows could not open the APASAI website.".to_owned())
    }
}

#[cfg(not(windows))]
fn open() -> Result<(), String> {
    Err("Opening the APASAI website is supported by the Windows shell.".to_owned())
}
