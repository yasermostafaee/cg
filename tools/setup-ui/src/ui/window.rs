//! The setup window: one frameless 800 × 520 window of our own.
//!
//! - Frameless but a real top-level window: the system's shadow, Windows 11's rounded corners and
//!   its border (DWM), a square edge with our own 1 px border on Windows 10, its own title bar
//!   (minimise and close only), no resize and no maximise.
//! - Per-monitor DPI v2: every DIP is redrawn at the monitor's scale; nothing is a stretched bitmap.
//! - The keyboard: Tab / Shift+Tab, Enter for the page's primary, Space for the focused control,
//!   Esc for Cancel where Cancel is allowed; focus is drawn only once the keyboard moved it.
//! - Motion: a short page entrance, the rail's tick drawing in, the bar easing toward the real
//!   value — and none of it when Windows' "Animation effects" is off.
//! - UI Automation: every text and control of the page is in the tree (`uia.rs`).

use super::gfx::{paint, Device, Frame, Gfx};
use super::uia;
use crate::cmdline::{self, Parsed};
use crate::engine::{self, Child, Payload};
use crate::field::Field;
use crate::layout::{
    build, help_target, HelpTarget, Scene, WidgetId, WidgetKind, RAIL_W, TITLE_H, WIN_H, WIN_W,
};
use crate::model::{Facts, Model, Outcome, Page, Space, StepState, MAX_STEPS};
use crate::observe::{self, AppSignals, Progress};
use crate::product::{product, Home, ProductId, BRIDGE_DATA, BRIDGE_SERVICE};
use crate::server::{AddressChoice, ServerSetup, StoredBridge, OPTIONS};
use crate::win;
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use windows::core::{w, Interface, BOOL, HSTRING, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWINDOWATTRIBUTE,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
use windows::Win32::Graphics::Gdi::{
    BeginPaint, EndPaint, GetMonitorInfoW, InvalidateRect, MonitorFromPoint, ScreenToClient,
    MONITORINFO, MONITOR_DEFAULTTOPRIMARY, PAINTSTRUCT,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    COINIT_DISABLE_OLE1DDE,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, ReleaseCapture, SetCapture, TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT, VK_BACK,
    VK_CONTROL, VK_DELETE, VK_END, VK_ESCAPE, VK_HOME, VK_LEFT, VK_RETURN, VK_RIGHT, VK_SHIFT,
    VK_SPACE, VK_TAB,
};
use windows::Win32::UI::Shell::{
    FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName, FOS_FORCEFILESYSTEM,
    FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
};
use windows::Win32::UI::WindowsAndMessaging::*;

/// `WM_MOUSELEAVE` (winuser.h); not in the `windows` crate's WindowsAndMessaging module.
const WM_MOUSELEAVE: u32 = 0x02A3;
const WM_APP_UPDATE: u32 = WM_APP + 1;
pub const WM_APP_INVOKE: u32 = WM_APP + 2;
pub const WM_APP_FOCUS: u32 = WM_APP + 3;
/// UI Automation's `SetValue` on a text field (the text waits in `uia::take_value`).
pub const WM_APP_SETVALUE: u32 = WM_APP + 4;
const TIMER_FRAME: usize = 1;

/// A window handle that may cross to the worker threads (they only post to it).
#[derive(Clone, Copy)]
struct Hwnd(HWND);
unsafe impl Send for Hwnd {}
unsafe impl Sync for Hwnd {}

impl Hwnd {
    /// "The workers wrote something": the window reads it on its own thread.
    fn post_update(&self) {
        unsafe {
            let _ = PostMessageW(Some(self.0), WM_APP_UPDATE, WPARAM(0), LPARAM(0));
        }
    }
}

/// What the worker threads tell the window.
#[derive(Default)]
struct Shared {
    prepared: f32,
    engine: Option<PathBuf>,
    prepare_error: Option<String>,
    progress: Option<Progress>,
    finished: Option<Outcome>,
}

/// One widget id as a message parameter. One of this server's addresses is `ADDRESS_CODE + i`.
pub fn widget_code(id: WidgetId) -> usize {
    match id {
        WidgetId::Address(i) => ADDRESS_CODE + usize::from(i),
        _ => ALL_WIDGETS.iter().position(|w| *w == id).unwrap_or(0),
    }
}
pub fn widget_from_code(code: usize) -> Option<WidgetId> {
    if (ADDRESS_CODE..ADDRESS_CODE + 256).contains(&code) {
        return u8::try_from(code - ADDRESS_CODE)
            .ok()
            .map(WidgetId::Address);
    }
    ALL_WIDGETS.get(code).copied()
}
const ADDRESS_CODE: usize = 100;
const ALL_WIDGETS: [WidgetId; 17] = [
    WidgetId::Next,
    WidgetId::Back,
    WidgetId::Cancel,
    WidgetId::Install,
    WidgetId::Change,
    WidgetId::Launch,
    WidgetId::Finish,
    WidgetId::OpenLog,
    WidgetId::Close,
    WidgetId::Help,
    WidgetId::Minimize,
    WidgetId::CloseWindow,
    WidgetId::Separate,
    WidgetId::PlayoutField,
    WidgetId::AmcpField,
    WidgetId::AddressOther,
    WidgetId::AddressOtherField,
];

/// What must run after the window's state is released (each may re-enter the window procedure).
enum Effect {
    Minimize,
    Destroy,
    PickFolder,
    Open { target: String, as_user: bool },
    Move(RECT),
}

pub struct App {
    pub hwnd: HWND,
    gfx: Gfx,
    rt: Option<ID2D1HwndRenderTarget>,
    dev: Device,
    pub model: Model,
    pub scene: Scene,
    /// Bumped whenever the set of elements UI Automation sees may change.
    pub generation: u32,
    payload: Payload,
    parsed: Parsed,
    tile: Option<Vec<u8>>,
    dpi: u32,
    win11: bool,
    reduced_motion: bool,
    hover: Option<WidgetId>,
    hover_t: HashMap<WidgetId, f32>,
    pressed: Option<WidgetId>,
    pub focus: Option<WidgetId>,
    focus_visible: bool,
    tracking: bool,
    page_at: Instant,
    step_at: [Option<Instant>; MAX_STEPS],
    mark_at: Option<Instant>,
    last_frame: Instant,
    timer: bool,
    hold_at: Option<Instant>,
    pending_outcome: Option<Outcome>,
    shared: Arc<Mutex<Shared>>,
    cancel: Arc<AtomicBool>,
    temp: Option<PathBuf>,
    installing: bool,
    exit_code: u32,
    log: PathBuf,
}

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
}

/// Read the window's state from UI Automation (never while the window procedure holds it).
pub fn with_app<R>(f: impl FnOnce(&App) -> R) -> Option<R> {
    APP.with(|a| a.try_borrow().ok().and_then(|g| g.as_ref().map(f)))
}

fn log_line(path: &Path, line: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{now}] {line}");
    }
}

