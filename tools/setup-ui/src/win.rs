//! What the setup asks of Windows: the registry, folders, processes, the service, the shell.
//! Every function here READS or OPENS something; none changes what gets installed — that is the
//! engine's alone.

use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, FILETIME, HANDLE, HWND};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FileBasicInfo, FileStandardInfo, GetDiskFreeSpaceExW,
    GetFileInformationByHandleEx, CREATE_NEW, FILE_ATTRIBUTE_TEMPORARY, FILE_BASIC_INFO,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_DELETE_ON_CLOSE, FILE_GENERIC_WRITE,
    FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_STANDARD_INFO,
    OPEN_EXISTING,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Registry::{
    RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_NOEXPAND, RRF_RT_REG_EXPAND_SZ,
    RRF_RT_REG_SZ, RRF_SUBKEY_WOW6432KEY, RRF_SUBKEY_WOW6464KEY,
};
use windows::Win32::System::Services::{
    CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatus, SC_MANAGER_CONNECT,
    SERVICE_QUERY_STATUS, SERVICE_RUNNING, SERVICE_STATUS,
};
use windows::Win32::System::SystemInformation::{
    GetNativeSystemInfo, GetSystemTimeAsFileTime, SYSTEM_INFO,
};
use windows::Win32::UI::Shell::{
    FOLDERID_LocalAppData, FOLDERID_ProgramData, FOLDERID_RoamingAppData, SHGetKnownFolderPath,
    ShellExecuteW, KF_FLAG_DEFAULT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION, SW_SHOWNORMAL,
    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

pub fn h(s: &str) -> HSTRING {
    HSTRING::from(s)
}

/// Which registry view: CG Bridge writes HKLM's 64-bit view; this program is 32-bit.
#[derive(Clone, Copy)]
pub enum View {
    Native64,
    Wow32,
}

pub fn reg_string(root: HKEY, subkey: &str, value: &str, view: View) -> Option<String> {
    let flags = RRF_RT_REG_SZ
        | RRF_RT_REG_EXPAND_SZ
        | RRF_NOEXPAND
        | match view {
            View::Native64 => RRF_SUBKEY_WOW6464KEY,
            View::Wow32 => RRF_SUBKEY_WOW6432KEY,
        };
    let (sk, v) = (h(subkey), h(value));
    let mut size = 0u32;
    unsafe {
        if RegGetValueW(root, &sk, &v, flags, None, None, Some(&mut size)) != ERROR_SUCCESS
            || size == 0
        {
            return None;
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut bytes = (buf.len() * 2) as u32;
        if RegGetValueW(
            root,
            &sk,
            &v,
            flags,
            None,
            Some(buf.as_mut_ptr().cast::<c_void>()),
            Some(&mut bytes),
        ) != ERROR_SUCCESS
        {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..end]);
        (!s.is_empty()).then_some(s)
    }
}

pub fn hkcu() -> HKEY {
    HKEY_CURRENT_USER
}
pub fn hklm() -> HKEY {
    HKEY_LOCAL_MACHINE
}

fn known_folder(id: &windows::core::GUID) -> Option<String> {
    unsafe {
        let p: PWSTR = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const c_void));
        s
    }
}

pub fn local_app_data() -> String {
    known_folder(&FOLDERID_LocalAppData)
        .unwrap_or_else(|| std::env::var("LOCALAPPDATA").unwrap_or_default())
}
pub fn roaming_app_data() -> String {
    known_folder(&FOLDERID_RoamingAppData)
        .unwrap_or_else(|| std::env::var("APPDATA").unwrap_or_default())
}
pub fn program_data() -> String {
    known_folder(&FOLDERID_ProgramData).unwrap_or_else(|| r"C:\ProgramData".into())
}
/// The 64-bit Program Files, even from this 32-bit process (WOW64 points `%ProgramFiles%` at x86).
pub fn program_files_64() -> String {
    std::env::var("ProgramW6432")
        .or_else(|_| std::env::var("ProgramFiles"))
        .unwrap_or_else(|_| r"C:\Program Files".into())
}

pub fn os_is_64bit() -> bool {
    let mut info = SYSTEM_INFO::default();
    unsafe { GetNativeSystemInfo(&mut info) };
    // PROCESSOR_ARCHITECTURE_AMD64 = 9, ARM64 = 12.
    let arch = unsafe { info.Anonymous.Anonymous.wProcessorArchitecture.0 };
    arch == 9 || arch == 12
}

