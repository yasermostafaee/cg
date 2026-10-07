//! 🔴 `R-091` (`RELEASE-0114-01` A5) — **CG BRIDGE ON THIS MACHINE, AND NOT ANSWERING.**
//!
//! When the CG Bridge address a console resolved is THIS machine and nothing answers there, the
//! console says why in words and offers the one step that fixes it — never a PowerShell line:
//!
//!   - the `CGBridge` service is installed and stopped → `Start CG Bridge`: this app relaunches
//!     ITSELF elevated (`ShellExecuteExW` `runas` — the UAC prompt is the app's own step) with
//!     `--cg-service start`, and that instance starts the service and exits before Tauri starts;
//!   - TCP 5280 is held → the holder is named (image, PID), and `Free the port` is offered ONLY for a
//!     holder of ours: `cg-bridge.exe` in a folder named `CG Bridge` (an older CG Bridge) or
//!     `CG Control` (a `0.9.x` sidecar). The elevated `--cg-service free <pid>` reads the image path
//!     AGAIN and stops nothing that is not ours — never the Playout engine, CasparCG, or anything else;
//!   - the service is not installed → said, nothing offered.
//!
//! Reading (the service's state, the port's holder) needs no elevation; only the two acts do.

use std::net::{IpAddr, ToSocketAddrs, UdpSocket};

use serde::Serialize;

/// The service CG Bridge's installer registers (`tools/bridge-installer/cg-bridge.nsi`).
pub const SERVICE: &str = "CGBridge";
/// CG Bridge's port for consoles.
pub const CONSOLE_PORT: u16 = 5280;

