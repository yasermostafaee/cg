//! The bridge sidecar: start it, wait for it, stop it (ADR 0011).
//!
//! The installed app carries the official `node.exe` (installed as `cg-bridge.exe`) and the
//! bridge bundled into one file. Every path the bridge persists is rooted in this user's own
//! data folder through `--state-home` — never `~/.cg-runtime`, which on a developer's machine
//! names a real plant.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, Webview};

/// The console's origin — one fixed string on every install (ADR 0011).
const CONSOLE_URL: &str = "http://127.0.0.1:5174/";
const CONSOLE_ADDR: ([u8; 4], u16) = ([127, 0, 0, 1], 5174);
/// The bridge's identity route on the console origin (`console-http-server.ts`).
const HEALTH_PATH: &str = "/__cg/health";
const BRIDGE_APP: &str = "cg-caspar-bridge";
const START_TIMEOUT: Duration = Duration::from_secs(40);
const STOP_GRACE: Duration = Duration::from_secs(6);
/// Every port the bridge binds, so a failed start can name who holds one.
const BRIDGE_PORTS: [(&str, u16); 4] = [("TCP", 5174), ("TCP", 5280), ("TCP", 7911), ("UDP", 6250)];

/// The sidecar this app started, and what the starting screen should say if it failed.
#[derive(Default)]
pub struct Bridge {
    child: Mutex<Option<Child>>,
    failure: Mutex<Option<String>>,
    log: Mutex<Option<PathBuf>>,
}

#[derive(Deserialize)]
struct Health {
    app: String,
    pid: u32,
    #[serde(rename = "execPath")]
    exec_path: String,
}

struct Paths {
    node: PathBuf,
    bundle: PathBuf,
    console: PathBuf,
    state_home: PathBuf,
    logs: PathBuf,
}

// ── The shell's own log ───────────────────────────────────────────────────────

/// `%APPDATA%\CG Control\logs` — resolved without Tauri, so the very first line and a panic
/// before the app is built still have somewhere to go.
fn logs_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("CG Control").join("logs")
}

/// One line in `shell.log`, beside the bridge's own log. Never fails the caller.
pub fn log(message: &str) {
    let dir = logs_dir();
    let _ = fs::create_dir_all(&dir);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(dir.join("shell.log")) {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "[{secs}] {message}");
    }
}

/// A panic in a windowed app is otherwise invisible: it has no console to print to.
pub fn install_panic_log() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log(&format!("PANIC: {info}"));
        default(info);
    }));
}

// ── Where things are ─────────────────────────────────────────────────────────

/// A path without Windows' `\\?\` verbatim prefix, which Tauri's resource dir carries and Node's
/// module loader cannot resolve: measured on the first installer run, `node \\?\C:\…\bridge.mjs`
/// died in `realpathSync` with `EISDIR: lstat 'C:'` before running a line. A `\\?\UNC\` share
/// keeps its prefix — stripping that one would change the path.
fn plain(path: PathBuf) -> PathBuf {
    let stripped = {
        let text = path.to_string_lossy();
        match text.strip_prefix(r"\\?\") {
            Some(rest) if !rest.starts_with(r"UNC\") => Some(PathBuf::from(rest)),
            _ => None,
        }
    };
    stripped.unwrap_or(path)
}

fn paths<R: Runtime>(app: &AppHandle<R>) -> Result<Paths, String> {
    let exe = std::env::current_exe().map_err(|e| format!("CG Control cannot find itself: {e}"))?;
    let dir = exe
        .parent()
        .ok_or("CG Control cannot find its own folder.")?
        .to_path_buf();
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("CG Control cannot find its files: {e}"))?;
    let data = app
        .path()
        .data_dir()
        .map_err(|e| format!("CG Control cannot find the user data folder: {e}"))?
        .join("CG Control");
    let (dir, resources, data) = (plain(dir), plain(resources), plain(data));
    Ok(Paths {
        node: dir.join("cg-bridge.exe"),
        bundle: resources.join("payload").join("bridge").join("caspar-bridge.mjs"),
        console: resources.join("payload").join("console"),
        logs: data.join("logs"),
        state_home: data,
    })
}

/// A command that opens no console window of its own.
fn quiet(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

// ── Start, restart, stop ─────────────────────────────────────────────────────

/// Start the bridge and load the console from it; on any failure, say so on the starting screen.
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    log("starting the bridge");
    let result = spawn_bridge(app).and_then(|()| {
        let window = app
            .get_webview_window("main")
            .ok_or("The CG Control window is missing.")?;
        window
            .navigate(CONSOLE_URL.parse().expect("the console URL is a valid URL"))
            .map_err(|e| format!("The console could not be opened: {e}"))
    });
    match result {
        Ok(()) => log("the console is open"),
        Err(message) => {
            log(&format!("start failed: {message}"));
            fail(app, &message);
        }
    }
}

