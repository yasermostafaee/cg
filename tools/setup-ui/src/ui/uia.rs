//! UI Automation: the window's page, as an accessibility tree.
//!
//! The window paints itself, so Windows sees no child controls; this provider gives it one element
//! per rail step, text, progress bar and control — named in the window's own words, with the
//! Invoke, Toggle and RangeValue patterns. A screen reader reads it; the clean-Windows smoke drives
//! the installers through it (Welcome → Location → Installing → Done) and reads every page back.
//!
//! Every call arrives on the window's thread (UseComThreading). An element names its page by a
//! generation; once the page has changed it answers `UIA_E_ELEMENTNOTAVAILABLE`. Invoke and Toggle
//! post to the window and return at once, as UI Automation expects.
#![allow(non_upper_case_globals)] // the `windows` crate's UIA constants, matched as patterns

use super::window::{widget_code, with_app, App, WM_APP_FOCUS, WM_APP_INVOKE};
use crate::layout::{Item, Rect, Role, WidgetId, WidgetKind};
use crate::model::StepState;
use crate::win::{var_bool, var_bstr, var_i4, Variant};
use std::cell::RefCell;
use windows::core::{implement, Error, IUnknown, Interface, Result, BOOL, HRESULT};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::{ClientToScreen, ScreenToClient};
use windows::Win32::System::Com::SAFEARRAY;
use windows::Win32::System::Ole::{SafeArrayCreateVector, SafeArrayPutElement};
use windows::Win32::System::Variant::VT_I4;
use windows::Win32::UI::Accessibility::*;
use windows::Win32::UI::WindowsAndMessaging::PostMessageW;
use windows_core::IUnknownImpl;

const ELEMENT_NOT_AVAILABLE: HRESULT = HRESULT(0x8004_0201_u32 as i32);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Key {
    Step(usize),
    Text(usize),
    Bar,
    Widget(WidgetId),
}

impl Key {
    fn code(self) -> i32 {
        match self {
            Key::Step(i) => 100 + i as i32,
            Key::Text(i) => 200 + i as i32,
            Key::Bar => 300,
            Key::Widget(id) => 400 + widget_code(id) as i32,
        }
    }
}

/// The page's elements, in reading order: the rail, the page's texts, the bar, the controls.
fn keys(app: &App) -> Vec<Key> {
    let mut out: Vec<Key> = (0..app.scene.rail.len()).map(Key::Step).collect();
    let mut n = 0;
    for item in &app.scene.items {
        match item {
            Item::Text { .. } => {
                out.push(Key::Text(n));
                n += 1;
            }
            Item::Bar { .. } => out.push(Key::Bar),
            _ => {}
        }
    }
    out.extend(app.scene.widgets.iter().map(|w| Key::Widget(w.id)));
    out
}

fn text_item(app: &App, n: usize) -> Option<(&str, Rect, Role)> {
    app.scene
        .items
        .iter()
        .filter_map(|i| match i {
            Item::Text {
                text, rect, role, ..
            } => Some((text.as_str(), *rect, *role)),
            _ => None,
        })
        .nth(n)
}

fn bar_rect(app: &App) -> Option<Rect> {
    app.scene.items.iter().find_map(|i| match i {
        Item::Bar { rect, .. } => Some(*rect),
        _ => None,
    })
}

fn automation_id(id: WidgetId) -> &'static str {
    match id {
        WidgetId::Next => "next",
        WidgetId::Back => "back",
        WidgetId::Cancel => "cancel",
        WidgetId::Install => "install",
        WidgetId::Change => "change",
        WidgetId::Launch => "launch",
        WidgetId::Finish => "finish",
        WidgetId::OpenLog => "open-log",
        WidgetId::Close => "close",
        WidgetId::Help => "help",
        WidgetId::Minimize => "minimize",
        WidgetId::CloseWindow => "close-window",
    }
}

fn step_state(s: StepState) -> &'static str {
    match s {
        StepState::Pending => "pending",
        StepState::Current => "current",
        StepState::Done => "done",
        StepState::Failed => "failed",
    }
}