fn detect(payload: &Payload) -> Facts {
    let p = product(payload.config.product);
    let per_machine = p.home == Home::ProgramFiles;
    let (root, view) = if per_machine {
        (win::hklm(), win::View::Native64)
    } else {
        (win::hkcu(), win::View::Native64)
    };
    let installed_version = win::reg_string(root, p.uninstall_key, "DisplayVersion", view);
    let installed_dir = installed_version.as_ref().and_then(|_| {
        win::reg_string(root, p.uninstall_key, "InstallLocation", view)
            .map(|d| d.trim().trim_matches('"').to_string())
    });
    let webview2_missing = p.uses_webview2 && {
        let key = r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        win::reg_string(win::hklm(), key, "pv", win::View::Wow32).is_none()
            && win::reg_string(win::hkcu(), key, "pv", win::View::Wow32).is_none()
    };
    let default_dir = match p.home {
        Home::LocalAppData => format!(r"{}\{}", win::local_app_data(), p.name),
        Home::ProgramFiles => format!(r"{}\{}", win::program_files_64(), p.name),
    };
    let bridge = p.id == ProductId::Bridge;
    Facts {
        installed_version,
        installed_dir,
        app_running: !bridge && win::process_running(p.main_exe),
        webview2_missing,
        os_is_64bit: win::os_is_64bit(),
        default_dir,
        data_dir: bridge.then(|| format!(r"{}\{}", win::program_data(), BRIDGE_DATA)),
        // `RELEASE-0111-01` Part A — what the separate-server page starts from: the stored
        // configuration (an upgrade), and this machine's addresses. CG Setup runs as an administrator
        // for CG Bridge, the one account (with SYSTEM) its data folder lets read.
        bridge_config: bridge
            .then(|| {
                std::fs::read(
                    Path::new(&win::program_data())
                        .join(BRIDGE_DATA)
                        .join("cg-bridge.json"),
                )
                .ok()
                .and_then(|raw| StoredBridge::from_json(&raw))
            })
            .flatten(),
        ipv4: if bridge {
            win::ipv4_addresses()
        } else {
            Vec::new()
        },
    }
}

/// `RELEASE-0111-01` Part A — the three separate-server options on this installer's own command line.
fn given_server(rest: &str) -> StoredBridge {
    StoredBridge {
        playout: cmdline::option_value(rest, OPTIONS[0]),
        amcp_host: cmdline::option_value(rest, OPTIONS[1]),
        bridge_address: cmdline::option_value(rest, OPTIONS[2]),
    }
}

fn measure_space(model: &mut Model) {
    let dir = PathBuf::from(&model.dir);
    let (drive, free) = win::free_space(&dir);
    model.space = Space {
        drive,
        free,
        writable: win::writable(&dir),
    };
}

pub fn run(payload: Payload, parsed: Parsed) -> u32 {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    }
    super::dpi::per_monitor_v2();
    let p = product(payload.config.product);
    let log = std::env::temp_dir().join(format!("{} Setup {}.log", p.name, payload.config.version));
    log_line(
        &log,
        &format!("==== {} {} setup window", p.name, payload.config.version),
    );
    let facts = detect(&payload);
    log_line(&log, &format!("found: {facts:?}"));
    let mut model = Model::new(
        p,
        payload.config.clone(),
        facts,
        parsed.install_dir.clone(),
        payload.blob("guide").is_some(),
    );
    // The command line wins over what is stored, as it does for the engine.
    model.server = ServerSetup::new(
        model.facts.bridge_config.as_ref(),
        &given_server(&parsed.rest),
        model.facts.ipv4.clone(),
    );
    log_line(
        &log,
        &format!(
            "separate server: {} ({} address(es) on this machine)",
            model.server.separate,
            model.server.addresses.len()
        ),
    );
    measure_space(&mut model);
    let Ok(gfx) = Gfx::new() else {
        log_line(
            &log,
            "Direct2D could not start: running the engine's own window instead",
        );
        return fallback(&payload, &parsed);
    };
    let tile = payload.read("tile");
    let shared = Arc::new(Mutex::new(Shared::default()));
    let cancel = Arc::new(AtomicBool::new(false));

    let hwnd = match create_window(&format!("{} Setup", p.name)) {
        Some(h) => h,
        None => {
            log_line(
                &log,
                "the window could not be created: running the engine's own window instead",
            );
            return fallback(&payload, &parsed);
        }
    };
    let dpi = super::dpi::for_window(hwnd).max(96);
    let win11 = dwm_frame(hwnd);
    let scene = build(&model, &gfx);
    let app = App {
        hwnd,
        gfx,
        rt: None,
        dev: Device::default(),
        model,
        scene,
        generation: 1,
        payload,
        parsed,
        tile,
        dpi,
        win11,
        reduced_motion: win::reduced_motion(),
        hover: None,
        hover_t: HashMap::new(),
        pressed: None,
        focus: None,
        focus_visible: false,
        tracking: false,
        page_at: Instant::now(),
        step_at: [None; MAX_STEPS],
        mark_at: None,
        last_frame: Instant::now(),
        timer: false,
        hold_at: None,
        pending_outcome: None,
        shared,
        cancel,
        temp: None,
        installing: false,
        exit_code: 1,
        log,
    };
    APP.with(|a| *a.borrow_mut() = Some(app));
    APP.with(|a| {
        if let Some(app) = a.borrow_mut().as_mut() {
            app.start_prepare();
            app.focus = app.scene.primary;
            app.ensure_timer();
        }
    });
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    let (code, temp) = APP
        .with(|a| {
            a.borrow_mut()
                .take()
                .map(|app| (app.exit_code, app.temp.clone()))
        })
        .unwrap_or((2, None));
    if let Some(dir) = temp {
        engine::cleanup(&dir);
    }
    code
}

/// If the window cannot exist (no Direct2D, no window station), the engine's own interactive window
/// installs exactly as before: it is today's installer.
fn fallback(payload: &Payload, parsed: &Parsed) -> u32 {
    let Ok(dir) = engine::temp_dir() else {
        return 2;
    };
    let engine_path = dir.join(&payload.config.engine_name);
    let never = AtomicBool::new(false);
    let code = match engine::extract(payload, "engine", &engine_path, &never, &|_| {}) {
        Ok(()) => engine::spawn(
            &engine_path,
            &cmdline::passthrough_command_line(&engine_path.to_string_lossy(), &parsed.tail),
            true,
        )
        .map(|c| c.wait())
        .unwrap_or(2),
        Err(_) => 2,
    };
    engine::cleanup(&dir);
    code
}