/// The `--cg-service` verbs' exit codes.
pub mod exit {
    pub const DONE: i32 = 0;
    pub const NOT_INSTALLED: i32 = 2;
    pub const START_REFUSED: i32 = 3;
    pub const DID_NOT_RUN: i32 = 4;
    pub const NOT_OURS: i32 = 5;
    pub const COULD_NOT_STOP: i32 = 6;
    pub const USAGE: i32 = 64;
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ServiceState {
    NotInstalled,
    Stopped,
    Starting,
    Running,
    Stopping,
    Unknown,
}

/// What holds TCP 5280 here: its PID, its image's file name, and whether it is ours.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct Holder {
    pub pid: u32,
    pub name: String,
    pub ours: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum LocalBridge {
    /// The CG Bridge address is not this machine: nothing here to read.
    Elsewhere,
    /// It is this machine: the service, and what (if anything) holds the console port.
    Here { service: ServiceState, holder: Option<Holder> },
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ActOutcome {
    Done,
    /// The person said No to the administrator prompt.
    Declined,
    /// The elevated step ran and refused, with its exit code (see [`exit`]).
    Refused { code: i32 },
    Failed { reason: String },
}

/// 🔴 **OURS, by its image path**: `cg-bridge.exe` in a folder named `CG Bridge` (CG Bridge's install)
/// or `CG Control` (a `0.9.x` CG Control's own sidecar). Nothing else is ever stopped.
pub fn is_ours(image_path: &str) -> bool {
    let parts: Vec<&str> = image_path.split(['\\', '/']).filter(|p| !p.is_empty()).collect();
    let [.., dir, file] = parts.as_slice() else {
        return false;
    };
    file.eq_ignore_ascii_case("cg-bridge.exe")
        && (dir.eq_ignore_ascii_case("CG Bridge") || dir.eq_ignore_ascii_case("CG Control"))
}

/// The file name of an image path.
pub fn file_name(image_path: &str) -> String {
    image_path.rsplit(['\\', '/']).next().unwrap_or(image_path).to_string()
}

/// Is `host` THIS machine? Loopback, or an address one of its interfaces holds (a bind succeeds).
pub fn is_this_machine(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']');
    if h.eq_ignore_ascii_case("localhost") {
        return true;
    }
    let addresses: Vec<IpAddr> = match h.parse::<IpAddr>() {
        Ok(ip) => vec![ip],
        Err(_) => match (h, 0u16).to_socket_addrs() {
            Ok(found) => found.map(|a| a.ip()).collect(),
            Err(_) => return false,
        },
    };
    addresses.iter().any(|ip| ip.is_loopback() || UdpSocket::bind((*ip, 0)).is_ok())
}

/// What a console needs to say about CG Bridge on `host` when nothing answered there.
pub fn state(host: &str) -> LocalBridge {
    if !is_this_machine(host) {
        return LocalBridge::Elsewhere;
    }
    #[cfg(windows)]
    {
        let service = win::service_state(SERVICE);
        let holder = win::listener_pid(CONSOLE_PORT).map(|pid| {
            let path = win::image_path(pid);
            Holder {
                pid,
                name: path.as_deref().map(file_name).unwrap_or_else(|| format!("PID {pid}")),
                ours: path.as_deref().is_some_and(is_ours),
            }
        });
        LocalBridge::Here { service, holder }
    }
    #[cfg(not(windows))]
    {
        LocalBridge::Here { service: ServiceState::Unknown, holder: None }
    }
}

/// 🔴 **THE ELEVATED INSTANCE'S ONE JOB.** `cg-control.exe --cg-service start` or `… free <pid>`: do that
/// and return the exit code — before anything of the app starts (`main.rs`). `None`: not such a launch.
pub fn service_verb(args: &[String]) -> Option<i32> {
    let at = args.iter().position(|a| a == "--cg-service")?;
    Some(match args.get(at + 1).map(String::as_str) {
        Some("start") => start(),
        Some("free") => match args.get(at + 2).and_then(|p| p.parse::<u32>().ok()) {
            Some(pid) => free(pid),
            None => exit::USAGE,
        },
        _ => exit::USAGE,
    })
}

fn start() -> i32 {
    #[cfg(windows)]
    {
        win::start_service(SERVICE)
    }
    #[cfg(not(windows))]
    {
        exit::USAGE
    }
}

/// Stop `pid` — only when its image, read again HERE, is ours. A process already gone is done.
fn free(pid: u32) -> i32 {
    #[cfg(windows)]
    {
        match win::image_path(pid) {
            None => exit::DONE,
            Some(path) if is_ours(&path) => {
                if win::terminate(pid) {
                    exit::DONE
                } else {
                    exit::COULD_NOT_STOP
                }
            }
            Some(_) => exit::NOT_OURS,
        }
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        exit::USAGE
    }
}

/// The page's two acts: `start` (the service), `free` (a holder of ours, by PID). Each asks Windows for
/// administrator rights as its own step. Blocking: the command runs it off the main thread.
pub fn act_on(action: &str, pid: Option<u32>) -> ActOutcome {
    let args = match (action, pid) {
        ("start", _) => "--cg-service start".to_string(),
        ("free", Some(p)) => format!("--cg-service free {p}"),
        _ => return ActOutcome::Failed { reason: format!("no such action: {action}") },
    };
    act(&args)
}

/// Run `--cg-service <args>` elevated and say what came of it.
fn act(args: &str) -> ActOutcome {
    #[cfg(windows)]
    {
        match win::run_elevated(args) {
            Ok(0) => ActOutcome::Done,
            Ok(code) => ActOutcome::Refused { code: code as i32 },
            Err(win::Elevate::Declined) => ActOutcome::Declined,
            Err(win::Elevate::TimedOut) => {
                ActOutcome::Failed { reason: "the administrator step did not finish in time".into() }
            }
            Err(win::Elevate::Failed(code)) => {
                ActOutcome::Failed { reason: format!("Windows could not run it (error {code})") }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = args;
        ActOutcome::Failed { reason: "only on Windows".into() }
    }
}

#[cfg(windows)]
mod win {
    use super::{exit, ServiceState};
    use std::ptr::{null, null_mut};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, ERROR_CANCELLED, ERROR_INSUFFICIENT_BUFFER,
        ERROR_SERVICE_ALREADY_RUNNING, ERROR_SERVICE_DOES_NOT_EXIST, WAIT_OBJECT_0,
    };
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
    };
    use windows_sys::Win32::System::Services::{
        CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatus, StartServiceW, SC_HANDLE,
        SC_MANAGER_CONNECT, SERVICE_QUERY_STATUS, SERVICE_RUNNING, SERVICE_START, SERVICE_START_PENDING,
        SERVICE_STATUS, SERVICE_STOPPED, SERVICE_STOP_PENDING,
    };
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
        WaitForSingleObject, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    };
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    /// `AF_INET` (WinSock's `ADDRESS_FAMILY` 2), as `GetExtendedTcpTable` takes it.
    const AF_INET: u32 = 2;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// The service's state, read with connect and query rights only (no elevation).
    pub fn service_state(name: &str) -> ServiceState {
        // SAFETY: plain SCM calls on handles this function opens and closes.
        unsafe {
            let scm = OpenSCManagerW(null(), null(), SC_MANAGER_CONNECT);
            if scm.is_null() {
                return ServiceState::Unknown;
            }
            let wname = wide(name);
            let svc = OpenServiceW(scm, wname.as_ptr(), SERVICE_QUERY_STATUS);
            if svc.is_null() {
                let err = GetLastError();
                CloseServiceHandle(scm);
                return if err == ERROR_SERVICE_DOES_NOT_EXIST {
                    ServiceState::NotInstalled
                } else {
                    ServiceState::Unknown
                };
            }
            let state = current_state(svc);
            CloseServiceHandle(svc);
            CloseServiceHandle(scm);
            match state {
                Some(SERVICE_STOPPED) => ServiceState::Stopped,
                Some(SERVICE_START_PENDING) => ServiceState::Starting,
                Some(SERVICE_RUNNING) => ServiceState::Running,
                Some(SERVICE_STOP_PENDING) => ServiceState::Stopping,
                _ => ServiceState::Unknown,
            }
        }
    }