/// A DIP rectangle on the window, in screen pixels.
fn screen_rect(hwnd: HWND, r: Rect) -> UiaRect {
    let s = super::dpi::for_window(hwnd).max(96) as f64 / 96.0;
    let mut pt = POINT {
        x: (f64::from(r.x) * s).round() as i32,
        y: (f64::from(r.y) * s).round() as i32,
    };
    unsafe {
        let _ = ClientToScreen(hwnd, &mut pt);
    }
    UiaRect {
        left: f64::from(pt.x),
        top: f64::from(pt.y),
        width: f64::from(r.w) * s,
        height: f64::from(r.h) * s,
    }
}

fn runtime_id(parts: &[i32]) -> *mut SAFEARRAY {
    unsafe {
        let psa = SafeArrayCreateVector(VT_I4, 0, parts.len() as u32);
        for (i, v) in parts.iter().enumerate() {
            let idx = i as i32;
            let _ = SafeArrayPutElement(psa, &idx, (v as *const i32).cast());
        }
        psa
    }
}

thread_local! {
    static ROOT: RefCell<Option<IRawElementProviderSimple>> = const { RefCell::new(None) };
    static PENDING: RefCell<Vec<Pending>> = const { RefCell::new(Vec::new()) };
}

enum Pending {
    Structure,
    Focus(WidgetId),
}

fn root(hwnd: HWND) -> IRawElementProviderSimple {
    ROOT.with(|r| {
        r.borrow_mut()
            .get_or_insert_with(|| Root { hwnd }.into())
            .clone()
    })
}

/// `WM_GETOBJECT`: the tree's root, for UI Automation's own id.
pub fn on_get_object(hwnd: HWND, wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    if lparam.0 as i32 != UiaRootObjectId {
        return None;
    }
    let root = root(hwnd);
    Some(unsafe { UiaReturnRawElementProvider(hwnd, wparam, lparam, &root) })
}

/// The window is going: tell UI Automation, and let go of the root.
pub fn disconnect(hwnd: HWND) {
    unsafe {
        let _ = UiaReturnRawElementProvider(hwnd, WPARAM(0), LPARAM(0), None);
    }
    if let Some(root) = ROOT.with(|r| r.borrow_mut().take()) {
        unsafe {
            let _ = UiaDisconnectProvider(&root);
        }
    }
}

/// The page changed (queued: raised once the window's state is released).
pub fn structure_changed(_hwnd: HWND) {
    PENDING.with(|p| p.borrow_mut().push(Pending::Structure));
}
pub fn focus_changed(_hwnd: HWND, id: WidgetId) {
    PENDING.with(|p| p.borrow_mut().push(Pending::Focus(id)));
}

/// Raise what was queued.
pub fn flush(hwnd: HWND) {
    let pending: Vec<Pending> = PENDING.with(|p| p.borrow_mut().drain(..).collect());
    if pending.is_empty() || !unsafe { UiaClientsAreListening() }.as_bool() {
        return;
    }
    let root = root(hwnd);
    for e in pending {
        unsafe {
            match e {
                Pending::Structure => {
                    let _ = UiaRaiseStructureChangedEvent(
                        &root,
                        StructureChangeType_ChildrenInvalidated,
                        std::ptr::null_mut(),
                        0,
                    );
                }
                Pending::Focus(id) => {
                    if let Some(generation) = with_app(|a| a.generation) {
                        let el: IRawElementProviderSimple = Element {
                            hwnd,
                            generation,
                            key: Key::Widget(id),
                        }
                        .into();
                        let _ = UiaRaiseAutomationEvent(&el, UIA_AutomationFocusChangedEventId);
                    }
                }
            }
        }
    }
}

#[implement(
    IRawElementProviderSimple,
    IRawElementProviderFragment,
    IRawElementProviderFragmentRoot
)]
struct Root {
    hwnd: HWND,
}

