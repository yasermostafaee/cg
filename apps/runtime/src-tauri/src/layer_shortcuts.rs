//! Keyboard routing for the installed CG Control window.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

#[derive(Default)]
pub struct LayerAltF4(Arc<AtomicBool>);

impl LayerAltF4 {
    pub fn set(&self, armed: bool) {
        self.0.store(armed, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn set_layer_alt_f4(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LayerAltF4>,
    armed: bool,
) {
    if window.label() == "main" {
        state.set(armed);
    }
}

#[cfg(windows)]
pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use std::cell::Cell;
    use tauri::Manager;
    use webview2_com::{
        AcceleratorKeyPressedEventHandler, ExecuteScriptCompletedHandler,
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2AcceleratorKeyPressedEventArgs2, ICoreWebView2Controller,
            COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN,
            COREWEBVIEW2_PHYSICAL_KEY_STATUS,
        },
    };
    use windows_core::{Interface, HSTRING};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyState, VK_CONTROL, VK_F1, VK_F10, VK_F12, VK_F4, VK_LWIN, VK_RWIN, VK_SHIFT,
    };

    fn dispatch_keydown(
        controller: ICoreWebView2Controller,
        script: &str,
    ) -> windows_core::Result<()> {
        // ExecuteScript queues the event without waiting on the synchronous
        // windowed accelerator callback.
        let completed = ExecuteScriptCompletedHandler::create(Box::new(|_, _| Ok(())));
        let core = unsafe { controller.CoreWebView2()? };
        unsafe { core.ExecuteScript(&HSTRING::from(script), &completed) }
    }

    const ALT_F4_KEYDOWN: &str =
        "(document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', \
         { key: 'F4', code: 'F4', altKey: true, bubbles: true, cancelable: true }));";

    let armed = window.state::<LayerAltF4>().0.clone();
    window.with_webview(move |webview| {
        let handled_alt_f4 = Cell::new(false);
        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |sender, args| {
            let Some(args) = args else { return Ok(()) };
            let mut key = 0;
            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
            // WebView2 invokes the handler on its UI thread. These getters access the
            // event arguments in that same callback.
            unsafe {
                args.VirtualKey(&mut key)?;
                args.KeyEventKind(&mut kind)?;
            }
            if !(u32::from(VK_F1)..=u32::from(VK_F12)).contains(&key) {
                return Ok(());
            }

            let down = matches!(
                kind,
                COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN | COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
            );
            if key == u32::from(VK_F10) {
                // Windows uses F10 for menus before the web page can use it.
                // Preserve the chord for the renderer and leave key-up alone.
                if down {
                    let mut physical = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                    unsafe { args.PhysicalKeyStatus(&mut physical)? };
                    let alt = physical.IsMenuKeyDown.as_bool();
                    let ctrl = unsafe { GetKeyState(i32::from(VK_CONTROL)) < 0 };
                    let shift = unsafe { GetKeyState(i32::from(VK_SHIFT)) < 0 };
                    let meta = [VK_LWIN, VK_RWIN].into_iter().any(|key| unsafe {
                        GetKeyState(i32::from(key)) < 0
                    });
                    unsafe { args.SetHandled(true)? };
                    if let Some(controller) = sender.filter(|_| !physical.WasKeyDown.as_bool()) {
                        dispatch_keydown(controller, &format!(
                            "(document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', \
                             {{ key: 'F10', code: 'F10', altKey: {alt}, ctrlKey: {ctrl}, \
                                shiftKey: {shift}, metaKey: {meta}, bubbles: true, cancelable: true }}));"
                        ))?;
                    }
                }
                return Ok(());
            }
            if key == u32::from(VK_F4) {
                let mut physical = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                unsafe { args.PhysicalKeyStatus(&mut physical)? };
                if !down {
                    // Let WebView2 complete the physical key sequence.
                    handled_alt_f4.set(false);
                    return Ok(());
                }

                // Keep consuming repeats of an intercepted press even if the renderer
                // disarms before key-up. Otherwise holding Next could close the window.
                if physical.WasKeyDown.as_bool() {
                    if handled_alt_f4.get() && physical.IsMenuKeyDown.as_bool() {
                        unsafe { args.SetHandled(true)? };
                        return Ok(());
                    }
                } else {
                    handled_alt_f4.set(false);
                    let extra_modifier = [VK_CONTROL, VK_SHIFT, VK_LWIN, VK_RWIN]
                        .into_iter()
                        .any(|key| unsafe { GetKeyState(i32::from(key)) < 0 });
                    if armed.load(Ordering::Relaxed)
                        && physical.IsMenuKeyDown.as_bool()
                        && !extra_modifier
                    {
                        unsafe { args.SetHandled(true)? };
                        handled_alt_f4.set(true);
                        if let Some(controller) = sender {
                            dispatch_keydown(controller, ALT_F4_KEYDOWN)?;
                        }
                        return Ok(());
                    }
                }
            }

            // Keep these keys available to DOM handlers without browser actions
            // like F5 reload. Other browser accelerators are unchanged.
            if down {
                if let Ok(accelerator) = args.cast::<ICoreWebView2AcceleratorKeyPressedEventArgs2>()
                {
                    unsafe { accelerator.SetIsBrowserAcceleratorKeyEnabled(false)? };
                }
            }
            Ok(())
        }));

        // The controller owns the callback until the main WebView closes.
        let mut token = 0;
        if let Err(error) = unsafe {
            webview
                .controller()
                .add_AcceleratorKeyPressed(&handler, &mut token)
        } {
            crate::shell_log::log(&format!("could not register layer shortcut keys: {error}"));
        }
    })
}
