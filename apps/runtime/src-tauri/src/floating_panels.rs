//! R-129 native host for the workspace's four persistent panel documents.
//!
//! The parent console renders each panel into the same WebView2 popup document throughout its
//! lifetime. Docking changes the Win32 window parent, so the webview, live iframes and media never
//! move between documents. Only the main console's capability can arrange or dispose these windows.

use serde::{Deserialize, Serialize};
#[cfg(windows)]
use tauri::Manager;
use tauri::WebviewWindow;

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Panel {
    Layers,
    Inspector,
    Pgm,
    Pvw,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DockRect {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Placement {
    left: i32,
    top: i32,
    width: u32,
    height: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    maximized: Option<bool>,
}

#[tauri::command]
pub async fn arrange_floating_panel(
    window: WebviewWindow,
    panel: Panel,
    title: String,
    dock: Option<DockRect>,
    placement: Option<Placement>,
    visible: bool,
) -> Result<(), String> {
    #[cfg(windows)]
    return native::on_main(window, move |main| {
        native::arrange(&main, panel, &title, dock, placement, visible)
    })
    .await;
    #[cfg(not(windows))]
    {
        let _ = (window, panel, title, dock, placement, visible);
        Err("Floating panels require Windows.".into())
    }
}

#[tauri::command]
pub async fn read_floating_panel_placement(
    window: WebviewWindow,
    panel: Panel,
) -> Result<Option<Placement>, String> {
    #[cfg(windows)]
    return native::on_main(window, move |main| native::placement(&main, panel)).await;
    #[cfg(not(windows))]
    {
        let _ = (window, panel);
        Ok(None)
    }
}

#[tauri::command]
pub async fn dispose_floating_panels(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    return native::on_main(window, |main| {
        native::dispose(main.app_handle());
        Ok(())
    })
    .await;
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

#[cfg(windows)]
pub use native::{handle_window_event, open};

#[cfg(windows)]
mod native {
    use super::{DockRect, Panel, Placement};
    use std::{io::Error, mem::size_of};
    use tauri::{
        webview::{NewWindowFeatures, NewWindowResponse},
        AppHandle, Manager, Monitor, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
        WindowEvent, Wry,
    };
    use windows_sys::Win32::{
        Foundation::{GetLastError, SetLastError, HWND, RECT},
        UI::WindowsAndMessaging::{
            GetParent, GetWindowLongPtrW, GetWindowPlacement, GetWindowRect, IsIconic, IsZoomed,
            SetParent, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE,
            HWND_TOP, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER, SW_HIDE,
            SW_RESTORE, SW_SHOWNA, WINDOWPLACEMENT, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
            WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_OVERLAPPEDWINDOW, WS_POPUP, WS_VISIBLE,
        },
    };

    const PANELS: [Panel; 4] = [Panel::Layers, Panel::Inspector, Panel::Pgm, Panel::Pvw];

    impl Panel {
        fn label(self) -> &'static str {
            match self {
                Self::Layers => "floating-layers",
                Self::Inspector => "floating-inspector",
                Self::Pgm => "floating-pgm",
                Self::Pvw => "floating-pvw",
            }
        }

        fn from_url(url: &Url) -> Option<Self> {
            if !matches!(url.scheme(), "http" | "https")
                || url.host_str() != Some("tauri.localhost")
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
                || url.path() != "/floating-panel.html"
                || url.fragment().is_some()
            {
                return None;
            }
            match url.query() {
                Some("panel=layers") => Some(Self::Layers),
                Some("panel=inspector") => Some(Self::Inspector),
                Some("panel=pgm") => Some(Self::Pgm),
                Some("panel=pvw") => Some(Self::Pvw),
                _ => None,
            }
        }
    }

    pub fn open(app: &AppHandle, url: Url, features: NewWindowFeatures) -> NewWindowResponse<Wry> {
        let Some(panel) = Panel::from_url(&url) else {
            return NewWindowResponse::Deny;
        };
        if app.get_webview_window(panel.label()).is_some() {
            return NewWindowResponse::Deny;
        }
        // Wry connects this WebView to the opener after the callback. Its inherited environment
        // and an un-navigated about:blank page are required by WebView2's NewWindowRequested.
        match WebviewWindowBuilder::new(
            app,
            panel.label(),
            WebviewUrl::External("about:blank".parse().expect("static popup URL")),
        )
        .window_features(features)
        .title("CG Control")
        .visible(false)
        .closable(false)
        .disable_drag_drop_handler()
        .on_navigation(move |next| {
            next.as_str() == "about:blank" || Panel::from_url(next) == Some(panel)
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()
        {
            Ok(window) => NewWindowResponse::Create { window },
            Err(error) => {
                crate::shell_log::log(&format!("Could not open {}: {error}", panel.label()));
                NewWindowResponse::Deny
            }
        }
    }

    pub fn handle_window_event(window: &Window, event: &WindowEvent) -> bool {
        let is_panel = PANELS.iter().any(|panel| panel.label() == window.label());
        if is_panel {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        } else if window.label() == "main" && matches!(event, WindowEvent::Destroyed) {
            // The runtime can still be dispatching Destroyed while its window table is
            // borrowed. Queue cleanup after that event before removing the other windows.
            let app = window.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let owner = app.clone();
                let _ = app.run_on_main_thread(move || dispose(&owner));
            });
        }
        is_panel
    }

    pub fn dispose(app: &AppHandle) {
        for panel in PANELS {
            if let Some(host) = app.get_webview_window(panel.label()) {
                if let Err(error) = host.destroy() {
                    crate::shell_log::log(&format!("Could not dispose {}: {error}", panel.label()));
                }
            }
        }
    }

    pub async fn on_main<T: Send + 'static>(
        main: WebviewWindow,
        task: impl FnOnce(WebviewWindow) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        if main.label() != "main" {
            return Err("Only the main console manages floating panels.".into());
        }
        let app = main.app_handle().clone();
        let (send, mut receive) = tauri::async_runtime::channel(1);
        app.run_on_main_thread(move || {
            let _ = send.try_send(task(main));
        })
        .map_err(|err| err.to_string())?;
        receive.recv().await.ok_or("The console window closed.")?
    }

    fn native_error(action: &str) -> String {
        format!("{action}: {}", Error::last_os_error())
    }

    fn set_long(hwnd: HWND, field: i32, value: isize) -> Result<(), String> {
        unsafe {
            SetLastError(0);
            if SetWindowLongPtrW(hwnd, field, value) == 0 && GetLastError() != 0 {
                return Err(native_error("Could not change the panel window style"));
            }
        }
        Ok(())
    }

    fn set_parent(hwnd: HWND, parent: HWND) -> Result<(), String> {
        unsafe {
            SetLastError(0);
            if SetParent(hwnd, parent).is_null() && GetLastError() != 0 {
                return Err(native_error("Could not move the panel window"));
            }
        }
        Ok(())
    }

    fn docked(hwnd: HWND, parent: HWND) -> bool {
        unsafe {
            GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_CHILD as isize != 0 && GetParent(hwnd) == parent
        }
    }

    fn host(hwnd: HWND, main: HWND, dock: bool) -> Result<(), String> {
        let (style, extra) = unsafe {
            (
                GetWindowLongPtrW(hwnd, GWL_STYLE),
                GetWindowLongPtrW(hwnd, GWL_EXSTYLE),
            )
        };
        let result = (|| {
            if dock {
                set_long(
                    hwnd,
                    GWL_STYLE,
                    (style & !((WS_OVERLAPPEDWINDOW | WS_POPUP) as isize))
                        | ((WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS) as isize),
                )?;
                set_long(
                    hwnd,
                    GWL_EXSTYLE,
                    (extra & !(WS_EX_APPWINDOW as isize)) | (WS_EX_TOOLWINDOW as isize),
                )?;
                set_parent(hwnd, main)
            } else {
                set_parent(hwnd, std::ptr::null_mut())?;
                set_long(
                    hwnd,
                    GWL_STYLE,
                    (style & !(WS_CHILD as isize)) | (WS_OVERLAPPEDWINDOW as isize),
                )?;
                set_long(
                    hwnd,
                    GWL_EXSTYLE,
                    (extra & !(WS_EX_TOOLWINDOW as isize)) | (WS_EX_APPWINDOW as isize),
                )
            }
        })();
        if result.is_err() {
            let _ = set_long(hwnd, GWL_STYLE, style);
            let _ = set_long(hwnd, GWL_EXSTYLE, extra);
            if !dock {
                let _ = set_parent(hwnd, main);
            }
        }
        result
    }

    fn position(hwnd: HWND, rect: DockRect, rehosted: bool) -> Result<(), String> {
        let (width, height) = match (i32::try_from(rect.width), i32::try_from(rect.height)) {
            (Ok(w), Ok(h)) if w > 0 && h > 0 => (w, h),
            _ => return Err("The panel rectangle needs a positive size.".into()),
        };
        let flags = SWP_NOACTIVATE
            | SWP_NOOWNERZORDER
            | if rehosted {
                SWP_FRAMECHANGED
            } else {
                SWP_NOZORDER
            };
        if unsafe { SetWindowPos(hwnd, HWND_TOP, rect.left, rect.top, width, height, flags) } == 0 {
            return Err(native_error("Could not resize the panel window"));
        }
        Ok(())
    }

    fn panel_visible(hwnd: HWND) -> bool {
        // Inspect the panel's visibility bit rather than its parent window's visibility.
        unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_VISIBLE as isize != 0 }
    }

    fn apply_visibility(hwnd: HWND, visible: bool, preserve_minimized: bool) {
        unsafe {
            let own_visible = panel_visible(hwnd);
            if !visible && own_visible {
                ShowWindow(hwnd, SW_HIDE);
            } else if visible && !own_visible && (!preserve_minimized || IsIconic(hwnd) == 0) {
                ShowWindow(hwnd, SW_SHOWNA);
            }
        }
    }

    pub fn arrange(
        main: &WebviewWindow,
        panel: Panel,
        title: &str,
        dock: Option<DockRect>,
        placement: Option<Placement>,
        visible: bool,
    ) -> Result<(), String> {
        if title.contains('\0') || title.len() > 512 {
            return Err("Invalid panel window title.".into());
        }
        let pane = main
            .get_webview_window(panel.label())
            .ok_or("The panel has not opened.")?;
        let hwnd = pane.hwnd().map_err(|err| err.to_string())?.0;
        let main_hwnd = main.hwnd().map_err(|err| err.to_string())?.0;
        let was_docked = docked(hwnd, main_hwnd);
        let was_visible = panel_visible(hwnd);
        pane.set_title(title).map_err(|error| error.to_string())?;
        // Hidden dock slots have no rectangle. In this case the request affects only this
        // surface's visibility, including when another docked pane enters fullscreen.
        if dock.is_none() && placement.is_none() {
            apply_visibility(hwnd, visible, !was_docked);
            return Ok(());
        }
        let wants_dock = dock.is_some();
        let rehosted = was_docked != wants_dock;
        let detached_target = if !wants_dock && (rehosted || placement.is_some()) {
            Some(detached_rect(main, placement.as_ref())?)
        } else {
            None
        };
        // Start hidden, then show only after the native rectangle and modality agree.
        if rehosted {
            unsafe {
                if IsZoomed(hwnd) != 0 || IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, SW_RESTORE);
                }
                ShowWindow(hwnd, SW_HIDE);
            }
            if let Err(error) = host(hwnd, main_hwnd, wants_dock) {
                apply_visibility(hwnd, was_visible, false);
                return Err(error);
            }
        }
        let result = (|| match (dock, detached_target) {
            (Some(rect), _) => position(hwnd, rect, rehosted),
            (None, Some(rect)) => {
                unsafe {
                    if IsZoomed(hwnd) != 0 || IsIconic(hwnd) != 0 {
                        ShowWindow(hwnd, SW_RESTORE);
                    }
                }
                position(hwnd, rect, rehosted)?;
                if placement.as_ref().and_then(|entry| entry.maximized) == Some(true) {
                    pane.maximize().map_err(|error| error.to_string())?;
                }
                Ok(())
            }
            _ => Ok(()),
        })();
        if let Err(error) = result {
            if rehosted {
                let _ = host(hwnd, main_hwnd, was_docked);
                apply_visibility(hwnd, was_visible, false);
            }
            return Err(error);
        }
        apply_visibility(hwnd, visible, !rehosted && !wants_dock);
        Ok(())
    }

    fn detached_rect(main: &WebviewWindow, saved: Option<&Placement>) -> Result<DockRect, String> {
        let monitors = main
            .available_monitors()
            .map_err(|error| error.to_string())?;
        let matching = saved.and_then(|entry| {
            entry.display_id.as_ref().and_then(|id| {
                monitors
                    .iter()
                    .find(|monitor| monitor.name() == Some(id))
                    .cloned()
            })
        });
        let display_found = matching.is_some();
        let monitor = matching
            .or_else(|| main.current_monitor().ok().flatten())
            .or_else(|| monitors.into_iter().next())
            .ok_or("No display work area is available.")?;
        let work = monitor.work_area();
        let width = saved
            .map_or(900, |entry| entry.width)
            .max(320)
            .min(work.size.width);
        let height = saved
            .map_or(600, |entry| entry.height)
            .max(240)
            .min(work.size.height);
        let left_space = work.size.width.saturating_sub(width);
        let top_space = work.size.height.saturating_sub(height);
        let min_left = work.position.x;
        let min_top = work.position.y;
        let max_left = min_left.saturating_add(left_space as i32);
        let max_top = min_top.saturating_add(top_space as i32);
        let use_saved_position = saved.filter(|entry| entry.display_id.is_none() || display_found);
        Ok(DockRect {
            left: use_saved_position.map_or(min_left + (left_space / 2) as i32, |entry| {
                entry.left.clamp(min_left, max_left)
            }),
            top: use_saved_position.map_or(min_top + (top_space / 2) as i32, |entry| {
                entry.top.clamp(min_top, max_top)
            }),
            width,
            height,
        })
    }

    pub fn placement(main: &WebviewWindow, panel: Panel) -> Result<Option<Placement>, String> {
        let pane = main
            .get_webview_window(panel.label())
            .ok_or("The panel has not opened.")?;
        let hwnd = pane.hwnd().map_err(|error| error.to_string())?.0;
        let main_hwnd = main.hwnd().map_err(|error| error.to_string())?.0;
        if docked(hwnd, main_hwnd) {
            return Ok(None);
        }
        let monitor = pane.current_monitor().map_err(|error| error.to_string())?;
        let maximized = pane.is_maximized().map_err(|error| error.to_string())?;
        let rect = restore_bounds(hwnd, monitor.as_ref())?;
        Ok(Some(Placement {
            left: rect.left,
            top: rect.top,
            width: u32::try_from(rect.right - rect.left).map_err(|error| error.to_string())?,
            height: u32::try_from(rect.bottom - rect.top).map_err(|error| error.to_string())?,
            maximized: Some(maximized),
            display_id: monitor.as_ref().and_then(|display| display.name().cloned()),
        }))
    }

    fn restore_bounds(hwnd: HWND, monitor: Option<&Monitor>) -> Result<RECT, String> {
        unsafe {
            if IsZoomed(hwnd) != 0 || IsIconic(hwnd) != 0 {
                let mut placement = WINDOWPLACEMENT {
                    length: size_of::<WINDOWPLACEMENT>() as u32,
                    ..Default::default()
                };
                if GetWindowPlacement(hwnd, &mut placement) == 0 {
                    return Err(native_error("Could not read the panel restore bounds"));
                }
                let mut rect = placement.rcNormalPosition;
                if let Some(display) = monitor {
                    // GetWindowPlacement uses workspace coordinates for normal top-level windows.
                    // The profile and SetWindowPos both use physical screen coordinates.
                    let work = display.work_area();
                    let screen = display.position();
                    let dx = work.position.x - screen.x;
                    let dy = work.position.y - screen.y;
                    rect.left += dx;
                    rect.right += dx;
                    rect.top += dy;
                    rect.bottom += dy;
                }
                Ok(rect)
            } else {
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect) == 0 {
                    return Err(native_error("Could not read the panel bounds"));
                }
                Ok(rect)
            }
        }
    }
}