/// Spawn the sidecar and wait until it answers on the console origin.
fn spawn_bridge<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let p = paths(app)?;
    log(&format!(
        "sidecar {} · bundle {} · console {} · state {}",
        p.node.display(),
        p.bundle.display(),
        p.console.display(),
        p.state_home.display()
    ));
    fs::create_dir_all(&p.logs)
        .map_err(|e| format!("CG Control cannot create {}: {e}", p.logs.display()))?;
    let log_path = p.logs.join("bridge.log");
    // One previous run is kept beside the current one — enough to send after a bad night.
    if fs::metadata(&log_path).map(|m| m.len() > 0).unwrap_or(false) {
        let _ = fs::rename(&log_path, p.logs.join("bridge.previous.log"));
    }
    {
        let state = app.state::<Bridge>();
        *state.log.lock().unwrap_or_else(|e| e.into_inner()) = Some(log_path.clone());
    }

    clear_leftover(&p)?;

    let mut bridge_log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("CG Control cannot write its log at {}: {e}", log_path.display()))?;
    let _ = writeln!(
        bridge_log,
        "---- CG Control {} starting the bridge",
        app.package_info().version
    );
    let bridge_err = bridge_log
        .try_clone()
        .map_err(|e| format!("CG Control cannot write its log: {e}"))?;

    let mut command = Command::new(&p.node);
    command
        .arg(&p.bundle)
        .arg("--state-home")
        .arg(&p.state_home)
        .arg("--console-dir")
        .arg(&p.console)
        .arg("--console-port")
        .arg("5174")
        .arg("--template-serve-port")
        .arg("7911")
        .arg("--first-run")
        .arg("--exit-on-stdin-close")
        .current_dir(&p.state_home)
        .env("WS_NO_BUFFER_UTIL", "1")
        .env("WS_NO_UTF_8_VALIDATE", "1")
        // The lifeline: this app holds the write end and never writes. When the app exits —
        // or is killed — the pipe closes and the bridge stops itself.
        .stdin(Stdio::piped())
        .stdout(Stdio::from(bridge_log))
        .stderr(Stdio::from(bridge_err));
    let child = quiet(&mut command)
        .spawn()
        .map_err(|e| format!("The control service could not start: {e}"))?;
    log(&format!("bridge spawned, pid {}", child.id()));
    {
        let state = app.state::<Bridge>();
        *state.child.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
    }
    wait_until_healthy(app)?;
    log("bridge healthy on 5174");
    Ok(())
}

fn wait_until_healthy<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if read_health().map(|h| h.app == BRIDGE_APP).unwrap_or(false) {
            return Ok(());
        }
        {
            let state = app.state::<Bridge>();
            let mut guard = state.child.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(child) = guard.as_mut() {
                if let Ok(Some(status)) = child.try_wait() {
                    *guard = None;
                    return Err(format!("The control service stopped while starting ({status})."));
                }
            }
        }
        if Instant::now() >= deadline {
            return Err("The control service did not answer within 40 seconds.".into());
        }
        thread::sleep(Duration::from_millis(250));
    }
}