pub fn process_running(image: &str) -> bool {
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return false;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut found = false;
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                if String::from_utf16_lossy(&entry.szExeFile[..end]).eq_ignore_ascii_case(image) {
                    found = true;
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        found
    }
}

/// The nearest folder of `path` that exists (the install folder itself usually does not yet).
pub fn nearest_existing(path: &Path) -> Option<PathBuf> {
    let mut p = Some(path);
    while let Some(dir) = p {
        if dir.is_dir() {
            return Some(dir.to_path_buf());
        }
        p = dir.parent();
    }
    None
}

/// `C:` and the bytes free there for this user.
pub fn free_space(path: &Path) -> (String, Option<u64>) {
    let drive = path.to_string_lossy().chars().take(2).collect::<String>();
    let Some(dir) = nearest_existing(path) else {
        return (drive, None);
    };
    let mut free = 0u64;
    let ok =
        unsafe { GetDiskFreeSpaceExW(&h(&dir.to_string_lossy()), Some(&mut free), None, None) }
            .is_ok();
    (drive, ok.then_some(free))
}

/// A file can be created in the folder, or in the nearest folder of it that exists — measured by
/// creating one (deleted on close), never guessed from a path.
pub fn writable(path: &Path) -> bool {
    let Some(dir) = nearest_existing(path) else {
        return false;
    };
    let probe = dir.join(format!(".cg-setup-probe-{}", std::process::id()));
    unsafe {
        match CreateFileW(
            &h(&probe.to_string_lossy()),
            FILE_GENERIC_WRITE.0,
            FILE_SHARE_READ,
            None,
            CREATE_NEW,
            FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE,
            None,
        ) {
            Ok(handle) => {
                let _ = CloseHandle(handle);
                true
            }
            Err(_) => false,
        }
    }
}