fn element(hwnd: HWND, key: Key) -> Result<IRawElementProviderFragment> {
    let generation =
        with_app(|a| a.generation).ok_or_else(|| Error::from_hresult(ELEMENT_NOT_AVAILABLE))?;
    let el: IRawElementProviderFragment = Element {
        hwnd,
        generation,
        key,
    }
    .into();
    Ok(el)
}

impl IRawElementProviderSimple_Impl for Root_Impl {
    fn ProviderOptions(&self) -> Result<ProviderOptions> {
        Ok(ProviderOptions_ServerSideProvider | ProviderOptions_UseComThreading)
    }
    fn GetPatternProvider(&self, _id: UIA_PATTERN_ID) -> Result<IUnknown> {
        Err(Error::empty())
    }
    fn GetPropertyValue(&self, id: UIA_PROPERTY_ID) -> Result<Variant> {
        Ok(match id {
            UIA_AutomationIdPropertyId => var_bstr("cg-setup"),
            _ => Variant::default(),
        })
    }
    fn HostRawElementProvider(&self) -> Result<IRawElementProviderSimple> {
        unsafe { UiaHostProviderFromHwnd(self.hwnd) }
    }
}

impl IRawElementProviderFragment_Impl for Root_Impl {
    fn Navigate(&self, direction: NavigateDirection) -> Result<IRawElementProviderFragment> {
        let ks = with_app(keys).unwrap_or_default();
        let key = match direction {
            NavigateDirection_FirstChild => ks.first().copied(),
            NavigateDirection_LastChild => ks.last().copied(),
            _ => None,
        };
        match key {
            Some(k) => element(self.hwnd, k),
            None => Err(Error::empty()),
        }
    }
    fn GetRuntimeId(&self) -> Result<*mut SAFEARRAY> {
        Ok(std::ptr::null_mut())
    }
    fn BoundingRectangle(&self) -> Result<UiaRect> {
        Ok(UiaRect::default())
    }
    fn GetEmbeddedFragmentRoots(&self) -> Result<*mut SAFEARRAY> {
        Ok(std::ptr::null_mut())
    }
    fn SetFocus(&self) -> Result<()> {
        Ok(())
    }
    fn FragmentRoot(&self) -> Result<IRawElementProviderFragmentRoot> {
        Ok(self.to_object().to_interface())
    }
}

impl IRawElementProviderFragmentRoot_Impl for Root_Impl {
    fn ElementProviderFromPoint(&self, x: f64, y: f64) -> Result<IRawElementProviderFragment> {
        let s = super::dpi::for_window(self.hwnd).max(96) as f32 / 96.0;
        let mut pt = POINT {
            x: x as i32,
            y: y as i32,
        };
        unsafe {
            let _ = ScreenToClient(self.hwnd, &mut pt);
        }
        let (dx, dy) = (pt.x as f32 / s, pt.y as f32 / s);
        let hit = with_app(|a| {
            if let Some(w) = a.scene.widgets.iter().find(|w| w.rect.contains(dx, dy)) {
                return Some(Key::Widget(w.id));
            }
            let mut n = 0;
            for item in &a.scene.items {
                if let Item::Text { rect, .. } = item {
                    if rect.contains(dx, dy) {
                        return Some(Key::Text(n));
                    }
                    n += 1;
                }
            }
            None
        })
        .flatten();
        match hit {
            Some(k) => element(self.hwnd, k),
            None => Err(Error::empty()),
        }
    }
    fn GetFocus(&self) -> Result<IRawElementProviderFragment> {
        match with_app(|a| a.focus).flatten() {
            Some(id) => element(self.hwnd, Key::Widget(id)),
            None => Err(Error::empty()),
        }
    }
}

#[implement(
    IRawElementProviderSimple,
    IRawElementProviderFragment,
    IInvokeProvider,
    IToggleProvider,
    IRangeValueProvider
)]
struct Element {
    hwnd: HWND,
    generation: u32,
    key: Key,
}

