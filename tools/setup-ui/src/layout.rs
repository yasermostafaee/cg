//! The model, laid out: every text, mark and control of the page, positioned in DIPs on the
//! 800 × 520 window. The painter draws this; UI Automation reads it; the tests assert on it — one
//! description of the screen, three readers.
//!
//! The geometry is the mockup's (`Claude outputs/INSTALLER-DESIGN-01-screens/mockup/`), where it was
//! drawn first with the real tokens, faces and icons.

use crate::icons::Icon;
use crate::model::{format_bytes, Model, Page, StepState};
use crate::palette::{self, Rgb};
use crate::product::{ProductId, PUBLISHER, WEBVIEW2_LINE};
use crate::server::{
    AddressChoice, ADDRESS_LABEL, AMCP_LABEL, OTHER_LABEL, PLAYOUT_LABEL, PLAYOUT_PLACEHOLDER,
    SEPARATE_LABEL,
};

pub const WIN_W: f32 = 800.0;
pub const WIN_H: f32 = 520.0;
pub const RAIL_W: f32 = 232.0;
pub const TITLE_H: f32 = 40.0;
pub const FOOT_Y: f32 = 456.0;
pub const X0: f32 = 272.0;
pub const X1: f32 = 760.0;
const CONTENT_W: f32 = X1 - X0;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Rect {
        Rect { x, y, w, h }
    }
    pub fn contains(&self, x: f32, y: f32) -> bool {
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
    pub fn right(&self) -> f32 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f32 {
        self.y + self.h
    }
}

/// The text treatments, each the console's (or the splash's) own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Style {
    /// 26 px Segoe UI Semibold — the page's one question or fact.
    Title,
    /// 13 px — every line of the page.
    Body,
    /// 11 px semibold, upper case, tracked — the console's section label.
    Label,
    /// 15 px — the step running now.
    Words,
    /// The splash readout: Consolas 10.5 px, upper case, tracked 0.13 em.
    Readout,
    /// 13 px semibold — a button (`.cg-btn`).
    Button,
    /// 13 px bold — the primary button (`.cg-btn--primary`).
    ButtonBold,
    /// 13 px — a rail step; its current one is semibold.
    Rail,
    RailCurrent,
}

impl Style {
    pub fn size(self) -> f32 {
        match self {
            Style::Title => 26.0,
            Style::Label => 11.0,
            Style::Words => 15.0,
            Style::Readout => 10.5,
            _ => 13.0,
        }
    }
}