    /// SAFETY: `svc` is an open service handle with query rights.
    unsafe fn current_state(svc: SC_HANDLE) -> Option<u32> {
        let mut status: SERVICE_STATUS = std::mem::zeroed();
        if QueryServiceStatus(svc, &mut status) == 0 {
            None
        } else {
            Some(status.dwCurrentState)
        }
    }

    /// Start the service and wait for it to run (the elevated instance). An exit code of [`exit`].
    pub fn start_service(name: &str) -> i32 {
        // SAFETY: plain SCM calls on handles this function opens and closes.
        unsafe {
            let scm = OpenSCManagerW(null(), null(), SC_MANAGER_CONNECT);
            if scm.is_null() {
                return exit::START_REFUSED;
            }
            let wname = wide(name);
            let svc = OpenServiceW(scm, wname.as_ptr(), SERVICE_START | SERVICE_QUERY_STATUS);
            if svc.is_null() {
                let err = GetLastError();
                CloseServiceHandle(scm);
                return if err == ERROR_SERVICE_DOES_NOT_EXIST {
                    exit::NOT_INSTALLED
                } else {
                    exit::START_REFUSED
                };
            }
            let started = StartServiceW(svc, 0, null()) != 0
                || GetLastError() == ERROR_SERVICE_ALREADY_RUNNING;
            let mut code = if started { exit::DID_NOT_RUN } else { exit::START_REFUSED };
            if started {
                let deadline = Instant::now() + Duration::from_secs(20);
                while Instant::now() < deadline {
                    match current_state(svc) {
                        Some(SERVICE_RUNNING) => {
                            code = exit::DONE;
                            break;
                        }
                        // It started and stopped again — a port it cannot take, a bad configuration.
                        Some(SERVICE_STOPPED) => break,
                        _ => std::thread::sleep(Duration::from_millis(250)),
                    }
                }
            }
            CloseServiceHandle(svc);
            CloseServiceHandle(scm);
            code
        }
    }