impl Element {
    /// Run `f` against the window's state, if this element still belongs to its page.
    fn live<R>(&self, f: impl FnOnce(&App) -> Option<R>) -> Result<R> {
        with_app(|a| {
            if a.generation == self.generation && keys(a).contains(&self.key) {
                f(a)
            } else {
                None
            }
        })
        .flatten()
        .ok_or_else(|| Error::from_hresult(ELEMENT_NOT_AVAILABLE))
    }
    fn kind(&self) -> Option<WidgetKind> {
        match self.key {
            Key::Widget(id) => with_app(|a| a.scene.widget(id).map(|w| w.kind)).flatten(),
            _ => None,
        }
    }
    fn post(&self, msg: u32, id: WidgetId) -> Result<()> {
        self.live(|a| a.scene.widget(id).filter(|w| w.enabled).map(|_| ()))?;
        unsafe { PostMessageW(Some(self.hwnd), msg, WPARAM(widget_code(id)), LPARAM(0)) }
    }
}

impl IRawElementProviderSimple_Impl for Element_Impl {
    fn ProviderOptions(&self) -> Result<ProviderOptions> {
        Ok(ProviderOptions_ServerSideProvider | ProviderOptions_UseComThreading)
    }
    fn GetPatternProvider(&self, id: UIA_PATTERN_ID) -> Result<IUnknown> {
        let supported = match (self.key, self.kind()) {
            (Key::Widget(_), Some(WidgetKind::Checkbox(_))) => id == UIA_TogglePatternId,
            (Key::Widget(_), Some(_)) => id == UIA_InvokePatternId,
            (Key::Bar, _) => id == UIA_RangeValuePatternId,
            _ => false,
        };
        if supported {
            Ok(self.to_object().to_interface())
        } else {
            Err(Error::empty())
        }
    }
    fn GetPropertyValue(&self, id: UIA_PROPERTY_ID) -> Result<Variant> {
        let key = self.key;
        self.live(|a| {
            let (name, control, aid, enabled, focusable, status): (
                String,
                UIA_CONTROLTYPE_ID,
                String,
                bool,
                bool,
                Option<&str>,
            ) = match key {
                Key::Step(i) => {
                    let s = a.scene.rail.get(i)?;
                    (
                        s.label.to_string(),
                        UIA_TextControlTypeId,
                        format!("step-{}", i + 1),
                        true,
                        false,
                        Some(step_state(s.state)),
                    )
                }
                Key::Text(n) => {
                    let (text, _, role) = text_item(a, n)?;
                    let aid = if role == Role::Heading {
                        "title".to_string()
                    } else {
                        format!("text-{n}")
                    };
                    (
                        text.to_string(),
                        UIA_TextControlTypeId,
                        aid,
                        true,
                        false,
                        None,
                    )
                }
                Key::Bar => (
                    "Progress".to_string(),
                    UIA_ProgressBarControlTypeId,
                    "progress".to_string(),
                    true,
                    false,
                    Some(a.model.progress.words),
                ),
                Key::Widget(wid) => {
                    let w = a.scene.widget(wid)?;
                    let control = match w.kind {
                        WidgetKind::Checkbox(_) => UIA_CheckBoxControlTypeId,
                        WidgetKind::Link => UIA_HyperlinkControlTypeId,
                        _ => UIA_ButtonControlTypeId,
                    };
                    (
                        w.label.clone(),
                        control,
                        automation_id(wid).to_string(),
                        w.enabled,
                        w.tabbable(),
                        None,
                    )
                }
            };
            Some(match id {
                UIA_NamePropertyId => var_bstr(&name),
                UIA_ControlTypePropertyId => var_i4(control.0),
                UIA_AutomationIdPropertyId => var_bstr(&aid),
                UIA_IsEnabledPropertyId => var_bool(enabled),
                UIA_IsKeyboardFocusablePropertyId => var_bool(focusable),
                UIA_HasKeyboardFocusPropertyId => {
                    var_bool(matches!(key, Key::Widget(w) if a.focus == Some(w)))
                }
                UIA_IsControlElementPropertyId | UIA_IsContentElementPropertyId => var_bool(true),
                UIA_ItemStatusPropertyId => status.map(var_bstr).unwrap_or_default(),
                UIA_FrameworkIdPropertyId => var_bstr("CGSetup"),
                _ => Variant::default(),
            })
        })
    }
    fn HostRawElementProvider(&self) -> Result<IRawElementProviderSimple> {
        Err(Error::empty())
    }
}