fn create_window(title: &str) -> Option<HWND> {
    unsafe {
        let instance: HINSTANCE = GetModuleHandleW(None).ok()?.into();
        // The installer's own icon (the packer sets it): the product's tile.
        let big = LoadImageW(
            Some(instance),
            PCWSTR(1 as *const u16),
            IMAGE_ICON,
            GetSystemMetrics(SM_CXICON),
            GetSystemMetrics(SM_CYICON),
            LR_DEFAULTCOLOR,
        )
        .ok();
        let small = LoadImageW(
            Some(instance),
            PCWSTR(1 as *const u16),
            IMAGE_ICON,
            GetSystemMetrics(SM_CXSMICON),
            GetSystemMetrics(SM_CYSMICON),
            LR_DEFAULTCOLOR,
        )
        .ok();
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_DBLCLKS,
            lpfnWndProc: Some(wndproc),
            hInstance: instance,
            hIcon: HICON(big.map(|h| h.0).unwrap_or_default()),
            hIconSm: HICON(small.map(|h| h.0).unwrap_or_default()),
            hCursor: LoadCursorW(None, IDC_ARROW).ok()?,
            lpszClassName: w!("ApasaiCgSetup"),
            ..Default::default()
        };
        RegisterClassExW(&class);
        // The monitor the pointer is on, at its own DPI, centred in its work area.
        let mut pt = POINT::default();
        let _ = GetCursorPos(&mut pt);
        let monitor = MonitorFromPoint(pt, MONITOR_DEFAULTTOPRIMARY);
        let dx = super::dpi::for_monitor(monitor);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let _ = GetMonitorInfoW(monitor, &mut info);
        let s = dx.max(96) as f32 / 96.0;
        let (w, h) = ((WIN_W * s).round() as i32, (WIN_H * s).round() as i32);
        let wa = info.rcWork;
        let x = wa.left + ((wa.right - wa.left) - w) / 2;
        let y = wa.top + ((wa.bottom - wa.top) - h) / 2;
        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW,
            w!("ApasaiCgSetup"),
            &HSTRING::from(title),
            WS_POPUP | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
            x,
            y,
            w,
            h,
            None,
            None,
            Some(instance),
            None,
        )
        .ok()?;
        Some(hwnd)
    }
}

/// The system's shadow, dark immersive chrome, and — on Windows 11 — rounded corners and a border
/// in the console's line colour. Returns whether Windows 11's DWM attributes took.
fn dwm_frame(hwnd: HWND) -> bool {
    unsafe {
        let on = BOOL(1);
        let _ = DwmSetWindowAttribute(hwnd, DWMWINDOWATTRIBUTE(20), (&on as *const BOOL).cast(), 4);
        let round: i32 = 2; // DWMWCP_ROUND
        let win11 = DwmSetWindowAttribute(
            hwnd,
            DWMWINDOWATTRIBUTE(33),
            (&round as *const i32).cast(),
            4,
        )
        .is_ok();
        let b = crate::palette::BORDER;
        let border = COLORREF(u32::from(b.0) | (u32::from(b.1) << 8) | (u32::from(b.2) << 16));
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWINDOWATTRIBUTE(34),
            (&border as *const COLORREF).cast(),
            4,
        );
        let margins = MARGINS {
            cxLeftWidth: 1,
            cxRightWidth: 1,
            cyTopHeight: 1,
            cyBottomHeight: 1,
        };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
        win11
    }
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_GETOBJECT {
        if let Some(r) = uia::on_get_object(hwnd, wparam, lparam) {
            return r;
        }
    }
    let handled = APP.with(|a| match a.try_borrow_mut() {
        Ok(mut guard) => guard.as_mut().map(|app| app.handle(msg, wparam, lparam)),
        Err(_) => None,
    });
    match handled {
        Some((result, effects)) => {
            for e in effects {
                run_effect(hwnd, e);
            }
            uia::flush(hwnd);
            match result {
                Some(r) => r,
                None => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
            }
        }
        None => match msg {
            WM_NCCALCSIZE if wparam.0 != 0 => LRESULT(0),
            _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
        },
    }
}

fn run_effect(hwnd: HWND, e: Effect) {
    unsafe {
        match e {
            Effect::Minimize => {
                let _ = ShowWindow(hwnd, SW_MINIMIZE);
            }
            Effect::Destroy => {
                let _ = DestroyWindow(hwnd);
            }
            Effect::Move(r) => {
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    r.left,
                    r.top,
                    r.right - r.left,
                    r.bottom - r.top,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );
            }
            Effect::Open { target, as_user } => {
                if as_user {
                    win::shell_open_as_user(&target);
                } else {
                    win::shell_open(&target);
                }
            }
            Effect::PickFolder => {
                let start =
                    with_app(|a| (a.model.dir.clone(), a.model.product.name)).unwrap_or_default();
                if let Some(chosen) = pick_folder(hwnd, &start.0, start.1) {
                    APP.with(|a| {
                        if let Ok(mut g) = a.try_borrow_mut() {
                            if let Some(app) = g.as_mut() {
                                app.model.dir = chosen;
                                measure_space(&mut app.model);
                                log_line(&app.log, &format!("folder chosen: {}", app.model.dir));
                                app.rebuild();
                            }
                        }
                    });
                }
            }
        }
    }
}

/// The system folder picker. The product's own folder name is added to a folder that is not it, as
/// NSIS's directory page always did.
fn pick_folder(hwnd: HWND, current: &str, name: &str) -> Option<String> {
    unsafe {
        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        let opts = dialog.GetOptions().ok()?;
        dialog
            .SetOptions(opts | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST)
            .ok()?;
        let _ = dialog.SetTitle(&HSTRING::from(format!("Choose a folder for {name}")));
        if let Some(start) = win::nearest_existing(Path::new(current)) {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(
                &HSTRING::from(start.as_os_str()),
                None,
            ) {
                let _ = dialog.SetFolder(&item);
            }
        }
        dialog.Show(Some(hwnd)).ok()?;
        let item = dialog.GetResult().ok()?;
        let path = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let chosen = path.to_string().ok()?;
        windows::Win32::System::Com::CoTaskMemFree(Some(path.0 as *const _));
        let last = Path::new(&chosen)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        Some(if last.eq_ignore_ascii_case(name) {
            chosen
        } else {
            format!(r"{}\{}", chosen.trim_end_matches('\\'), name)
        })
    }
}

fn ease(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    1.0 - (1.0 - t).powi(3)
}

impl App {
    fn scale(&self) -> f32 {
        self.dpi as f32 / 96.0
    }

    fn duration(&self, ms: u64) -> Duration {
        if self.reduced_motion {
            Duration::ZERO
        } else {
            Duration::from_millis(ms)
        }
    }

    fn progress_of(&self, at: Option<Instant>, ms: u64) -> f32 {
        let d = self.duration(ms);
        match at {
            None => 1.0,
            Some(_) if d.is_zero() => 1.0,
            Some(t) => (t.elapsed().as_secs_f32() / d.as_secs_f32()).clamp(0.0, 1.0),
        }
    }