/// Windows' "Animation effects" setting is OFF.
pub fn reduced_motion() -> bool {
    let mut on = windows::core::BOOL(1);
    let ok = unsafe {
        SystemParametersInfoW(
            SPI_GETCLIENTAREAANIMATION,
            0,
            Some((&mut on as *mut windows::core::BOOL).cast::<c_void>()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    }
    .is_ok();
    ok && !on.as_bool()
}

/// Now, as a FILETIME count.
pub fn now() -> u64 {
    let ft: FILETIME = unsafe { GetSystemTimeAsFileTime() };
    (u64::from(ft.dwHighDateTime) << 32) | u64::from(ft.dwLowDateTime)
}

/// A file's size and its NTFS change time. Opened for its attributes only, shared every way, so
/// the engine writing it is never refused because the setup is looking.
pub fn file_state(path: &Path) -> Option<(u64, u64)> {
    unsafe {
        let handle: HANDLE = CreateFileW(
            &h(&path.to_string_lossy()),
            FILE_READ_ATTRIBUTES.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            None,
        )
        .ok()?;
        let mut basic = FILE_BASIC_INFO::default();
        let mut standard = FILE_STANDARD_INFO::default();
        let ok = GetFileInformationByHandleEx(
            handle,
            FileBasicInfo,
            (&mut basic as *mut FILE_BASIC_INFO).cast::<c_void>(),
            std::mem::size_of::<FILE_BASIC_INFO>() as u32,
        )
        .is_ok()
            && GetFileInformationByHandleEx(
                handle,
                FileStandardInfo,
                (&mut standard as *mut FILE_STANDARD_INFO).cast::<c_void>(),
                std::mem::size_of::<FILE_STANDARD_INFO>() as u32,
            )
            .is_ok();
        let _ = CloseHandle(handle);
        ok.then_some((
            standard.EndOfFile.max(0) as u64,
            basic.ChangeTime.max(0) as u64,
        ))
    }
}

/// The bytes of a file the engine has written SINCE `since` (a FILETIME): its size once its change
/// time is past the start, else none. NSIS stamps a file with its build time, so the change time —
/// which every write and every stamping moves — is the only honest "written in this run".
pub fn bytes_written_since(path: &Path, since: u64) -> u64 {
    match file_state(path) {
        // One second's grace for the clock's granularity.
        Some((size, changed)) if changed + 10_000_000 >= since => size,
        _ => 0,
    }
}

/// Read a log from `offset` to its end; returns the text and the new end. Opened and closed per
/// read, shared every way, so the engine's own appends are never refused.
pub fn read_from(path: &Path, offset: u64) -> Option<(String, u64)> {
    use std::io::{Read, Seek, SeekFrom};
    use std::os::windows::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new()
        .read(true)
        .share_mode((FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE).0)
        .open(path)
        .ok()?;
    let len = f.metadata().ok()?.len();
    if len < offset {
        return Some((String::new(), len));
    }
    f.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    Some((
        String::from_utf8_lossy(&buf).into_owned(),
        offset + buf.len() as u64,
    ))
}

pub fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// CG Bridge's service is RUNNING; `None` when it cannot be read.
pub fn service_running(name: &str) -> Option<bool> {
    unsafe {
        let scm = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_CONNECT).ok()?;
        let result = match OpenServiceW(scm, &h(name), SERVICE_QUERY_STATUS) {
            Ok(svc) => {
                let mut status = SERVICE_STATUS::default();
                let r = QueryServiceStatus(svc, &mut status)
                    .ok()
                    .map(|_| status.dwCurrentState == SERVICE_RUNNING);
                let _ = CloseServiceHandle(svc);
                r
            }
            Err(_) => Some(false),
        };
        let _ = CloseServiceHandle(scm);
        result
    }
}

/// Open a file or a URL with what the shell associates with it, from THIS process.
pub fn shell_open(target: &str) -> bool {
    let r = unsafe {
        ShellExecuteW(
            Some(HWND::default()),
            &h("open"),
            &h(target),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    r.0 as isize > 32
}

/// Open a file or a URL as the signed-in user — through the desktop's own shell — so a browser or
/// an app launched from CG Bridge's elevated setup does not run elevated. Falls back to
/// `shell_open` where the desktop shell cannot be reached.
pub fn shell_open_as_user(target: &str) -> bool {
    desktop_shell_execute(target).unwrap_or(false) || shell_open(target)
}

fn desktop_shell_execute(target: &str) -> windows::core::Result<bool> {
    use windows::core::{Interface, BSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, IDispatch, IServiceProvider, CLSCTX_LOCAL_SERVER,
    };
    use windows::Win32::UI::Shell::{
        IShellBrowser, IShellDispatch2, IShellFolderViewDual, IShellView, IShellWindows,
        SID_STopLevelBrowser, ShellWindows, SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH,
    };
    unsafe {
        let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
        let loc = var_i4(0);
        let empty = Variant::default();
        let mut hwnd = 0i32;
        let disp: IDispatch =
            windows.FindWindowSW(&loc, &empty, SWC_DESKTOP, &mut hwnd, SWFO_NEEDDISPATCH)?;
        let provider: IServiceProvider = disp.cast()?;
        let browser: IShellBrowser = provider.QueryService(&SID_STopLevelBrowser)?;
        let view: IShellView = browser.QueryActiveShellView()?;
        let background: IDispatch = view.GetItemObject(SVGIO_BACKGROUND)?;
        let folder: IShellFolderViewDual = background.cast()?;
        let app: IShellDispatch2 = folder.Application()?.cast()?;
        app.ShellExecute(
            &BSTR::from(target),
            &var_bstr(""),
            &var_bstr(""),
            &var_bstr("open"),
            &var_i4(1),
        )?;
        Ok(true)
    }
}

// ── VARIANT, by hand: `windows` 0.61 exposes the raw union only ─────────────────────────────
pub use windows::Win32::System::Variant::VARIANT as Variant;

pub fn var_i4(v: i32) -> Variant {
    use windows::Win32::System::Variant::VT_I4;
    let mut out = Variant::default();
    unsafe {
        (*out.Anonymous.Anonymous).vt = VT_I4;
        (*out.Anonymous.Anonymous).Anonymous.lVal = v;
    }
    out
}

pub fn var_bool(v: bool) -> Variant {
    use windows::Win32::Foundation::{VARIANT_FALSE, VARIANT_TRUE};
    use windows::Win32::System::Variant::VT_BOOL;
    let mut out = Variant::default();
    unsafe {
        (*out.Anonymous.Anonymous).vt = VT_BOOL;
        (*out.Anonymous.Anonymous).Anonymous.boolVal = if v { VARIANT_TRUE } else { VARIANT_FALSE };
    }
    out
}

/// The returned VARIANT owns its BSTR (UI Automation frees what a provider returns).
pub fn var_bstr(s: &str) -> Variant {
    use windows::core::BSTR;
    use windows::Win32::System::Variant::VT_BSTR;
    let mut out = Variant::default();
    unsafe {
        (*out.Anonymous.Anonymous).vt = VT_BSTR;
        (*out.Anonymous.Anonymous).Anonymous.bstrVal = std::mem::ManuallyDrop::new(BSTR::from(s));
    }
    out
}