impl IRawElementProviderFragment_Impl for Element_Impl {
    fn Navigate(&self, direction: NavigateDirection) -> Result<IRawElementProviderFragment> {
        if direction == NavigateDirection_Parent {
            return root(self.hwnd).cast();
        }
        let ks = with_app(keys).unwrap_or_default();
        let at = ks.iter().position(|k| *k == self.key);
        let next = match (direction, at) {
            (NavigateDirection_NextSibling, Some(i)) => ks.get(i + 1).copied(),
            (NavigateDirection_PreviousSibling, Some(i)) if i > 0 => ks.get(i - 1).copied(),
            _ => None,
        };
        match next {
            Some(k) => element(self.hwnd, k),
            None => Err(Error::empty()),
        }
    }
    fn GetRuntimeId(&self) -> Result<*mut SAFEARRAY> {
        Ok(runtime_id(&[
            UiaAppendRuntimeId as i32,
            self.generation as i32,
            self.key.code(),
        ]))
    }
    fn BoundingRectangle(&self) -> Result<UiaRect> {
        let key = self.key;
        let hwnd = self.hwnd;
        self.live(|a| {
            let r = match key {
                Key::Step(i) => a
                    .scene
                    .rail
                    .get(i)
                    .map(|s| Rect::new(s.cx - 11.0, s.cy - 11.0, 150.0, 22.0)),
                Key::Text(n) => text_item(a, n).map(|t| t.1),
                Key::Bar => bar_rect(a),
                Key::Widget(id) => a.scene.widget(id).map(|w| w.rect),
            }?;
            Some(screen_rect(hwnd, r))
        })
    }
    fn GetEmbeddedFragmentRoots(&self) -> Result<*mut SAFEARRAY> {
        Ok(std::ptr::null_mut())
    }
    fn SetFocus(&self) -> Result<()> {
        match self.key {
            Key::Widget(id) => self.post(WM_APP_FOCUS, id),
            _ => Ok(()),
        }
    }
    fn FragmentRoot(&self) -> Result<IRawElementProviderFragmentRoot> {
        root(self.hwnd).cast()
    }
}

impl IInvokeProvider_Impl for Element_Impl {
    fn Invoke(&self) -> Result<()> {
        match self.key {
            Key::Widget(id) => self.post(WM_APP_INVOKE, id),
            _ => Err(Error::from_hresult(windows::Win32::Foundation::E_NOTIMPL)),
        }
    }
}

impl IToggleProvider_Impl for Element_Impl {
    fn Toggle(&self) -> Result<()> {
        match self.key {
            Key::Widget(id) => self.post(WM_APP_INVOKE, id),
            _ => Err(Error::from_hresult(windows::Win32::Foundation::E_NOTIMPL)),
        }
    }
    fn ToggleState(&self) -> Result<ToggleState> {
        match self.kind() {
            Some(WidgetKind::Checkbox(true)) => Ok(ToggleState_On),
            _ => Ok(ToggleState_Off),
        }
    }
}

impl IRangeValueProvider_Impl for Element_Impl {
    fn SetValue(&self, _val: f64) -> Result<()> {
        Err(Error::from_hresult(
            windows::Win32::Foundation::E_ACCESSDENIED,
        ))
    }
    fn Value(&self) -> Result<f64> {
        self.live(|a| Some((f64::from(a.model.shown) * 100.0).floor()))
    }
    fn IsReadOnly(&self) -> Result<BOOL> {
        Ok(BOOL(1))
    }
    fn Maximum(&self) -> Result<f64> {
        Ok(100.0)
    }
    fn Minimum(&self) -> Result<f64> {
        Ok(0.0)
    }
    fn LargeChange(&self) -> Result<f64> {
        Ok(0.0)
    }
    fn SmallChange(&self) -> Result<f64> {
        Ok(0.0)
    }
}