    pub fn rebuild(&mut self) {
        let before: Vec<_> = self
            .scene
            .widgets
            .iter()
            .map(|w| (w.id, w.enabled))
            .collect();
        let texts_before = self.scene.texts().len();
        self.scene = build(&self.model, &self.gfx);
        let after: Vec<_> = self
            .scene
            .widgets
            .iter()
            .map(|w| (w.id, w.enabled))
            .collect();
        if before != after || texts_before != self.scene.texts().len() {
            self.generation += 1;
            uia::structure_changed(self.hwnd);
        }
        if let Some(f) = self.focus {
            if !self.scene.widget(f).is_some_and(|w| w.tabbable()) {
                self.focus = self
                    .scene
                    .primary
                    .filter(|p| self.scene.widget(*p).is_some_and(|w| w.enabled));
            }
        }
        self.invalidate();
    }

    fn invalidate(&self) {
        unsafe {
            let _ = InvalidateRect(Some(self.hwnd), None, false);
        }
    }

    fn ensure_timer(&mut self) {
        if !self.timer {
            unsafe { SetTimer(Some(self.hwnd), TIMER_FRAME, 16, None) };
            self.timer = true;
            self.last_frame = Instant::now();
        }
    }

    fn set_page(&mut self, page: Page) {
        let old = self.model.steps();
        self.model.page = page;
        let new = self.model.steps();
        for (i, (now, before)) in new.iter().zip(old.iter()).enumerate().take(MAX_STEPS) {
            if *now == StepState::Done && *before != StepState::Done {
                self.step_at[i] = Some(Instant::now());
            }
        }
        self.page_at = Instant::now();
        if matches!(page, Page::Done | Page::Failed) {
            self.mark_at = Some(Instant::now());
        }
        self.generation += 1;
        self.rebuild();
        self.focus = self
            .scene
            .primary
            .filter(|p| self.scene.widget(*p).is_some_and(|w| w.enabled));
        uia::structure_changed(self.hwnd);
        self.ensure_timer();
    }

    /// Animation step: returns whether anything is still moving.
    fn tick(&mut self) -> bool {
        let now = Instant::now();
        let dt = now.duration_since(self.last_frame).as_secs_f32().min(0.1);
        self.last_frame = now;
        let mut moving = false;
        // Hover fades (`--r-dur-fast`, 120 ms).
        let k = if self.reduced_motion {
            1.0
        } else {
            (dt / 0.12).min(1.0)
        };
        for w in &self.scene.widgets {
            let target = if self.hover == Some(w.id) { 1.0 } else { 0.0 };
            let v = self.hover_t.entry(w.id).or_insert(0.0);
            let next = if (target - *v).abs() < 0.02 {
                target
            } else {
                *v + (target - *v) * k * 1.6
            };
            if (next - *v).abs() > f32::EPSILON {
                moving = true;
            }
            *v = next.clamp(0.0, 1.0);
        }
        // The bar eases toward the REAL value and never past it (the splash rail's doctrine).
        let target = self.model.progress.fraction;
        if self.reduced_motion {
            self.model.shown = target;
        } else if self.model.shown < target {
            let next = self.model.shown + (target - self.model.shown) * (1.0 - (-dt / 0.18).exp());
            self.model.shown = if target - next < 0.002 { target } else { next };
            moving = true;
        } else {
            self.model.shown = target;
        }
        // A finished install shows its 100 % for a moment before Done.
        if let Some(outcome) = self.pending_outcome.clone() {
            if self.model.shown >= target - 0.001 {
                let hold = self.duration(350);
                let at = *self.hold_at.get_or_insert(now);
                if now.duration_since(at) >= hold {
                    self.pending_outcome = None;
                    self.hold_at = None;
                    self.finish(outcome);
                } else {
                    moving = true;
                }
            } else {
                moving = true;
            }
        }
        if self.progress_of(Some(self.page_at), 220) < 1.0 {
            moving = true;
        }
        if self
            .step_at
            .iter()
            .any(|t| t.is_some() && self.progress_of(*t, 520) < 1.0)
        {
            moving = true;
        }
        if self.mark_at.is_some() && self.progress_of(self.mark_at, 600) < 1.0 {
            moving = true;
        }
        if self.model.page == Page::Installing {
            // The bar and its percentage move every frame.
            self.rebuild();
        }
        moving
    }