/// How UI Automation names a text.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// The page's heading.
    Heading,
    Text,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Item {
    Text {
        rect: Rect,
        text: String,
        style: Style,
        color: Rgb,
        role: Role,
        /// Right-aligned in its rect.
        right: bool,
        /// Wraps within its rect's width (else one line, ellipsis at the end).
        wrap: bool,
    },
    Icon {
        rect: Rect,
        icon: Icon,
        color: Rgb,
    },
    /// The product's tile, with the splash monitor's safe-area ticks around it.
    Tile {
        rect: Rect,
    },
    /// The update line's box.
    Callout {
        rect: Rect,
    },
    /// The folder's box.
    Field {
        rect: Rect,
    },
    /// The progress bar (the shown value).
    Bar {
        rect: Rect,
        fraction: f32,
    },
    /// The Done/Failed mark.
    Mark {
        rect: Rect,
        ok: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WidgetId {
    Next,
    Back,
    Cancel,
    Install,
    Change,
    Launch,
    Finish,
    OpenLog,
    Close,
    Help,
    Minimize,
    CloseWindow,
    // `RELEASE-0111-01` Part A — CG Bridge's separate-server page.
    Separate,
    PlayoutField,
    AmcpField,
    /// One of this server's IPv4 addresses, by its place in the list.
    Address(u8),
    AddressOther,
    AddressOtherField,
}

impl WidgetId {
    /// The page's text fields.
    pub fn is_field(self) -> bool {
        matches!(
            self,
            WidgetId::PlayoutField | WidgetId::AmcpField | WidgetId::AddressOtherField
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Variant {
    Primary,
    Ghost,
    Secondary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WidgetKind {
    Button(Variant),
    Checkbox(bool),
    Link,
    /// Minimise and close, in the window's own title bar (not in the Tab order).
    TitleButton,
    /// `RELEASE-0111-01` Part A — one line of text: its caret (in characters), the whole value
    /// selected, and a refusal said beside it.
    TextField {
        caret: usize,
        all: bool,
        refused: bool,
    },
    /// One choice of a group (this server's addresses): chosen or not.
    Radio(bool),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Widget {
    pub id: WidgetId,
    pub kind: WidgetKind,
    pub rect: Rect,
    /// What UI Automation names it; a text field's label.
    pub label: String,
    pub enabled: bool,
    /// A text field's text.
    pub value: String,
    /// A text field's placeholder, shown while it is empty.
    pub placeholder: String,
}

impl Widget {
    pub fn new(id: WidgetId, kind: WidgetKind, rect: Rect, label: &str, enabled: bool) -> Widget {
        Widget {
            id,
            kind,
            rect,
            label: label.to_string(),
            enabled,
            value: String::new(),
            placeholder: String::new(),
        }
    }

    pub fn tabbable(&self) -> bool {
        self.enabled && !matches!(self.kind, WidgetKind::TitleButton)
    }
}

/// A rail step, as drawn and as read.
#[derive(Debug, Clone, PartialEq)]
pub struct RailStep {
    pub label: &'static str,
    pub state: StepState,
    /// The circle's centre.
    pub cx: f32,
    pub cy: f32,
}

pub struct Scene {
    pub items: Vec<Item>,
    /// In Tab order.
    pub widgets: Vec<Widget>,
    /// Enter presses this.
    pub primary: Option<WidgetId>,
    /// Esc presses this.
    pub escape: Option<WidgetId>,
    pub rail: Vec<RailStep>,
    /// The window's title (taskbar, Alt+Tab, UI Automation).
    pub window_title: String,
}

impl Scene {
    pub fn widget(&self, id: WidgetId) -> Option<&Widget> {
        self.widgets.iter().find(|w| w.id == id)
    }
    /// Every text of the page, in reading order (what UI Automation lists).
    pub fn texts(&self) -> Vec<&str> {
        self.items
            .iter()
            .filter_map(|i| match i {
                Item::Text { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }
}

/// Measures text the way the painter will draw it: (width, height) at a maximum width.
pub trait Measure {
    fn measure(&self, text: &str, style: Style, max_w: f32) -> (f32, f32);
}

struct Builder<'a> {
    m: &'a dyn Measure,
    items: Vec<Item>,
    widgets: Vec<Widget>,
}

impl Builder<'_> {
    fn text(&mut self, rect: Rect, text: impl Into<String>, style: Style, color: Rgb) {
        self.items.push(Item::Text {
            rect,
            text: text.into(),
            style,
            color,
            role: Role::Text,
            right: false,
            wrap: false,
        });
    }
    fn heading(&mut self, rect: Rect, text: impl Into<String>) {
        self.items.push(Item::Text {
            rect,
            text: text.into(),
            style: Style::Title,
            color: palette::TEXT,
            role: Role::Heading,
            right: false,
            wrap: false,
        });
    }
    /// A line that may wrap; returns its height.
    fn para(&mut self, x: f32, y: f32, w: f32, text: &str, color: Rgb) -> f32 {
        let (_, h) = self.m.measure(text, Style::Body, w);
        let h = h.max(20.0);
        self.items.push(Item::Text {
            rect: Rect::new(x, y, w, h),
            text: text.into(),
            style: Style::Body,
            color,
            role: Role::Text,
            right: false,
            wrap: true,
        });
        h
    }
    fn icon(&mut self, x: f32, y: f32, icon: Icon, color: Rgb) {
        self.items.push(Item::Icon {
            rect: Rect::new(x, y, 16.0, 16.0),
            icon,
            color,
        });
    }
    /// An icon and a line beside it; returns the line's height.
    fn line(&mut self, y: f32, icon: Icon, text: &str, icon_color: Rgb, color: Rgb) -> f32 {
        let h = self.para(X0 + 28.0, y, CONTENT_W - 28.0, text, color);
        self.icon(X0, y + 2.0, icon, icon_color);
        h
    }
    fn label(&mut self, y: f32, text: &str) {
        self.text(
            Rect::new(X0, y, CONTENT_W, 14.0),
            text.to_uppercase(),
            Style::Label,
            palette::TEXT_MUTED,
        );
    }
    fn button_w(&self, label: &str, variant: Variant) -> f32 {
        let style = if variant == Variant::Primary {
            Style::ButtonBold
        } else {
            Style::Button
        };
        let (w, _) = self.m.measure(label, style, 400.0);
        let w = (w + 32.0).ceil();
        if variant == Variant::Primary {
            w.max(88.0)
        } else {
            w
        }
    }
}

/// Footer buttons, laid out from the right edge leftwards; returned in left-to-right (Tab) order.
fn footer(b: &mut Builder, right_to_left: &[(WidgetId, &str, Variant, bool)]) {
    let mut x = 776.0;
    let mut placed = Vec::new();
    for (id, label, variant, enabled) in right_to_left {
        let w = b.button_w(label, *variant);
        x -= w;
        placed.push(Widget::new(
            *id,
            WidgetKind::Button(*variant),
            Rect::new(x, 472.0, w, 32.0),
            label,
            *enabled,
        ));
        x -= 10.0;
    }
    placed.reverse();
    b.widgets.extend(placed);
}

/// A text field, from its model.
fn field_widget(
    id: WidgetId,
    rect: Rect,
    label: &str,
    field: &crate::field::Field,
    placeholder: &str,
    refused: bool,
) -> Widget {
    let mut w = Widget::new(
        id,
        WidgetKind::TextField {
            caret: field.caret(),
            all: field.all_selected(),
            refused,
        },
        rect,
        label,
        true,
    );
    w.value = field.text().to_string();
    w.placeholder = placeholder.to_string();
    w
}

/// A field's refusal, in words, on the line under it.
fn refusal(b: &mut Builder, y: f32, text: Option<&str>) {
    if let Some(text) = text {
        b.text(
            Rect::new(X0, y, CONTENT_W, 18.0),
            text,
            Style::Body,
            palette::CAUTION_TEXT,
        );
    }
}

/// 🔴 `RELEASE-0111-01` Part A (`P-065`) — **CG BRIDGE'S PLAYOUT PAGE.** The checkbox — unticked, the
/// Playout CG Bridge will use, as one fact — and, ticked, the three addresses the engine needs, each
/// with its refusal said under it. Labels and values only; the Playout field alone has a placeholder.
fn server_page(b: &mut Builder, m: &Model) {
    let s = &m.server;
    b.heading(Rect::new(X0, 54.0, CONTENT_W, 34.0), m.title());
    let (lw, _) = b.m.measure(SEPARATE_LABEL, Style::Body, CONTENT_W);
    b.widgets.push(Widget::new(
        WidgetId::Separate,
        WidgetKind::Checkbox(s.separate),
        Rect::new(X0, 108.0, (28.0 + lw.ceil()).min(CONTENT_W), 24.0),
        SEPARATE_LABEL,
        true,
    ));
    if !s.separate {
        let stored = m
            .facts
            .bridge_config
            .as_ref()
            .filter(|_| !s.was_separate)
            .and_then(|c| c.playout.clone());
        b.label(152.0, PLAYOUT_LABEL);
        b.text(
            Rect::new(X0, 174.0, CONTENT_W, 20.0),
            format!(
                "{} · on this machine",
                stored
                    .as_deref()
                    .unwrap_or(crate::server::PLAYOUT_ON_THIS_MACHINE)
            ),
            Style::Body,
            palette::TEXT,
        );
        return;
    }
    let shown = s.shown.clone();
    let mut y = 150.0;
    b.label(y, PLAYOUT_LABEL);
    b.widgets.push(field_widget(
        WidgetId::PlayoutField,
        Rect::new(X0, y + 20.0, CONTENT_W, 32.0),
        PLAYOUT_LABEL,
        &s.playout,
        PLAYOUT_PLACEHOLDER,
        shown.playout.is_some(),
    ));
    refusal(b, y + 56.0, shown.playout);
    y += 84.0;
    b.label(y, AMCP_LABEL);
    b.widgets.push(field_widget(
        WidgetId::AmcpField,
        Rect::new(X0, y + 20.0, CONTENT_W, 32.0),
        AMCP_LABEL,
        &s.amcp,
        "",
        shown.amcp.is_some(),
    ));
    refusal(b, y + 56.0, shown.amcp);
    y += 84.0;
    b.label(y, ADDRESS_LABEL);
    // This server's addresses, one choice each, then Other; a row that is full wraps.
    let (mut x, mut row) = (X0, y + 20.0);
    let mut chip = |b: &mut Builder, id: WidgetId, text: &str, on: bool| {
        let (tw, _) = b.m.measure(text, Style::Body, 300.0);
        let w = (tw.ceil() + 40.0).min(CONTENT_W);
        if x > X0 && x + w > X1 {
            x = X0;
            row += 40.0;
        }
        b.widgets.push(Widget::new(
            id,
            WidgetKind::Radio(on),
            Rect::new(x, row, w, 32.0),
            text,
            true,
        ));
        x += w + 8.0;
    };
    for (i, address) in s.addresses.iter().enumerate().take(8) {
        chip(
            b,
            WidgetId::Address(i as u8),
            address,
            s.choice == AddressChoice::Listed(i),
        );
    }
    chip(
        b,
        WidgetId::AddressOther,
        OTHER_LABEL,
        s.choice == AddressChoice::Other,
    );
    if s.choice == AddressChoice::Other {
        let room = X1 - x;
        let rect = if room >= 160.0 {
            Rect::new(x, row, room, 32.0)
        } else {
            row += 40.0;
            Rect::new(X0, row, CONTENT_W, 32.0)
        };
        b.widgets.push(field_widget(
            WidgetId::AddressOtherField,
            rect,
            &format!("{ADDRESS_LABEL} (other)"),
            &s.other,
            "",
            shown.address.is_some(),
        ));
    }
    refusal(b, row + 36.0, shown.address);
}

pub fn build(m: &Model, measure: &dyn Measure) -> Scene {
    let mut b = Builder {
        m: measure,
        items: Vec::new(),
        widgets: Vec::new(),
    };
    let p = m.product;
    let mut primary = None;
    let escape;

    match m.page {
        Page::Welcome => {
            b.heading(Rect::new(X0, 54.0, 380.0, 34.0), m.title());
            b.text(
                Rect::new(X0, 96.0, 380.0, 20.0),
                format!("Publisher: {PUBLISHER}"),
                Style::Body,
                palette::TEXT_SECONDARY,
            );
            b.text(
                Rect::new(X0, 116.0, 380.0, 20.0),
                format!("Version {}", m.config.version),
                Style::Body,
                palette::TEXT_SECONDARY,
            );
            b.items.push(Item::Tile {
                rect: Rect::new(X1 - 88.0, 54.0, 88.0, 88.0),
            });
            let mut y = 170.0;
            if let Some(line) = m.version_line() {
                let (_, h) = measure.measure(&line, Style::Body, CONTENT_W - 50.0);
                let box_h = (h.max(20.0) + 20.0).round();
                b.items.push(Item::Callout {
                    rect: Rect::new(X0, y, CONTENT_W, box_h),
                });
                b.icon(
                    X0 + 12.0,
                    y + (box_h - 16.0) / 2.0,
                    Icon::RefreshCw,
                    palette::ACCENT,
                );
                b.para(
                    X0 + 38.0,
                    y + 10.0,
                    CONTENT_W - 50.0,
                    &line,
                    palette::ACCENT_INK,
                );
                y += box_h + 22.0;
            }
            for (icon, text) in p.lines {
                let h = b.line(y, *icon, text, palette::TEXT_MUTED, palette::TEXT_SECONDARY);
                y += h + 10.0;
            }
            if p.uses_webview2 && m.facts.webview2_missing {
                let h = b.line(
                    y,
                    Icon::Package,
                    WEBVIEW2_LINE,
                    palette::TEXT_MUTED,
                    palette::TEXT_SECONDARY,
                );
                y += h + 10.0;
            }
            y += 8.0;
            for caution in m.welcome_cautions() {
                let h = b.line(
                    y,
                    Icon::TriangleAlert,
                    &caution,
                    palette::CAUTION_TEXT,
                    palette::CAUTION_TEXT,
                );
                y += h + 10.0;
            }
            footer(
                &mut b,
                &[
                    (WidgetId::Next, "Next", Variant::Primary, m.platform_ok()),
                    (WidgetId::Cancel, "Cancel", Variant::Ghost, true),
                ],
            );
            primary = Some(WidgetId::Next);
            escape = Some(WidgetId::Cancel);
        }
        Page::Location => {
            b.heading(Rect::new(X0, 54.0, CONTENT_W, 34.0), m.title());
            let mut y = 118.0;
            if p.id == ProductId::Bridge {
                b.label(y, "Program");
                b.text(
                    Rect::new(X0, y + 22.0, CONTENT_W, 20.0),
                    m.dir.clone(),
                    Style::Body,
                    palette::TEXT,
                );
                y += 68.0;
                if let Some(data) = &m.facts.data_dir {
                    b.label(y, "Data");
                    b.text(
                        Rect::new(X0, y + 22.0, CONTENT_W, 20.0),
                        data.clone(),
                        Style::Body,
                        palette::TEXT,
                    );
                    y += 68.0;
                }
            } else if m.dir_changeable() {
                b.label(y, "Folder");
                let change_w = b.button_w("Change", Variant::Secondary);
                let field = Rect::new(X0, y + 22.0, CONTENT_W - 10.0 - change_w, 34.0);
                b.items.push(Item::Field { rect: field });
                b.icon(
                    field.x + 10.0,
                    field.y + 9.0,
                    Icon::Folder,
                    palette::TEXT_MUTED,
                );
                b.text(
                    Rect::new(field.x + 34.0, field.y + 7.0, field.w - 44.0, 20.0),
                    m.dir.clone(),
                    Style::Body,
                    palette::TEXT,
                );
                b.widgets.push(Widget::new(
                    WidgetId::Change,
                    WidgetKind::Button(Variant::Secondary),
                    Rect::new(X1 - change_w, y + 22.0, change_w, 34.0),
                    "Change",
                    true,
                ));
                y += 82.0;
            } else {
                b.label(y, "Folder");
                b.text(
                    Rect::new(X0, y + 22.0, CONTENT_W, 20.0),
                    m.dir.clone(),
                    Style::Body,
                    palette::TEXT,
                );
                y += 68.0;
            }
            b.label(y, "Space");
            let row = |b: &mut Builder, y: f32, k: &str, v: String| {
                b.text(
                    Rect::new(X0, y, 96.0, 20.0),
                    k.to_string(),
                    Style::Body,
                    palette::TEXT_MUTED,
                );
                b.text(
                    Rect::new(X0 + 96.0, y, CONTENT_W - 96.0, 20.0),
                    v,
                    Style::Body,
                    palette::TEXT,
                );
            };
            row(
                &mut b,
                y + 22.0,
                "Needed",
                format_bytes(m.config.install_bytes),
            );
            if let Some(free) = m.space.free {
                row(
                    &mut b,
                    y + 48.0,
                    &format!("Free on {}", m.space.drive),
                    format_bytes(free),
                );
            }
            y += 82.0;
            for caution in m.location_cautions() {
                let h = b.line(
                    y,
                    Icon::TriangleAlert,
                    &caution,
                    palette::CAUTION_TEXT,
                    palette::CAUTION_TEXT,
                );
                y += h + 10.0;
            }
            let go = if m.is_update() { "Update" } else { "Install" };
            // CG Bridge goes on to its Playout page; the apps install from here.
            let (forward, label) = if m.has_server_page() {
                (WidgetId::Next, "Next")
            } else {
                (WidgetId::Install, go)
            };
            footer(
                &mut b,
                &[
                    (forward, label, Variant::Primary, m.can_install()),
                    (WidgetId::Back, "Back", Variant::Ghost, true),
                ],
            );
            primary = Some(forward);
            escape = Some(WidgetId::Cancel);
        }
        Page::Server => {
            server_page(&mut b, m);
            let go = if m.is_update() { "Update" } else { "Install" };
            footer(
                &mut b,
                &[
                    (WidgetId::Install, go, Variant::Primary, m.can_install()),
                    (WidgetId::Back, "Back", Variant::Ghost, true),
                ],
            );
            primary = Some(WidgetId::Install);
            escape = Some(WidgetId::Cancel);
        }
        Page::Installing => {
            b.heading(Rect::new(X0, 54.0, CONTENT_W, 34.0), m.title());
            b.text(
                Rect::new(X0, 162.0, CONTENT_W, 20.0),
                m.progress.words,
                Style::Words,
                palette::TEXT,
            );
            b.items.push(Item::Bar {
                rect: Rect::new(X0, 196.0, CONTENT_W, 4.0),
                fraction: m.shown,
            });
            b.text(
                Rect::new(X0, 212.0, CONTENT_W / 2.0, 14.0),
                format!("STEP {} OF {}", m.progress.step, m.progress.of),
                Style::Readout,
                palette::SPLASH_READOUT,
            );
            b.items.push(Item::Text {
                rect: Rect::new(X0 + CONTENT_W / 2.0, 212.0, CONTENT_W / 2.0, 14.0),
                text: format!("{}%", (m.shown * 100.0).floor() as u32),
                style: Style::Readout,
                color: palette::SPLASH_READOUT,
                role: Role::Text,
                right: true,
                wrap: false,
            });
            let can_cancel = !m.progress.engine_started && !m.cancelling;
            footer(
                &mut b,
                &[(WidgetId::Cancel, "Cancel", Variant::Ghost, can_cancel)],
            );
            escape = can_cancel.then_some(WidgetId::Cancel);
        }
        Page::Done => {
            b.items.push(Item::Mark {
                rect: Rect::new(X0, 60.0, 44.0, 44.0),
                ok: true,
            });
            b.heading(Rect::new(X0, 124.0, CONTENT_W, 34.0), m.title());
            b.text(
                Rect::new(X0, 166.0, CONTENT_W, 20.0),
                format!("Version {}", m.config.version),
                Style::Body,
                palette::TEXT_SECONDARY,
            );
            let mut y = 186.0;
            if p.id == ProductId::Bridge {
                if let Some(running) = m.outcome.service_running {
                    let state = if running { "running" } else { "stopped" };
                    b.text(
                        Rect::new(X0, y, CONTENT_W, 20.0),
                        format!("Service CGBridge · {state}"),
                        Style::Body,
                        palette::TEXT_SECONDARY,
                    );
                    y += 20.0;
                }
            }
            y += 22.0;
            if let Some(warning) = &m.outcome.warning {
                b.line(
                    y,
                    Icon::TriangleAlert,
                    warning,
                    palette::CAUTION_TEXT,
                    palette::CAUTION_TEXT,
                );
            }
            // The one option, at the foot's left: the box and its label are one target.
            let (lw, _) = measure.measure(p.launch_label, Style::Body, 300.0);
            b.widgets.push(Widget::new(
                WidgetId::Launch,
                WidgetKind::Checkbox(m.launch),
                Rect::new(X0, 476.0, 28.0 + lw.ceil(), 24.0),
                p.launch_label,
                true,
            ));
            let mut buttons = vec![(WidgetId::Finish, "Finish", Variant::Primary, true)];
            if m.outcome.warning.is_some() {
                buttons.push((WidgetId::OpenLog, "Open log", Variant::Ghost, true));
            }
            footer(&mut b, &buttons);
            primary = Some(WidgetId::Finish);
            escape = Some(WidgetId::Finish);
        }
        Page::Failed => {
            b.items.push(Item::Mark {
                rect: Rect::new(X0, 60.0, 44.0, 44.0),
                ok: false,
            });
            b.heading(Rect::new(X0, 124.0, CONTENT_W, 34.0), m.title());
            let reason = m
                .outcome
                .reason
                .clone()
                .unwrap_or_else(|| "Setup stopped.".into());
            b.para(X0, 168.0, CONTENT_W, &reason, palette::TEXT_SECONDARY);
            footer(
                &mut b,
                &[
                    (WidgetId::Close, "Close", Variant::Primary, true),
                    (WidgetId::OpenLog, "Open log", Variant::Ghost, true),
                ],
            );
            primary = Some(WidgetId::Close);
            escape = Some(WidgetId::Close);
        }
    }

    // Help, at the rail's foot: the guide when it is bundled; CG Bridge's status once installed.
    if help_target(m).is_some() {
        let (w, _) = measure.measure("Help", Style::Body, 100.0);
        b.widgets.push(Widget::new(
            WidgetId::Help,
            WidgetKind::Link,
            Rect::new(32.0, 476.0, 32.0 + w.ceil(), 24.0),
            "Help",
            true,
        ));
    }
    let installing = m.page == Page::Installing;
    b.widgets.push(Widget::new(
        WidgetId::Minimize,
        WidgetKind::TitleButton,
        Rect::new(708.0, 0.0, 46.0, 40.0),
        "Minimise",
        true,
    ));
    b.widgets.push(Widget::new(
        WidgetId::CloseWindow,
        WidgetKind::TitleButton,
        Rect::new(754.0, 0.0, 46.0, 40.0),
        "Close",
        !installing || (!m.progress.engine_started && !m.cancelling),
    ));

    let rail = m
        .step_labels()
        .iter()
        .zip(m.steps())
        .enumerate()
        .map(|(i, (label, state))| RailStep {
            label,
            state,
            cx: 47.0,
            cy: 178.0 + 48.0 * i as f32,
        })
        .collect();

    Scene {
        items: b.items,
        widgets: b.widgets,
        primary,
        escape,
        rail,
        window_title: format!("{} Setup", p.name),
    }
}

/// What Help opens now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HelpTarget {
    Guide,
    BridgeStatus,
}

pub fn help_target(m: &Model) -> Option<HelpTarget> {
    if m.product.id == ProductId::Bridge && m.page == Page::Done && m.outcome.ok {
        Some(HelpTarget::BridgeStatus)
    } else if m.has_guide {
        Some(HelpTarget::Guide)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Facts, Kind, Outcome, Space};
    use crate::product::{Config, MainFile, BRIDGE, CONTROL, DESIGNER};

    /// A stand-in for DirectWrite: 0.55 em per character, one line per 60 characters.
    struct Fake;
    impl Measure for Fake {
        fn measure(&self, text: &str, style: Style, max_w: f32) -> (f32, f32) {
            let w = text.chars().count() as f32 * style.size() * 0.55;
            let lines = (w / max_w).ceil().max(1.0);
            (w.min(max_w), lines * style.size() * 1.35)
        }
    }

    fn model(product: &'static crate::product::Product, facts: Facts) -> Model {
        let config = Config {
            product: product.id,
            version: "0.10.0".into(),
            engine_name: "e.exe".into(),
            install_bytes: 19_600_000,
            main_files: vec![MainFile {
                path: "x.exe".into(),
                bytes: 1,
            }],
        };
        let mut m = Model::new(product, config, facts, None, true);
        m.space = Space {
            drive: "C:".into(),
            free: Some(126_000_000_000),
            writable: true,
        };
        m
    }

    #[test]
    fn welcome_says_what_section_2_asks_for() {
        let m = model(
            &CONTROL,
            Facts {
                webview2_missing: true,
                ..Facts::default()
            },
        );
        let s = build(&m, &Fake);
        let t = s.texts();
        assert_eq!(t[0], "Install CG Control?");
        assert!(t.contains(&"Publisher: APASAI"));
        assert!(t.contains(&"Version 0.10.0"));
        assert!(t.contains(&"The playout console · connects to CG Bridge"));
        assert!(t.contains(&WEBVIEW2_LINE));
        assert!(s.items.iter().any(|i| matches!(i, Item::Tile { .. })));
        assert_eq!(s.primary, Some(WidgetId::Next));
        assert_eq!(
            s.widget(WidgetId::Next).map(|w| w.label.as_str()),
            Some("Next")
        );
        assert_eq!(s.window_title, "CG Control Setup");
    }

    #[test]
    fn an_update_names_both_versions() {
        let m = model(
            &DESIGNER,
            Facts {
                installed_version: Some("0.9.1".into()),
                ..Facts::default()
            },
        );
        let s = build(&m, &Fake);
        assert!(s
            .texts()
            .contains(&"Update from 0.9.1 to 0.10.0. Your settings are kept."));
        assert_eq!(s.texts()[0], "Update CG Designer?");
        assert_eq!(
            m.kind,
            Kind::Update {
                from: "0.9.1".into()
            }
        );
    }

    #[test]
    fn cg_bridges_lines_are_its_service_and_ports() {
        let m = model(&BRIDGE, Facts::default());
        let t = build(&m, &Fake)
            .texts()
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();
        assert!(t.contains(&"A Windows service · ports 5280, 7911 · UDP 6251".to_string()));
        assert!(!t.iter().any(|l| l.contains("WebView2")));
    }

    #[test]
    fn location_offers_a_folder_only_where_the_mode_allows_it() {
        let mut m = model(
            &CONTROL,
            Facts {
                default_dir: r"C:\U\CG Control".into(),
                ..Facts::default()
            },
        );
        m.page = Page::Location;
        let s = build(&m, &Fake);
        assert!(s.widget(WidgetId::Change).is_some());
        assert!(s.texts().contains(&"18.7 MB"));
        assert!(s.texts().contains(&"Free on C:"));
        let mut b = model(
            &BRIDGE,
            Facts {
                data_dir: Some(r"C:\ProgramData\CG Bridge".into()),
                ..Facts::default()
            },
        );
        b.page = Page::Location;
        let s = build(&b, &Fake);
        assert!(
            s.widget(WidgetId::Change).is_none(),
            "CG Bridge's folder is a fact, not a control"
        );
        assert!(s.texts().contains(&"PROGRAM") && s.texts().contains(&"DATA"));
    }

    #[test]
    fn installing_shows_the_step_and_the_bar_and_cancel_only_before_the_engine_starts() {
        let mut m = model(&BRIDGE, Facts::default());
        m.page = Page::Installing;
        m.progress = crate::observe::bridge("", 1.0, 0, 10, true);
        m.shown = 0.427;
        let s = build(&m, &Fake);
        assert!(s.texts().contains(&"Stopping the service"));
        assert!(s.texts().contains(&"STEP 2 OF 11"));
        assert!(s.texts().contains(&"42%"));
        assert!(!s.widget(WidgetId::Cancel).unwrap().enabled);
        assert!(!s.widget(WidgetId::CloseWindow).unwrap().enabled);
        assert_eq!(s.escape, None);
        m.progress.engine_started = false;
        assert!(build(&m, &Fake).widget(WidgetId::Cancel).unwrap().enabled);
    }

    #[test]
    fn done_has_one_option_and_one_primary() {
        let mut m = model(&CONTROL, Facts::default());
        m.page = Page::Done;
        m.outcome = Outcome {
            ok: true,
            ..Outcome::default()
        };
        let s = build(&m, &Fake);
        assert_eq!(s.texts()[0], "CG Control is installed");
        let launch = s.widget(WidgetId::Launch).unwrap();
        assert_eq!(
            (launch.label.as_str(), launch.kind),
            ("Launch when ready", WidgetKind::Checkbox(true))
        );
        let primaries = s
            .widgets
            .iter()
            .filter(|w| w.kind == WidgetKind::Button(Variant::Primary))
            .count();
        assert_eq!(primaries, 1);
        assert!(s.widget(WidgetId::OpenLog).is_none());
        let mut b = model(&BRIDGE, Facts::default());
        b.page = Page::Done;
        b.outcome = Outcome {
            ok: true,
            warning: Some("A firewall rule was not added.".into()),
            service_running: Some(true),
            ..Outcome::default()
        };
        let s = build(&b, &Fake);
        assert_eq!(
            s.widget(WidgetId::Launch).unwrap().label,
            "Open CG Bridge status"
        );
        assert!(s.texts().contains(&"Service CGBridge · running"));
        assert!(s.widget(WidgetId::OpenLog).is_some());
        assert_eq!(help_target(&b), Some(HelpTarget::BridgeStatus));
    }

    #[test]
    fn failed_has_the_reason_open_log_and_close() {
        let mut m = model(&CONTROL, Facts::default());
        m.page = Page::Failed;
        m.outcome.reason = Some("The WebView2 runtime could not be installed.".into());
        let s = build(&m, &Fake);
        assert_eq!(s.texts()[0], "CG Control was not installed");
        assert!(s
            .texts()
            .contains(&"The WebView2 runtime could not be installed."));
        let tab: Vec<WidgetId> = s
            .widgets
            .iter()
            .filter(|w| w.tabbable())
            .map(|w| w.id)
            .collect();
        assert_eq!(
            tab,
            vec![WidgetId::OpenLog, WidgetId::Close, WidgetId::Help]
        );
        assert!(m.steps().contains(&StepState::Failed));
    }

    /// `RELEASE-0111-01` Part A — CG Bridge's Playout page.
    fn bridge_on_server_page() -> Model {
        let mut m = model(
            &BRIDGE,
            Facts {
                ipv4: vec!["192.0.2.20".into(), "198.51.100.7".into()],
                ..Facts::default()
            },
        );
        m.server = crate::server::ServerSetup::new(
            None,
            &crate::server::StoredBridge::default(),
            m.facts.ipv4.clone(),
        );
        m.page = Page::Server;
        m
    }

    #[test]
    fn cg_bridges_location_goes_on_to_its_playout_page_and_its_rail_has_five_steps() {
        let mut m = model(&BRIDGE, Facts::default());
        m.page = Page::Location;
        let s = build(&m, &Fake);
        assert_eq!(s.primary, Some(WidgetId::Next));
        assert!(s.widget(WidgetId::Install).is_none());
        assert_eq!(
            s.rail.iter().map(|r| r.label).collect::<Vec<_>>(),
            vec!["Welcome", "Location", "Playout", "Installing", "Done"]
        );
        // Control: CG Control's Location installs, and its rail is the four steps it always had.
        let mut c = model(&CONTROL, Facts::default());
        c.page = Page::Location;
        let s = build(&c, &Fake);
        assert_eq!(s.primary, Some(WidgetId::Install));
        assert_eq!(s.rail.len(), 4);
    }

    #[test]
    fn unticked_the_page_is_the_checkbox_and_the_playout_on_this_machine() {
        let m = bridge_on_server_page();
        let s = build(&m, &Fake);
        assert_eq!(s.texts()[0], "Playout");
        let separate = s.widget(WidgetId::Separate).unwrap();
        assert_eq!(
            (separate.label.as_str(), separate.kind),
            (crate::server::SEPARATE_LABEL, WidgetKind::Checkbox(false))
        );
        assert!(s
            .texts()
            .contains(&"http://127.0.0.1:8080 · on this machine"));
        assert!(s.widget(WidgetId::PlayoutField).is_none());
        assert_eq!(s.primary, Some(WidgetId::Install));
        assert_eq!(s.escape, Some(WidgetId::Cancel));
        assert_eq!(
            m.steps(),
            vec![
                StepState::Done,
                StepState::Done,
                StepState::Current,
                StepState::Pending,
                StepState::Pending
            ]
        );
    }

    #[test]
    fn ticked_it_asks_for_the_three_addresses_in_tab_order() {
        let mut m = bridge_on_server_page();
        m.server.toggle();
        let s = build(&m, &Fake);
        assert!(s.texts().contains(&"PLAYOUT ADDRESS"));
        assert!(s.texts().contains(&"CASPARCG (AMCP) HOST"));
        assert!(s.texts().contains(&"THIS SERVER'S ADDRESS"));
        let tab: Vec<WidgetId> = s
            .widgets
            .iter()
            .filter(|w| w.tabbable())
            .map(|w| w.id)
            .collect();
        assert_eq!(
            tab,
            vec![
                WidgetId::Separate,
                WidgetId::PlayoutField,
                WidgetId::AmcpField,
                WidgetId::Address(0),
                WidgetId::Address(1),
                WidgetId::AddressOther,
                WidgetId::Back,
                WidgetId::Install,
                WidgetId::Help,
            ]
        );
        assert_eq!(s.widget(WidgetId::Address(0)).unwrap().label, "192.0.2.20");
        assert_eq!(
            s.widget(WidgetId::PlayoutField).unwrap().placeholder,
            crate::server::PLAYOUT_PLACEHOLDER
        );
        // Every control is on the page, above the foot.
        for w in &s.widgets {
            if matches!(
                w.kind,
                WidgetKind::TextField { .. } | WidgetKind::Radio(_) | WidgetKind::Checkbox(_)
            ) {
                assert!(w.rect.bottom() <= FOOT_Y, "{:?} reaches the foot", w.id);
                assert!(w.rect.right() <= X1 + 0.01, "{:?} is past the page", w.id);
            }
        }
        // Other opens its own field.
        m.server.choice = crate::server::AddressChoice::Other;
        assert!(build(&m, &Fake)
            .widget(WidgetId::AddressOtherField)
            .is_some());
    }

    #[test]
    fn a_refusal_is_said_in_words_under_its_field() {
        let mut m = bridge_on_server_page();
        m.server.toggle();
        m.server.shown = m.server.judge();
        let s = build(&m, &Fake);
        assert!(s.texts().contains(&crate::server::TYPE_THE_PLAYOUT));
        let field = s.widget(WidgetId::PlayoutField).unwrap();
        assert!(matches!(
            field.kind,
            WidgetKind::TextField { refused: true, .. }
        ));
        let words = s
            .items
            .iter()
            .find_map(|i| match i {
                Item::Text { rect, text, .. } if text == crate::server::TYPE_THE_PLAYOUT => {
                    Some(*rect)
                }
                _ => None,
            })
            .unwrap();
        assert!(
            words.y >= field.rect.bottom() && words.y - field.rect.bottom() < 8.0,
            "the refusal sits right under its field"
        );
    }

    #[test]
    fn footer_buttons_end_at_the_foots_right_padding_and_never_overlap() {
        let mut m = model(&CONTROL, Facts::default());
        m.page = Page::Location;
        let s = build(&m, &Fake);
        let back = s.widget(WidgetId::Back).unwrap().rect;
        let install = s.widget(WidgetId::Install).unwrap().rect;
        assert_eq!(install.right(), 776.0);
        assert!(back.right() + 10.0 <= install.x + 0.01);
        assert!(install.w >= 88.0);
    }
}