    /// The PID listening on TCP `port` (IPv4), if any.
    pub fn listener_pid(port: u16) -> Option<u32> {
        // SAFETY: the table is written into a u32-aligned buffer of the size Windows asked for, and
        // read within `dwNumEntries`.
        unsafe {
            let mut size: u32 = 0;
            let first =
                GetExtendedTcpTable(null_mut(), &mut size, 0, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
            if first != 0 && first != ERROR_INSUFFICIENT_BUFFER {
                return None;
            }
            let mut buffer: Vec<u32> = vec![0; (size as usize).div_ceil(4) + 64];
            let mut len = (buffer.len() * 4) as u32;
            let table_ptr = buffer.as_mut_ptr().cast::<core::ffi::c_void>();
            if GetExtendedTcpTable(table_ptr, &mut len, 0, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0) != 0 {
                return None;
            }
            let table = table_ptr.cast::<MIB_TCPTABLE_OWNER_PID>();
            let count = (*table).dwNumEntries as usize;
            let rows = std::ptr::addr_of!((*table).table).cast::<MIB_TCPROW_OWNER_PID>();
            for i in 0..count {
                let row = &*rows.add(i);
                // The port sits in network byte order in the low 16 bits.
                if u16::from_be((row.dwLocalPort & 0xFFFF) as u16) == port {
                    return Some(row.dwOwningPid);
                }
            }
            None
        }
    }

    /// A process's full image path, read with limited query rights; `None` — gone or closed to us.
    pub fn image_path(pid: u32) -> Option<String> {
        // SAFETY: a handle this function opens and closes, and a buffer whose length it passes.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return None;
            }
            let mut buffer = [0u16; 1024];
            let mut len = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut len);
            CloseHandle(process);
            if ok == 0 {
                None
            } else {
                Some(String::from_utf16_lossy(&buffer[..len as usize]))
            }
        }
    }

    pub fn terminate(pid: u32) -> bool {
        // SAFETY: a handle this function opens and closes.
        unsafe {
            let process = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return false;
            }
            let ok = TerminateProcess(process, 1) != 0;
            CloseHandle(process);
            ok
        }
    }

    pub enum Elevate {
        Declined,
        TimedOut,
        Failed(u32),
    }

    /// Relaunch THIS executable elevated with `args`, wait for it, and return its exit code.
    pub fn run_elevated(args: &str) -> Result<u32, Elevate> {
        let exe = std::env::current_exe().map_err(|_| Elevate::Failed(0))?;
        let file = wide(&exe.to_string_lossy());
        let verb = wide("runas");
        let params = wide(args);
        // SAFETY: the strings outlive the call; the process handle is waited on and closed here.
        unsafe {
            let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
            info.lpVerb = verb.as_ptr();
            info.lpFile = file.as_ptr();
            info.lpParameters = params.as_ptr();
            info.nShow = SW_HIDE;
            if ShellExecuteExW(&mut info) == 0 {
                let err = GetLastError();
                return Err(if err == ERROR_CANCELLED { Elevate::Declined } else { Elevate::Failed(err) });
            }
            if info.hProcess.is_null() {
                return Err(Elevate::Failed(0));
            }
            let waited = WaitForSingleObject(info.hProcess, 60_000);
            let mut code: u32 = 0;
            GetExitCodeProcess(info.hProcess, &mut code);
            CloseHandle(info.hProcess);
            if waited != WAIT_OBJECT_0 {
                return Err(Elevate::TimedOut);
            }
            Ok(code)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// A real read of Windows' service table: a name nobody registered is NOT installed.
        #[test]
        fn a_service_nobody_registered_is_not_installed() {
            assert_eq!(service_state("CGBridge-test-not-a-service"), ServiceState::NotInstalled);
        }

        /// A real read of the TCP table: a port this test listens on is held by THIS process.
        #[test]
        fn a_listener_is_found_by_its_port_and_named_by_its_image() {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            assert_eq!(listener_pid(port), Some(std::process::id()));
            let path = image_path(std::process::id()).expect("our own image path");
            assert!(path.to_ascii_lowercase().ends_with(".exe"), "{path}");
            // …and a test binary is not ours to stop.
            assert!(!super::super::is_ours(&path));
            drop(listener);
            assert_eq!(listener_pid(port), None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ours_is_cg_bridge_exe_in_cg_bridge_or_cg_control_and_nothing_else() {
        assert!(is_ours(r"C:\Program Files\CG Bridge\cg-bridge.exe"));
        assert!(is_ours(r"C:\Users\op\AppData\Local\CG Control\cg-bridge.exe"));
        assert!(is_ours(r"C:\PROGRAM FILES\cg bridge\CG-BRIDGE.EXE"));
        // Never the Playout engine, CasparCG, a node, or a cg-bridge.exe in some other folder.
        assert!(!is_ours(r"C:\Program Files\CasparCG\casparcg.exe"));
        assert!(!is_ours(r"C:\Program Files\Apasai Playout\cg-bridge.exe"));
        assert!(!is_ours(r"C:\Program Files\CG Bridge\node.exe"));
        assert!(!is_ours(r"C:\Program Files\CG Bridge\shawl.exe"));
        assert!(!is_ours("cg-bridge.exe"));
        assert!(!is_ours(""));
    }

    #[test]
    fn this_machine_is_loopback_or_an_address_it_holds() {
        assert!(is_this_machine("127.0.0.1"));
        assert!(is_this_machine("localhost"));
        assert!(is_this_machine("[::1]"));
        // A documentation address no interface holds (RFC 5737).
        assert!(!is_this_machine("192.0.2.123"));
    }

    #[test]
    fn another_machine_is_elsewhere() {
        assert_eq!(state("192.0.2.123"), LocalBridge::Elsewhere);
    }

    #[test]
    fn an_unknown_act_is_refused_before_anything_is_asked() {
        assert!(matches!(act_on("stop-everything", None), ActOutcome::Failed { .. }));
        assert!(matches!(act_on("free", None), ActOutcome::Failed { .. }));
    }

    #[test]
    fn the_elevated_verbs_and_their_refusals() {
        let args = |s: &str| s.split(' ').map(String::from).collect::<Vec<_>>();
        assert_eq!(service_verb(&args("cg-control.exe")), None);
        assert_eq!(service_verb(&args("cg-control.exe --cg-service")), Some(exit::USAGE));
        assert_eq!(service_verb(&args("cg-control.exe --cg-service free")), Some(exit::USAGE));
        assert_eq!(service_verb(&args("cg-control.exe --cg-service stop-everything")), Some(exit::USAGE));
    }

    #[cfg(windows)]
    #[test]
    fn free_refuses_a_process_that_is_not_ours_and_leaves_it_running() {
        // This test process: alive, not `cg-bridge.exe` — the elevated step must refuse it.
        let me = std::process::id();
        assert_eq!(free(me), exit::NOT_OURS);
    }

    #[test]
    fn the_page_reads_kebab_case_kinds() {
        let here = LocalBridge::Here {
            service: ServiceState::NotInstalled,
            holder: Some(Holder { pid: 7, name: "casparcg.exe".into(), ours: false }),
        };
        assert_eq!(
            serde_json::to_string(&here).unwrap(),
            r#"{"kind":"here","service":"not-installed","holder":{"pid":7,"name":"casparcg.exe","ours":false}}"#
        );
        assert_eq!(
            serde_json::to_string(&ActOutcome::Refused { code: 5 }).unwrap(),
            r#"{"kind":"refused","code":5}"#
        );
    }
}