    fn render(&mut self) {
        let scale = self.scale();
        if self.rt.is_none() {
            let mut rc = RECT::default();
            unsafe {
                let _ = GetClientRect(self.hwnd, &mut rc);
            }
            let props = D2D1_RENDER_TARGET_PROPERTIES {
                r#type: D2D1_RENDER_TARGET_TYPE_DEFAULT,
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_IGNORE,
                },
                dpiX: self.dpi as f32,
                dpiY: self.dpi as f32,
                usage: D2D1_RENDER_TARGET_USAGE_NONE,
                minLevel: D2D1_FEATURE_LEVEL_DEFAULT,
            };
            let hprops = D2D1_HWND_RENDER_TARGET_PROPERTIES {
                hwnd: self.hwnd,
                pixelSize: D2D_SIZE_U {
                    width: (rc.right - rc.left) as u32,
                    height: (rc.bottom - rc.top) as u32,
                },
                presentOptions: D2D1_PRESENT_OPTIONS_NONE,
            };
            self.rt = unsafe { self.gfx.d2d.CreateHwndRenderTarget(&props, &hprops) }.ok();
            self.dev = Device::default();
        }
        let Some(rt) = self.rt.clone() else { return };
        let hover_t = self.hover_t.clone();
        let hover_fn = move |id: WidgetId| hover_t.get(&id).copied().unwrap_or(0.0);
        let step_t: [f32; MAX_STEPS] = std::array::from_fn(|i| {
            if self.step_at[i].is_some() {
                self.progress_of(self.step_at[i], 520)
            } else {
                1.0
            }
        });
        let frame = Frame {
            scene: &self.scene,
            role: self.model.product.role,
            product: self.model.product.id,
            tile_png: self.tile.as_deref(),
            hover: &hover_fn,
            pressed: self.pressed.filter(|p| Some(*p) == self.hover),
            focus: self.focus,
            focus_visible: self.focus_visible,
            page_t: ease(self.progress_of(Some(self.page_at), 220)),
            step_t,
            mark_t: self.progress_of(self.mark_at, 600),
            dwm_border: self.win11,
            scale,
        };
        unsafe {
            rt.BeginDraw();
            let target: ID2D1RenderTarget =
                rt.cast().expect("an HWND render target is a render target");
            paint(&self.gfx, &target, &mut self.dev, &frame);
            if rt.EndDraw(None, None).is_err() {
                // D2DERR_RECREATE_TARGET (a display change): make it again on the next paint.
                self.rt = None;
                self.invalidate();
            }
        }
    }

    fn widget_at(&self, x: f32, y: f32) -> Option<WidgetId> {
        self.scene
            .widgets
            .iter()
            .find(|w| w.rect.contains(x, y))
            .map(|w| w.id)
    }

    fn dips(&self, lparam: LPARAM) -> (f32, f32) {
        let x = (lparam.0 & 0xffff) as i16 as f32;
        let y = ((lparam.0 >> 16) & 0xffff) as i16 as f32;
        (x / self.scale(), y / self.scale())
    }

    /// The window procedure, with the state held. Returns the result (None: DefWindowProc) and the
    /// effects to run once the state is released.
    fn handle(
        &mut self,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> (Option<LRESULT>, Vec<Effect>) {
        let mut fx = Vec::new();
        let result = match msg {
            WM_NCCALCSIZE if wparam.0 != 0 => Some(LRESULT(0)),
            WM_NCHITTEST => {
                let mut pt = POINT {
                    x: (lparam.0 & 0xffff) as i16 as i32,
                    y: ((lparam.0 >> 16) & 0xffff) as i16 as i32,
                };
                unsafe {
                    let _ = ScreenToClient(self.hwnd, &mut pt);
                }
                let (x, y) = (pt.x as f32 / self.scale(), pt.y as f32 / self.scale());
                let over_widget = self.widget_at(x, y).is_some();
                let caption = !over_widget && (y < TITLE_H || x < RAIL_W);
                Some(LRESULT(if caption {
                    HTCAPTION as isize
                } else {
                    HTCLIENT as isize
                }))
            }
            WM_ERASEBKGND => Some(LRESULT(1)),
            WM_PAINT => {
                let mut ps = PAINTSTRUCT::default();
                unsafe { BeginPaint(self.hwnd, &mut ps) };
                self.render();
                unsafe {
                    let _ = EndPaint(self.hwnd, &ps);
                }
                Some(LRESULT(0))
            }
            WM_SIZE => {
                if let Some(rt) = &self.rt {
                    let (w, h) = (
                        (lparam.0 & 0xffff) as u32,
                        ((lparam.0 >> 16) & 0xffff) as u32,
                    );
                    unsafe {
                        let _ = rt.Resize(&D2D_SIZE_U {
                            width: w,
                            height: h,
                        });
                    }
                }
                None
            }
            WM_DPICHANGED => {
                self.dpi = (wparam.0 & 0xffff) as u32;
                self.rt = None;
                let r = unsafe { *(lparam.0 as *const RECT) };
                fx.push(Effect::Move(r));
                self.invalidate();
                Some(LRESULT(0))
            }
            WM_GETMINMAXINFO => None,
            WM_SETTINGCHANGE => {
                self.reduced_motion = win::reduced_motion();
                None
            }
            WM_TIMER if wparam.0 == TIMER_FRAME => {
                let moving = self.tick();
                self.invalidate();
                if !moving {
                    unsafe {
                        let _ = KillTimer(Some(self.hwnd), TIMER_FRAME);
                    }
                    self.timer = false;
                }
                Some(LRESULT(0))
            }
            WM_MOUSEMOVE => {
                if !self.tracking {
                    let mut tme = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE,
                        hwndTrack: self.hwnd,
                        dwHoverTime: 0,
                    };
                    unsafe {
                        let _ = TrackMouseEvent(&mut tme);
                    }
                    self.tracking = true;
                }
                let (x, y) = self.dips(lparam);
                let over = self
                    .widget_at(x, y)
                    .filter(|id| self.scene.widget(*id).is_some_and(|w| w.enabled));
                if over != self.hover {
                    self.hover = over;
                    self.ensure_timer();
                    self.invalidate();
                }
                let kind = over.and_then(|id| self.scene.widget(id)).map(|w| w.kind);
                // A link points; a text field takes text (`RELEASE-0111-01` Part A).
                let cursor = match kind {
                    Some(WidgetKind::Link) => IDC_HAND,
                    Some(WidgetKind::TextField { .. }) => IDC_IBEAM,
                    _ => IDC_ARROW,
                };
                unsafe {
                    let _ = SetCursor(LoadCursorW(None, cursor).ok());
                }
                Some(LRESULT(0))
            }
            WM_MOUSELEAVE => {
                self.tracking = false;
                self.hover = None;
                self.ensure_timer();
                self.invalidate();
                Some(LRESULT(0))
            }
            WM_SETCURSOR => {
                // Over the client the cursor is ours (WM_MOUSEMOVE sets it).
                if (lparam.0 & 0xffff) as u32 == HTCLIENT {
                    Some(LRESULT(1))
                } else {
                    None
                }
            }
            WM_LBUTTONDOWN => {
                let (x, y) = self.dips(lparam);
                self.focus_visible = false;
                if let Some(id) = self
                    .widget_at(x, y)
                    .filter(|id| self.scene.widget(*id).is_some_and(|w| w.enabled))
                {
                    self.pressed = Some(id);
                    if self.scene.widget(id).is_some_and(|w| w.tabbable()) {
                        self.focus = Some(id);
                    }
                    unsafe { SetCapture(self.hwnd) };
                }
                self.invalidate();
                Some(LRESULT(0))
            }
            WM_LBUTTONUP => {
                let (x, y) = self.dips(lparam);
                let pressed = self.pressed.take();
                unsafe {
                    let _ = ReleaseCapture();
                }
                if let Some(id) = pressed {
                    if self.widget_at(x, y) == Some(id) {
                        self.activate(id, &mut fx);
                    }
                }
                self.invalidate();
                Some(LRESULT(0))
            }
            WM_KEYDOWN if self.field_key(wparam.0 as u16) => Some(LRESULT(0)),
            // `RELEASE-0111-01` Part A — a character typed into the focused field.
            WM_CHAR if self.focus.is_some_and(WidgetId::is_field) => {
                if let Some(id) = self.focus {
                    if let Some(ch) = char::from_u32(wparam.0 as u32).filter(|c| !c.is_control()) {
                        self.edit(id, |f| f.insert(&ch.to_string()));
                    }
                }
                Some(LRESULT(0))
            }
            WM_KEYDOWN => {
                let key = wparam.0 as u16;
                if key == VK_TAB.0 {
                    let back = unsafe { GetKeyState(VK_SHIFT.0 as i32) } < 0;
                    self.move_focus(back);
                    Some(LRESULT(0))
                } else if key == VK_RETURN.0 {
                    let target = self
                        .focus
                        .filter(|f| {
                            self.scene.widget(*f).is_some_and(|w| {
                                w.enabled
                                    && matches!(w.kind, WidgetKind::Button(_) | WidgetKind::Link)
                            })
                        })
                        .or(self.scene.primary);
                    if let Some(id) =
                        target.filter(|id| self.scene.widget(*id).is_some_and(|w| w.enabled))
                    {
                        self.activate(id, &mut fx);
                    }
                    Some(LRESULT(0))
                } else if key == VK_SPACE.0 {
                    // A space typed in a field is a character (WM_CHAR), never a press.
                    if let Some(id) = self.focus.filter(|f| {
                        !f.is_field() && self.scene.widget(*f).is_some_and(|w| w.enabled)
                    }) {
                        self.focus_visible = true;
                        self.activate(id, &mut fx);
                    }
                    Some(LRESULT(0))
                } else if key == VK_ESCAPE.0 {
                    if let Some(id) = self.scene.escape {
                        self.activate(id, &mut fx);
                    }
                    Some(LRESULT(0))
                } else {
                    None
                }
            }
            WM_SYSCOMMAND => {
                let cmd = (wparam.0 & 0xfff0) as u32;
                if cmd == SC_MAXIMIZE || cmd == SC_SIZE {
                    Some(LRESULT(0))
                } else if cmd == SC_CLOSE {
                    self.close_request(&mut fx);
                    Some(LRESULT(0))
                } else {
                    None
                }
            }
            WM_CLOSE => {
                self.close_request(&mut fx);
                Some(LRESULT(0))
            }
            WM_DESTROY => {
                uia::disconnect(self.hwnd);
                unsafe { PostQuitMessage(0) };
                Some(LRESULT(0))
            }
            WM_APP_UPDATE => {
                self.on_update();
                Some(LRESULT(0))
            }
            WM_APP_INVOKE => {
                if let Some(id) = widget_from_code(wparam.0) {
                    if self.scene.widget(id).is_some_and(|w| w.enabled) {
                        self.activate(id, &mut fx);
                    }
                }
                Some(LRESULT(0))
            }
            WM_APP_SETVALUE => {
                if let (Some(id), Some(text)) =
                    (widget_from_code(wparam.0), uia::take_value(wparam.0))
                {
                    if id.is_field() && self.scene.widget(id).is_some_and(|w| w.enabled) {
                        self.edit(id, |f| f.set(&text));
                    }
                }
                Some(LRESULT(0))
            }
            WM_APP_FOCUS => {
                if let Some(id) = widget_from_code(wparam.0) {
                    if self.scene.widget(id).is_some_and(|w| w.tabbable()) {
                        self.focus = Some(id);
                        self.focus_visible = true;
                        self.invalidate();
                    }
                }
                Some(LRESULT(0))
            }
            WM_ACTIVATE | WM_SETFOCUS | WM_KILLFOCUS => {
                self.invalidate();
                None
            }
            _ => None,
        };
        (result, fx)
    }

    /// `RELEASE-0111-01` Part A — a key that edits the focused field: the caret's moves, the two
    /// deletes, Ctrl+A and Ctrl+V (by the physical key, so a Persian layout pastes as well). Enter,
    /// Tab and Esc are not editing keys: they keep the page's own meaning.
    fn field_key(&mut self, key: u16) -> bool {
        let Some(id) = self.focus.filter(|f| f.is_field()) else {
            return false;
        };
        let ctrl = unsafe { GetKeyState(i32::from(VK_CONTROL.0)) } < 0;
        let edit: fn(&mut Field) = match key {
            k if k == VK_BACK.0 => Field::backspace,
            k if k == VK_DELETE.0 => Field::delete,
            k if k == VK_LEFT.0 => Field::left,
            k if k == VK_RIGHT.0 => Field::right,
            k if k == VK_HOME.0 => Field::home,
            k if k == VK_END.0 => Field::end,
            0x41 if ctrl => Field::select_all,
            0x56 if ctrl => {
                if let Some(text) = win::clipboard_text(self.hwnd) {
                    self.edit(id, |f| f.insert(&text));
                }
                return true;
            }
            _ => return false,
        };
        self.edit(id, edit);
        true
    }

    /// Change one of the page's fields, and let the page follow (the AMCP host follows the Playout's).
    fn edit(&mut self, id: WidgetId, change: impl FnOnce(&mut Field)) {
        let server = &mut self.model.server;
        let changed = {
            let field = match id {
                WidgetId::PlayoutField => &mut server.playout,
                WidgetId::AmcpField => &mut server.amcp,
                WidgetId::AddressOtherField => &mut server.other,
                _ => return,
            };
            let before = field.text().to_string();
            change(field);
            field.text() != before
        };
        if changed {
            match id {
                WidgetId::PlayoutField => server.playout_changed(),
                WidgetId::AmcpField => server.amcp_changed(),
                _ => server.address_changed(),
            }
        }
        self.rebuild();
    }

    /// The first field a refusal is said beside — where the keyboard goes after Install refused.
    fn first_refused(&self) -> Option<WidgetId> {
        let s = &self.model.server;
        if s.shown.playout.is_some() {
            Some(WidgetId::PlayoutField)
        } else if s.shown.amcp.is_some() {
            Some(WidgetId::AmcpField)
        } else if s.shown.address.is_some() {
            Some(match s.choice {
                AddressChoice::Other => WidgetId::AddressOtherField,
                _ if s.addresses.is_empty() => WidgetId::AddressOther,
                _ => WidgetId::Address(0),
            })
        } else {
            None
        }
    }

    fn move_focus(&mut self, back: bool) {
        let order: Vec<WidgetId> = self
            .scene
            .widgets
            .iter()
            .filter(|w| w.tabbable())
            .map(|w| w.id)
            .collect();
        if order.is_empty() {
            return;
        }
        let i = self.focus.and_then(|f| order.iter().position(|o| *o == f));
        let next = match (i, back) {
            (None, false) => 0,
            (None, true) => order.len() - 1,
            (Some(i), false) => (i + 1) % order.len(),
            (Some(i), true) => (i + order.len() - 1) % order.len(),
        };
        self.focus = Some(order[next]);
        self.focus_visible = true;
        uia::focus_changed(self.hwnd, order[next]);
        self.invalidate();
    }

    fn close_request(&mut self, fx: &mut Vec<Effect>) {
        match self.model.page {
            Page::Welcome | Page::Location | Page::Server => self.quit(1, fx),
            Page::Installing => {
                if !self.model.progress.engine_started && !self.model.cancelling {
                    self.cancel_install(fx);
                }
            }
            Page::Done => self.quit(0, fx),
            Page::Failed => self.quit(2, fx),
        }
    }

    fn quit(&mut self, code: u32, fx: &mut Vec<Effect>) {
        self.exit_code = code;
        self.cancel.store(true, Ordering::SeqCst);
        log_line(&self.log, &format!("closed, exit code {code}"));
        fx.push(Effect::Destroy);
    }

    fn cancel_install(&mut self, fx: &mut Vec<Effect>) {
        self.model.cancelling = true;
        self.cancel.store(true, Ordering::SeqCst);
        log_line(&self.log, "cancelled before the engine started");
        self.quit(1, fx);
    }

    fn activate(&mut self, id: WidgetId, fx: &mut Vec<Effect>) {
        log_line(
            &self.log,
            &format!("pressed {id:?} on {:?}", self.model.page),
        );
        match id {
            WidgetId::Next => match self.model.page {
                // CG Bridge's Location leads to its Playout page (`RELEASE-0111-01` Part A).
                Page::Location if self.model.has_server_page() => self.set_page(Page::Server),
                _ => self.set_page(Page::Location),
            },
            WidgetId::Back => match self.model.page {
                Page::Server => self.set_page(Page::Location),
                _ => self.set_page(Page::Welcome),
            },
            WidgetId::Cancel => match self.model.page {
                Page::Installing => self.cancel_install(fx),
                _ => self.quit(1, fx),
            },
            WidgetId::Change => fx.push(Effect::PickFolder),
            WidgetId::Install => {
                if self.model.can_install() && !self.installing {
                    // `RELEASE-0111-01` Part A — refused HERE, in words, beside each field: never
                    // later, by a service that cannot start.
                    if self.model.has_server_page() {
                        let refusals = self.model.server.judge();
                        if !refusals.none() {
                            log_line(&self.log, &format!("refused on the page: {refusals:?}"));
                            self.model.server.shown = refusals;
                            self.rebuild();
                            self.focus = self.first_refused();
                            self.focus_visible = true;
                            if let Some(f) = self.focus {
                                uia::focus_changed(self.hwnd, f);
                            }
                            return;
                        }
                    }
                    self.installing = true;
                    self.set_page(Page::Installing);
                    self.start_install();
                    // A failed unpack (reported while Welcome was up) shows now.
                    self.on_update();
                }
            }
            WidgetId::Separate => {
                self.model.server.toggle();
                self.rebuild();
                if self.model.server.separate {
                    self.focus = Some(WidgetId::PlayoutField);
                }
            }
            WidgetId::PlayoutField | WidgetId::AmcpField | WidgetId::AddressOtherField => {
                self.focus = Some(id);
            }
            WidgetId::Address(i) => {
                self.model.server.choice = AddressChoice::Listed(usize::from(i));
                self.model.server.address_changed();
                self.rebuild();
            }
            WidgetId::AddressOther => {
                self.model.server.choice = AddressChoice::Other;
                self.model.server.address_changed();
                self.rebuild();
                self.focus = Some(WidgetId::AddressOtherField);
            }
            WidgetId::Launch => {
                self.model.launch = !self.model.launch;
                self.rebuild();
            }
            WidgetId::Finish => {
                if self.model.launch {
                    if let Some(target) = self.launch_target() {
                        log_line(&self.log, &format!("launching {target}"));
                        fx.push(Effect::Open {
                            target,
                            as_user: true,
                        });
                    }
                }
                self.quit(0, fx);
            }
            WidgetId::OpenLog => {
                let log = self.log_target();
                fx.push(Effect::Open {
                    target: log,
                    as_user: false,
                });
            }
            WidgetId::Close => {
                let code = if self.model.page == Page::Failed {
                    2
                } else {
                    0
                };
                self.quit(code, fx);
            }
            WidgetId::Help => match help_target(&self.model) {
                Some(HelpTarget::BridgeStatus) => fx.push(Effect::Open {
                    target: self.status_url(),
                    as_user: true,
                }),
                Some(HelpTarget::Guide) => {
                    if let Some(path) = self.guide_file() {
                        fx.push(Effect::Open {
                            target: path,
                            as_user: true,
                        });
                    }
                }
                None => {}
            },
            WidgetId::Minimize => fx.push(Effect::Minimize),
            WidgetId::CloseWindow => self.close_request(fx),
        }
        self.invalidate();
    }

    fn status_url(&self) -> String {
        let config = Path::new(&win::program_data())
            .join(BRIDGE_DATA)
            .join("cg-bridge.json");
        let port = std::fs::read(&config)
            .ok()
            .and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
            .and_then(|v| v.get("controlPort").and_then(serde_json::Value::as_u64))
            .unwrap_or(5280);
        format!("http://127.0.0.1:{port}/health")
    }

    fn launch_target(&self) -> Option<String> {
        if self.model.product.id == ProductId::Bridge {
            return Some(self.status_url());
        }
        // The Start-menu shortcut first: it carries the app's AppUserModelID (B-290).
        let lnk = Path::new(&win::roaming_app_data())
            .join(r"Microsoft\Windows\Start Menu\Programs")
            .join(format!("{}.lnk", self.model.product.name));
        if lnk.exists() {
            return Some(lnk.to_string_lossy().to_string());
        }
        let exe = Path::new(&self.model.dir).join(self.model.product.main_exe);
        exe.exists().then(|| exe.to_string_lossy().to_string())
    }

    fn log_target(&self) -> String {
        if self.model.product.id == ProductId::Bridge {
            let install = Path::new(&win::program_data())
                .join(BRIDGE_DATA)
                .join(r"logs\install.log");
            if install.exists() {
                return install.to_string_lossy().to_string();
            }
        }
        self.log.to_string_lossy().to_string()
    }

    fn guide_file(&self) -> Option<String> {
        let bytes = self.payload.read("guide")?;
        let path = std::env::temp_dir().join(format!(
            "APASAI CG {} install guide.pdf",
            self.payload.config.version
        ));
        if !path.exists() {
            std::fs::write(&path, bytes).ok()?;
        }
        Some(path.to_string_lossy().to_string())
    }

    /// Unpack the engine at once, while the user reads Welcome: Install then starts without a wait.
    fn start_prepare(&mut self) {
        let Ok(dir) = engine::temp_dir() else {
            self.shared.lock().unwrap().prepare_error =
                Some("Setup could not create a temporary folder.".into());
            return;
        };
        self.temp = Some(dir.clone());
        let exe = self.payload.exe.clone();
        let index = self.payload.index.clone();
        let config = self.payload.config.clone();
        let shared = Arc::clone(&self.shared);
        let cancel = Arc::clone(&self.cancel);
        let hwnd = Hwnd(self.hwnd);
        let log = self.log.clone();
        std::thread::spawn(move || {
            let payload = Payload { exe, index, config };
            let target = dir.join(&payload.config.engine_name);
            let last = std::cell::Cell::new(0.0f32);
            let result = engine::extract(&payload, "engine", &target, &cancel, &|f| {
                if f - last.get() >= 0.02 || f >= 1.0 {
                    last.set(f);
                    shared.lock().unwrap().prepared = f;
                    hwnd.post_update();
                }
            });
            let mut s = shared.lock().unwrap();
            match result {
                Ok(()) => {
                    s.prepared = 1.0;
                    s.engine = Some(target);
                    log_line(&log, "engine unpacked and verified");
                }
                Err(e) => {
                    log_line(&log, &format!("engine not unpacked: {e}"));
                    s.prepare_error = Some(e);
                }
            }
            drop(s);
            hwnd.post_update();
        });
    }

    fn start_install(&mut self) {
        let m = &self.model;
        // `RELEASE-0111-01` Part A — the separate-server page gives the engine exactly the options a
        // command-line user types, in place of any of the three this command line carried. A page that
        // gives none leaves the command line as it was: today's install.
        let rest = match m.server.engine_options().filter(|_| m.has_server_page()) {
            Some(options) => format!(
                "{} {}",
                options.join(" "),
                cmdline::without_options(&self.parsed.rest, &OPTIONS)
            ),
            None => self.parsed.rest.clone(),
        };
        let args = cmdline::engine_args(&rest, m.engine_dir());
        log_line(&self.log, &format!("installing: engine {args}"));
        let job = Job {
            product: m.product.id,
            name: m.product.name,
            version: m.config.version.clone(),
            dir: PathBuf::from(&m.dir),
            main_files: m
                .config
                .main_files
                .iter()
                .map(|f| (f.path.clone(), f.bytes))
                .collect(),
            webview2_needed: m.product.uses_webview2 && m.facts.webview2_missing,
            uninstall_key: m.product.uninstall_key,
            args,
        };
        let shared = Arc::clone(&self.shared);
        let cancel = Arc::clone(&self.cancel);
        let hwnd = Hwnd(self.hwnd);
        let log = self.log.clone();
        std::thread::spawn(move || job.run(&shared, &cancel, hwnd, &log));
    }

    /// The workers posted: read what they wrote.
    fn on_update(&mut self) {
        let (prepared, error, progress, finished) = {
            let mut s = self.shared.lock().unwrap();
            (
                s.prepared,
                s.prepare_error.clone(),
                s.progress.clone(),
                s.finished.take(),
            )
        };
        if self.model.page == Page::Installing {
            if let Some(p) = progress {
                if p.fraction >= self.model.progress.fraction {
                    self.model.progress = p;
                }
            } else {
                self.model.progress = if self.model.product.id == ProductId::Bridge {
                    observe::bridge("", prepared, 0, 0, false)
                } else {
                    observe::app(AppSignals {
                        prepared,
                        ..AppSignals::default()
                    })
                };
            }
            if let Some(e) = error.filter(|_| !self.model.cancelling) {
                self.finish(Outcome {
                    ok: false,
                    reason: Some(e),
                    ..Outcome::default()
                });
                return;
            }
            if let Some(outcome) = finished {
                if outcome.ok {
                    self.model.progress.fraction = 1.0;
                    self.pending_outcome = Some(outcome);
                } else {
                    self.finish(outcome);
                    return;
                }
            }
            self.rebuild();
            self.ensure_timer();
        }
    }

    fn finish(&mut self, outcome: Outcome) {
        log_line(&self.log, &format!("finished: {outcome:?}"));
        let ok = outcome.ok;
        self.model.outcome = outcome;
        self.set_page(if ok { Page::Done } else { Page::Failed });
    }
}