/// One HTTP/1.0 GET of the health route. `None` for anything but a 200 carrying the identity.
fn read_health() -> Option<Health> {
    let addr = SocketAddr::from(CONSOLE_ADDR);
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
    let request = format!("GET {HEALTH_PATH} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).ok()?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).ok()?;
    let text = String::from_utf8_lossy(&raw);
    let (head, body) = text.split_once("\r\n\r\n")?;
    if !(head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")) {
        return None;
    }
    serde_json::from_str(body.trim()).ok()
}

/// A bridge still holding the console port from a crashed run.
///
/// Stopped and started fresh, never reused: its lifeline belonged to a process that is gone, so
/// nothing would stop it when this app exits. It is stopped ONLY when it is this installation's
/// own sidecar; a bridge started by hand from a checkout holds the same ports and is not ours.
fn clear_leftover(p: &Paths) -> Result<(), String> {
    let Some(health) = read_health() else {
        return Ok(());
    };
    if health.app != BRIDGE_APP {
        return Ok(());
    }
    if !health
        .exec_path
        .eq_ignore_ascii_case(&p.node.to_string_lossy())
    {
        return Err(format!(
            "Another bridge is already running on this machine ({}). Stop it, then start CG Control again.",
            health.exec_path
        ));
    }
    log(&format!("stopping a leftover bridge, pid {}", health.pid));
    let _ = quiet(
        Command::new("taskkill").args(["/PID", &health.pid.to_string(), "/T", "/F"]),
    )
    .status();
    let deadline = Instant::now() + Duration::from_secs(10);
    while read_health().is_some() {
        if Instant::now() >= deadline {
            return Err("A previous control service would not stop.".into());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Ok(())
}

/// Stop the bridge: close its lifeline, give it a moment to stop cleanly, then end it.
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<Bridge>();
    let mut guard = state.child.lock().unwrap_or_else(|e| e.into_inner());
    let Some(mut child) = guard.take() else {
        return;
    };
    log(&format!("stopping the bridge, pid {}", child.id()));
    drop(child.stdin.take());
    let deadline = Instant::now() + STOP_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
            _ => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

// ── The one door that writes the Playout target ──────────────────────────────

/// 🔴 `DESKTOP-APPS-01-A` — **SET THE PLAYOUT ADDRESS**, from the console in THIS window only
/// (`capabilities/console.json`), and never over the control socket.
///
/// The bridge's own CLI writes the file (`--set-playout-address`, a one-shot that binds nothing),
/// so there is ONE writer of the playout config and it lives beside the reader; it replaces the
/// whole Playout group, which clears an adopted issuer. The running bridge is then restarted so
/// the new target is in force; the console reconnects on its own.
#[tauri::command]
pub async fn set_playout_address(app: AppHandle, address: String) -> Result<String, String> {
    match tauri::async_runtime::spawn_blocking(move || change_playout_address(&app, &address)).await {
        Ok(result) => result,
        Err(err) => Err(err.to_string()),
    }
}

fn change_playout_address(app: &AppHandle, address: &str) -> Result<String, String> {
    let p = paths(app)?;
    log(&format!("setting the Playout address to {address}"));
    let output = quiet(
        Command::new(&p.node)
            .arg(&p.bundle)
            .arg("--state-home")
            .arg(&p.state_home)
            .arg("--set-playout-address")
            .arg(address),
    )
    .output()
    .map_err(|e| format!("The Playout address could not be saved: {e}"))?;
    let said = String::from_utf8_lossy(&output.stderr)
        .lines()
        .last()
        .unwrap_or("")
        .trim_start_matches("[caspar-bridge] ")
        .to_string();
    if !output.status.success() {
        log(&format!("the Playout address was refused: {said}"));
        return Err(said);
    }
    stop(app);
    spawn_bridge(app)?;
    Ok(said)
}

// ── Saying it on the starting screen ─────────────────────────────────────────

/// Open Explorer on the bridge log, selected — the file a client sends us.
pub fn open_log<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<Bridge>();
    let log_file = state.log.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let Some(path) = log_file else {
        return;
    };
    let mut command = Command::new("explorer.exe");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.raw_arg(format!("/select,\"{}\"", path.display()));
    }
    #[cfg(not(windows))]
    command.arg(&path);
    let _ = command.spawn();
}

/// Who holds each of the bridge's ports, in one line per port. Locale-independent: a TCP
/// listener is recognised by its foreign address ending `:0`, not by the word LISTENING.
fn port_holders() -> Vec<String> {
    let Ok(output) = quiet(Command::new("netstat").arg("-ano")).output() else {
        return Vec::new();
    };
    let table = String::from_utf8_lossy(&output.stdout);
    let mut held = Vec::new();
    for (proto, port) in BRIDGE_PORTS {
        let suffix = format!(":{port}");
        let holder = table.lines().find_map(|line| {
            let cols: Vec<&str> = line.split_whitespace().collect();
            let listening = proto == "UDP" || cols.get(2).map(|f| f.ends_with(":0")).unwrap_or(false);
            (cols.len() >= 4
                && cols[0].eq_ignore_ascii_case(proto)
                && cols[1].ends_with(&suffix)
                && listening)
                .then(|| cols[cols.len() - 1].to_string())
        });
        if let Some(pid) = holder {
            held.push(format!(
                "{port}/{} is held by {} (PID {pid})",
                proto.to_lowercase(),
                process_name(&pid)
            ));
        }
    }
    held
}

fn process_name(pid: &str) -> String {
    quiet(Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"]))
        .output()
        .ok()
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).to_string();
            text.split(',')
                .next()
                .map(|name| name.trim().trim_matches('"').to_string())
        })
        .filter(|name| name.to_ascii_lowercase().ends_with(".exe"))
        .unwrap_or_else(|| "another program".to_string())
}

fn fail<R: Runtime>(app: &AppHandle<R>, message: &str) {
    let state = app.state::<Bridge>();
    let log_file = state
        .log
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .map(|p| p.display().to_string());
    let held = port_holders();
    for line in &held {
        log(line);
    }
    let payload = serde_json::json!({
        "message": message,
        "held": held,
        "log": log_file,
    })
    .to_string();
    *state.failure.lock().unwrap_or_else(|e| e.into_inner()) = Some(payload.clone());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(failure_script(&payload));
    }
}

/// Re-deliver a start failure to a page that finished loading after it happened.
pub fn replay_failure<R: Runtime>(webview: &Webview<R>) {
    let failure = {
        let state = webview.app_handle().state::<Bridge>();
        let stored = state.failure.lock().unwrap_or_else(|e| e.into_inner()).clone();
        stored
    };
    if let Some(payload) = failure {
        let _ = webview.eval(failure_script(&payload));
    }
}

fn failure_script(payload: &str) -> String {
    format!("window.cgStartFailed && window.cgStartFailed({payload});")
}