/// One install, run on its own thread: wait for the engine to be unpacked, run it silently, read
/// its real steps, report how it ended.
struct Job {
    product: ProductId,
    name: &'static str,
    version: String,
    dir: PathBuf,
    main_files: Vec<(String, u64)>,
    webview2_needed: bool,
    uninstall_key: &'static str,
    args: String,
}

impl Job {
    fn run(self, shared: &Arc<Mutex<Shared>>, cancel: &Arc<AtomicBool>, hwnd: Hwnd, log: &Path) {
        let post = || hwnd.post_update();
        // 1 — the engine, unpacked by the time the user pressed Install (or soon after).
        let engine = loop {
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            let s = shared.lock().unwrap();
            if let Some(e) = &s.engine {
                break e.clone();
            }
            if s.prepare_error.is_some() {
                return;
            }
            drop(s);
            std::thread::sleep(Duration::from_millis(50));
        };
        // 2 — what is there before the engine starts.
        let bridge_log = Path::new(&win::program_data())
            .join(BRIDGE_DATA)
            .join(r"logs\install.log");
        let log_start = if self.product == ProductId::Bridge {
            win::file_len(&bridge_log)
        } else {
            0
        };
        let started = win::now();
        let line = format!("\"{}\" {}", engine.display(), self.args);
        let child: Child = match engine::spawn(&engine, &line, false) {
            Ok(c) => c,
            Err(e) => {
                log_line(log, &e);
                shared.lock().unwrap().finished = Some(Outcome {
                    ok: false,
                    reason: Some(e),
                    ..Outcome::default()
                });
                post();
                return;
            }
        };
        log_line(log, "engine started");
        let expected: u64 = self.main_files.iter().map(|(_, b)| *b).sum();
        let mut bridge_text = String::new();
        let mut offset = log_start;
        let mut last: Option<Progress> = None;
        let code = loop {
            let exited = child.poll(100);
            let copied: u64 = self
                .main_files
                .iter()
                .map(|(p, _)| win::bytes_written_since(&self.dir.join(p), started))
                .sum();
            let progress = if self.product == ProductId::Bridge {
                if let Some((more, end)) = win::read_from(&bridge_log, offset) {
                    bridge_text.push_str(&more);
                    offset = end;
                }
                observe::bridge(&bridge_text, 1.0, copied, expected, true)
            } else {
                let key =
                    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
                let webview2_present = win::reg_string(win::hklm(), key, "pv", win::View::Wow32)
                    .is_some()
                    || win::reg_string(win::hkcu(), key, "pv", win::View::Wow32).is_some();
                let registered = win::reg_string(
                    win::hkcu(),
                    self.uninstall_key,
                    "DisplayVersion",
                    win::View::Native64,
                )
                .as_deref()
                    == Some(self.version.as_str());
                observe::app(AppSignals {
                    prepared: 1.0,
                    engine_started: true,
                    webview2_needed: self.webview2_needed,
                    webview2_present,
                    main_copied: copied,
                    main_expected: expected,
                    registered: registered && copied >= expected,
                })
            };
            if last.as_ref().map(|l| l.words) != Some(progress.words) {
                log_line(
                    log,
                    &format!(
                        "step {} of {}: {}",
                        progress.step, progress.of, progress.words
                    ),
                );
            }
            last = Some(progress.clone());
            shared.lock().unwrap().progress = Some(progress);
            post();
            if let Some(code) = exited {
                break code;
            }
        };
        log_line(log, &format!("engine exited with code {code}"));
        let outcome = if code == 0 {
            if self.product == ProductId::Bridge {
                Outcome {
                    ok: true,
                    warning: observe::bridge_warning(&bridge_text),
                    service_running: win::service_running(BRIDGE_SERVICE),
                    exit_code: Some(0),
                    ..Outcome::default()
                }
            } else {
                Outcome {
                    ok: true,
                    exit_code: Some(0),
                    ..Outcome::default()
                }
            }
        } else {
            let reason = if self.product == ProductId::Bridge {
                observe::bridge_failure(&bridge_text)
                    .map(String::from)
                    .unwrap_or_else(|| format!("Setup stopped with code {code}."))
            } else {
                let at = last.unwrap_or_else(|| {
                    observe::app(AppSignals {
                        prepared: 1.0,
                        engine_started: true,
                        ..AppSignals::default()
                    })
                });
                observe::app_failure(&at, self.name)
            };
            Outcome {
                ok: false,
                reason: Some(reason),
                exit_code: Some(code),
                ..Outcome::default()
            }
        };
        shared.lock().unwrap().finished = Some(outcome);
        post();
    }
}
