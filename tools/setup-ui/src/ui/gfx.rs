//! The painter: Direct2D shapes and DirectWrite text, in DIPs, on any render target — the window's,
//! or a bitmap's for the developer's preview. Every shape is vector (paths, rounded rects, the
//! mark's own path data); the only bitmap is the app's tile, rescaled from its 512 px source to the
//! exact device size, so nothing is stretched at 150 % or 200 %.

use crate::icons::{self, Icon};
use crate::layout::{
    Item, Measure, RailStep, Rect, Scene, Style, Variant, WidgetId, WidgetKind, FOOT_Y, RAIL_W,
    TITLE_H, WIN_H, WIN_W,
};
use crate::model::{StepState, MAX_STEPS};
use crate::palette::{self, Rgb};
use crate::product::ProductId;
use crate::rail_art::{self, Op as ArtOp};
use crate::svgpath::{self, Cmd, Xform};
use std::cell::RefCell;
use std::collections::HashMap;
use std::mem::ManuallyDrop;
use windows::core::{Interface, Result, HSTRING};
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::*;
use windows::Win32::Graphics::Imaging::*;
use windows_numerics::{Matrix3x2, Vector2};

const LOGO_SVG: &str = include_str!("../../../../apps/runtime/brand/apasai-logo.svg");

pub fn color(c: Rgb, a: f32) -> D2D1_COLOR_F {
    D2D1_COLOR_F {
        r: f32::from(c.0) / 255.0,
        g: f32::from(c.1) / 255.0,
        b: f32::from(c.2) / 255.0,
        a,
    }
}

fn v(x: f32, y: f32) -> Vector2 {
    Vector2 { X: x, Y: y }
}

fn rect(r: Rect) -> D2D_RECT_F {
    D2D_RECT_F {
        left: r.x,
        top: r.y,
        right: r.x + r.w,
        bottom: r.y + r.h,
    }
}

fn rr(r: Rect, radius: f32) -> D2D1_ROUNDED_RECT {
    D2D1_ROUNDED_RECT {
        rect: rect(r),
        radiusX: radius,
        radiusY: radius,
    }
}

fn inflate(r: Rect, d: f32) -> Rect {
    Rect::new(r.x - d, r.y - d, r.w + 2.0 * d, r.h + 2.0 * d)
}

fn ease_out(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    1.0 - (1.0 - t).powi(3)
}

fn mix(a: Rgb, b: Rgb, t: f32) -> Rgb {
    let l = |x: u8, y: u8| {
        (f32::from(x) + (f32::from(y) - f32::from(x)) * t.clamp(0.0, 1.0)).round() as u8
    };
    Rgb(l(a.0, b.0), l(a.1, b.1), l(a.2, b.2))
}

/// Device-independent resources: the factories, text formats and geometry.
pub struct Gfx {
    pub d2d: ID2D1Factory,
    pub dwrite: IDWriteFactory,
    pub wic: IWICImagingFactory,
    formats: RefCell<HashMap<(Style, bool), IDWriteTextFormat>>,
    icons: RefCell<HashMap<(Icon, u32), Vec<ID2D1PathGeometry>>>,
    round: ID2D1StrokeStyle,
    /// The APASAI mark at the rail's size, in place: (geometry, colour).
    logo: Vec<(ID2D1PathGeometry, Rgb)>,
    logo_w: f32,
}

/// Per render target: brushes and the tile at this DPI.
#[derive(Default)]
pub struct Device {
    brushes: HashMap<(u8, u8, u8, u16), ID2D1SolidColorBrush>,
    tile: Option<(ID2D1Bitmap, u32)>,
}

/// What the painter needs besides the scene: interaction and animation state.
pub struct Frame<'a> {
    pub scene: &'a Scene,
    pub role: &'a str,
    /// Whose rail art the foot of the rail carries (`P-067`).
    pub product: ProductId,
    pub tile_png: Option<&'a [u8]>,
    pub hover: &'a dyn Fn(WidgetId) -> f32,
    pub pressed: Option<WidgetId>,
    pub focus: Option<WidgetId>,
    pub focus_visible: bool,
    /// The page's entrance, 0 → 1.
    pub page_t: f32,
    /// Each rail step's tick, drawing in, 0 → 1.
    pub step_t: [f32; MAX_STEPS],
    /// The Done/Failed mark, drawing in, 0 → 1.
    pub mark_t: f32,
    /// Windows 11 draws the window's border (DWM); Windows 10 gets ours.
    pub dwm_border: bool,
    /// Device pixels per DIP.
    pub scale: f32,
}

impl Gfx {
    pub fn new() -> Result<Gfx> {
        unsafe {
            let d2d: ID2D1Factory = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, None)?;
            let dwrite: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
            let wic: IWICImagingFactory = windows::Win32::System::Com::CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                windows::Win32::System::Com::CLSCTX_INPROC_SERVER,
            )?;
            let round = d2d.CreateStrokeStyle(
                &D2D1_STROKE_STYLE_PROPERTIES {
                    startCap: D2D1_CAP_STYLE_ROUND,
                    endCap: D2D1_CAP_STYLE_ROUND,
                    dashCap: D2D1_CAP_STYLE_ROUND,
                    lineJoin: D2D1_LINE_JOIN_ROUND,
                    miterLimit: 10.0,
                    dashStyle: D2D1_DASH_STYLE_SOLID,
                    dashOffset: 0.0,
                },
                None,
            )?;
            let mut gfx = Gfx {
                d2d,
                dwrite,
                wic,
                formats: RefCell::new(HashMap::new()),
                icons: RefCell::new(HashMap::new()),
                round,
                logo: Vec::new(),
                logo_w: 0.0,
            };
            // The sign-in card's mark size (`.cg-apasai-mark svg { height: 36px }`).
            gfx.build_logo(36.0)?;
            Ok(gfx)
        }
    }

    /// The mark, from the brand file's own path data, relit for the dark ground as the splash
    /// relights it (bars and swoosh); the arc keeps APASAI's exact blue.
    fn build_logo(&mut self, height: f32) -> Result<()> {
        let s = height / 96.0;
        let x0 = RAIL_W / 2.0 - 114.0 * s / 2.0;
        let place = Xform::scale_translate(s, s, x0, 34.0)
            .then(Xform::scale_translate(0.01, -0.01, 0.0, 96.0));
        for (class, color) in [
            ("apasai-swoosh", palette::LOGO_SWOOSH),
            ("apasai-arc", palette::BRAND),
            ("apasai-bars", palette::LOGO_BARS),
        ] {
            let start = LOGO_SVG.find(&format!("class=\"{class}\"")).unwrap_or(0);
            let end = start + LOGO_SVG[start..].find("</g>").unwrap_or(0);
            for chunk in LOGO_SVG[start..end].split(" d=\"").skip(1) {
                let d = chunk.split('"').next().unwrap_or("");
                let cmds = place.map(&svgpath::parse(d));
                self.logo.push((self.geometry(&cmds, true)?, color));
            }
        }
        self.logo_w = 114.0 * s;
        Ok(())
    }

    pub fn geometry(&self, cmds: &[Cmd], filled: bool) -> Result<ID2D1PathGeometry> {
        unsafe {
            let geo = self.d2d.CreatePathGeometry()?;
            let sink = geo.Open()?;
            sink.SetFillMode(D2D1_FILL_MODE_WINDING);
            let begin = if filled {
                D2D1_FIGURE_BEGIN_FILLED
            } else {
                D2D1_FIGURE_BEGIN_HOLLOW
            };
            let mut open = false;
            for c in cmds {
                match *c {
                    Cmd::Move(x, y) => {
                        if open {
                            sink.EndFigure(D2D1_FIGURE_END_OPEN);
                        }
                        sink.BeginFigure(v(x, y), begin);
                        open = true;
                    }
                    Cmd::Line(x, y) if open => sink.AddLine(v(x, y)),
                    Cmd::Cubic(x1, y1, x2, y2, x, y) if open => {
                        sink.AddBezier(&D2D1_BEZIER_SEGMENT {
                            point1: v(x1, y1),
                            point2: v(x2, y2),
                            point3: v(x, y),
                        })
                    }
                    Cmd::Quad(x1, y1, x, y) if open => {
                        sink.AddQuadraticBezier(&D2D1_QUADRATIC_BEZIER_SEGMENT {
                            point1: v(x1, y1),
                            point2: v(x, y),
                        })
                    }
                    Cmd::Arc(rx, ry, rot, large, sweep, x, y) if open => {
                        sink.AddArc(&D2D1_ARC_SEGMENT {
                            point: v(x, y),
                            size: D2D_SIZE_F {
                                width: rx,
                                height: ry,
                            },
                            rotationAngle: rot,
                            sweepDirection: if sweep {
                                D2D1_SWEEP_DIRECTION_CLOCKWISE
                            } else {
                                D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE
                            },
                            arcSize: if large {
                                D2D1_ARC_SIZE_LARGE
                            } else {
                                D2D1_ARC_SIZE_SMALL
                            },
                        })
                    }
                    Cmd::Close if open => {
                        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
                        open = false;
                    }
                    _ => {}
                }
            }
            if open {
                sink.EndFigure(D2D1_FIGURE_END_OPEN);
            }
            sink.Close()?;
            Ok(geo)
        }
    }

    /// An icon's paths at `size` DIPs, at the origin.
    fn icon_geo(&self, icon: Icon, size: f32) -> Vec<ID2D1PathGeometry> {
        let key = (icon, (size * 10.0) as u32);
        if let Some(g) = self.icons.borrow().get(&key) {
            return g.clone();
        }
        let s = size / 24.0;
        let place = Xform::scale_translate(s, s, 0.0, 0.0);
        let geos: Vec<_> = icons::paths(icon)
            .iter()
            .filter_map(|d| self.geometry(&place.map(&svgpath::parse(d)), false).ok())
            .collect();
        self.icons.borrow_mut().insert(key, geos.clone());
        geos
    }

    fn format(&self, style: Style, bold_override: bool) -> Result<IDWriteTextFormat> {
        if let Some(f) = self.formats.borrow().get(&(style, bold_override)) {
            return Ok(f.clone());
        }
        let (family, weight) = match style {
            Style::Readout => ("Consolas", DWRITE_FONT_WEIGHT_NORMAL),
            Style::Title | Style::Label | Style::Button | Style::RailCurrent => {
                ("Segoe UI", DWRITE_FONT_WEIGHT_SEMI_BOLD)
            }
            Style::ButtonBold => ("Segoe UI", DWRITE_FONT_WEIGHT_BOLD),
            _ => ("Segoe UI", DWRITE_FONT_WEIGHT_NORMAL),
        };
        let weight = if bold_override {
            DWRITE_FONT_WEIGHT_LIGHT
        } else {
            weight
        };
        let f = unsafe {
            self.dwrite.CreateTextFormat(
                &HSTRING::from(family),
                None,
                weight,
                DWRITE_FONT_STYLE_NORMAL,
                DWRITE_FONT_STRETCH_NORMAL,
                style.size(),
                &HSTRING::from("en-us"),
            )?
        };
        self.formats
            .borrow_mut()
            .insert((style, bold_override), f.clone());
        Ok(f)
    }

    /// A laid-out text. Letter spacing is the console's: labels 0.06 em, the readout 0.13 em.
    pub fn layout(
        &self,
        text: &str,
        style: Style,
        max_w: f32,
        wrap: bool,
        align: DWRITE_TEXT_ALIGNMENT,
    ) -> Result<IDWriteTextLayout> {
        unsafe {
            let format = self.format(style, false)?;
            let wide: Vec<u16> = text.encode_utf16().collect();
            let layout = self
                .dwrite
                .CreateTextLayout(&wide, &format, max_w.max(1.0), 1000.0)?;
            layout.SetWordWrapping(if wrap {
                DWRITE_WORD_WRAPPING_WRAP
            } else {
                DWRITE_WORD_WRAPPING_NO_WRAP
            })?;
            layout.SetTextAlignment(align)?;
            if !wrap {
                let sign = self.dwrite.CreateEllipsisTrimmingSign(&format)?;
                let trimming = DWRITE_TRIMMING {
                    granularity: DWRITE_TRIMMING_GRANULARITY_CHARACTER,
                    delimiter: 0,
                    delimiterCount: 0,
                };
                layout.SetTrimming(&trimming, &sign)?;
            }
            let spacing = match style {
                Style::Label => 0.06,
                Style::Readout => 0.13,
                _ => 0.0,
            };
            if spacing > 0.0 {
                if let Ok(l1) = layout.cast::<IDWriteTextLayout1>() {
                    let range = DWRITE_TEXT_RANGE {
                        startPosition: 0,
                        length: wide.len() as u32,
                    };
                    l1.SetCharacterSpacing(0.0, spacing * style.size(), 0.0, range)?;
                }
            }
            Ok(layout)
        }
    }

    fn metrics(layout: &IDWriteTextLayout) -> DWRITE_TEXT_METRICS {
        let mut m = DWRITE_TEXT_METRICS::default();
        unsafe {
            let _ = layout.GetMetrics(&mut m);
        }
        m
    }

    /// The tile at this DPI: the app's own 512 px icon, rescaled once with a high-quality filter
    /// to the exact device-pixel size it is drawn at.
    fn tile(
        &self,
        rt: &ID2D1RenderTarget,
        dev: &mut Device,
        png: &[u8],
        px: u32,
    ) -> Option<ID2D1Bitmap> {
        if let Some((b, at)) = &dev.tile {
            if *at == px {
                return Some(b.clone());
            }
        }
        unsafe {
            let stream = windows::Win32::UI::Shell::SHCreateMemStream(Some(png))?;
            let decoder = self
                .wic
                .CreateDecoderFromStream(&stream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .ok()?;
            let frame = decoder.GetFrame(0).ok()?;
            let scaler = self.wic.CreateBitmapScaler().ok()?;
            if scaler
                .Initialize(&frame, px, px, WICBitmapInterpolationModeHighQualityCubic)
                .is_err()
            {
                scaler
                    .Initialize(&frame, px, px, WICBitmapInterpolationModeFant)
                    .ok()?;
            }
            let conv = self.wic.CreateFormatConverter().ok()?;
            conv.Initialize(
                &scaler,
                &GUID_WICPixelFormat32bppPBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .ok()?;
            let bmp = rt.CreateBitmapFromWicBitmap(&conv, None).ok()?;
            dev.tile = Some((bmp.clone(), px));
            Some(bmp)
        }
    }
}

impl Measure for Gfx {
    fn measure(&self, text: &str, style: Style, max_w: f32) -> (f32, f32) {
        match self.layout(text, style, max_w, true, DWRITE_TEXT_ALIGNMENT_LEADING) {
            Ok(l) => {
                let m = Gfx::metrics(&l);
                (m.widthIncludingTrailingWhitespace, m.height)
            }
            Err(_) => (text.len() as f32 * style.size() * 0.55, style.size() * 1.35),
        }
    }
}

/// One frame's drawing context.
struct Painter<'a> {
    g: &'a Gfx,
    rt: &'a ID2D1RenderTarget,
    dev: &'a mut Device,
    scale: f32,
}

impl Painter<'_> {
    fn brush(&mut self, c: Rgb, a: f32) -> ID2D1SolidColorBrush {
        let key = (c.0, c.1, c.2, (a.clamp(0.0, 1.0) * 1000.0) as u16);
        if let Some(b) = self.dev.brushes.get(&key) {
            return b.clone();
        }
        let b =
            unsafe { self.rt.CreateSolidColorBrush(&color(c, a), None) }.expect("a solid brush");
        self.dev.brushes.insert(key, b.clone());
        b
    }

    /// A hairline's position, on a device pixel.
    fn snap(&self, v: f32) -> f32 {
        ((v * self.scale).floor() + 0.5) / self.scale
    }
    fn hairline(&self) -> f32 {
        self.scale.floor().max(1.0) / self.scale
    }

    fn fill(&mut self, r: Rect, c: Rgb, a: f32) {
        let b = self.brush(c, a);
        unsafe { self.rt.FillRectangle(&rect(r), &b) };
    }
    fn fill_round(&mut self, r: Rect, radius: f32, c: Rgb, a: f32) {
        let b = self.brush(c, a);
        unsafe { self.rt.FillRoundedRectangle(&rr(r, radius), &b) };
    }
    /// A 1-device-pixel outline, inside `r`'s edge (CSS `border`).
    fn border_round(&mut self, r: Rect, radius: f32, c: Rgb, a: f32) {
        let w = self.hairline();
        let inner = Rect::new(
            self.snap(r.x),
            self.snap(r.y),
            self.snap(r.right() - w) - self.snap(r.x),
            self.snap(r.bottom() - w) - self.snap(r.y),
        );
        let b = self.brush(c, a);
        unsafe {
            self.rt
                .DrawRoundedRectangle(&rr(inner, radius), &b, w, None)
        };
    }
    fn hline(&mut self, x0: f32, x1: f32, y: f32, c: Rgb) {
        let (y, w) = (self.snap(y), self.hairline());
        let b = self.brush(c, 1.0);
        unsafe { self.rt.DrawLine(v(x0, y), v(x1, y), &b, w, None) };
    }
    fn vline(&mut self, x: f32, y0: f32, y1: f32, c: Rgb) {
        let (x, w) = (self.snap(x), self.hairline());
        let b = self.brush(c, 1.0);
        unsafe { self.rt.DrawLine(v(x, y0), v(x, y1), &b, w, None) };
    }
    fn circle(&mut self, cx: f32, cy: f32, r: f32, c: Rgb, a: f32) {
        let b = self.brush(c, a);
        unsafe {
            self.rt.FillEllipse(
                &D2D1_ELLIPSE {
                    point: v(cx, cy),
                    radiusX: r,
                    radiusY: r,
                },
                &b,
            )
        };
    }
    fn ring(&mut self, cx: f32, cy: f32, r: f32, width: f32, c: Rgb, a: f32) {
        let b = self.brush(c, a);
        unsafe {
            self.rt.DrawEllipse(
                &D2D1_ELLIPSE {
                    point: v(cx, cy),
                    radiusX: r,
                    radiusY: r,
                },
                &b,
                width,
                None,
            )
        };
    }
    /// An icon in lucide's stroke, `size` DIPs, top-left at (x, y).
    fn icon(&mut self, icon: Icon, x: f32, y: f32, size: f32, c: Rgb, a: f32, stroke: f32) {
        let b = self.brush(c, a);
        let geos = self.g.icon_geo(icon, size);
        unsafe {
            let mut old = Matrix3x2::default();
            self.rt.GetTransform(&mut old);
            self.rt.SetTransform(&(Matrix3x2::translation(x, y) * old));
            for geo in &geos {
                self.rt
                    .DrawGeometry(geo, &b, stroke * size / 24.0, &self.g.round);
            }
            self.rt.SetTransform(&old);
        }
    }
    /// The check mark, drawn in by length (`t` 0 → 1), `size` DIPs, centred at (cx, cy).
    fn check(&mut self, cx: f32, cy: f32, size: f32, t: f32, c: Rgb, stroke: f32) {
        if t <= 0.0 {
            return;
        }
        let s = size / 24.0;
        let place = Xform::scale_translate(s, s, cx - size / 2.0, cy - size / 2.0);
        let cmds =
            svgpath::polyline_prefix(&place.map(&svgpath::parse(icons::paths(Icon::Check)[0])), t);
        if let Ok(geo) = self.g.geometry(&cmds, false) {
            let b = self.brush(c, 1.0);
            unsafe { self.rt.DrawGeometry(&geo, &b, stroke * s, &self.g.round) };
        }
    }
    fn text(
        &mut self,
        r: Rect,
        text: &str,
        style: Style,
        c: Rgb,
        a: f32,
        align: DWRITE_TEXT_ALIGNMENT,
        wrap: bool,
    ) {
        let Ok(layout) = self.g.layout(text, style, r.w, wrap, align) else {
            return;
        };
        let y = if wrap {
            r.y
        } else {
            r.y + (r.h - Gfx::metrics(&layout).height) / 2.0
        };
        let b = self.brush(c, a);
        unsafe {
            self.rt
                .DrawTextLayout(v(r.x, y), &layout, &b, D2D1_DRAW_TEXT_OPTIONS_NONE)
        };
    }
    fn layer(&mut self, opacity: f32) {
        unsafe {
            self.rt.PushLayer(
                &D2D1_LAYER_PARAMETERS {
                    contentBounds: D2D_RECT_F {
                        left: -1e6,
                        top: -1e6,
                        right: 1e6,
                        bottom: 1e6,
                    },
                    geometricMask: ManuallyDrop::new(None),
                    maskAntialiasMode: D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
                    maskTransform: Matrix3x2::identity(),
                    opacity,
                    opacityBrush: ManuallyDrop::new(None),
                    layerOptions: D2D1_LAYER_OPTIONS_NONE,
                },
                None,
            )
        };
    }
    fn pop(&mut self) {
        unsafe { self.rt.PopLayer() };
    }
}

/// Draw one frame. The caller has called `BeginDraw`.
pub fn paint(g: &Gfx, rt: &ID2D1RenderTarget, dev: &mut Device, f: &Frame) {
    let mut p = Painter {
        g,
        rt,
        dev,
        scale: f.scale,
    };
    unsafe {
        rt.SetTransform(&Matrix3x2::identity());
        rt.Clear(Some(&color(palette::SURFACE, 1.0)));
    }
    rail(&mut p, f);
    // The foot: the sign-in card's — a raised surface, ruled above.
    p.fill(
        Rect::new(RAIL_W, FOOT_Y, WIN_W - RAIL_W, WIN_H - FOOT_Y),
        palette::SURFACE_RAISED,
        1.0,
    );
    p.hline(RAIL_W, WIN_W, FOOT_Y, palette::BORDER);

    // The page enters: a short rise and fade (none under reduced motion: page_t is 1).
    let e = ease_out(f.page_t);
    unsafe { rt.SetTransform(&Matrix3x2::translation(0.0, 8.0 * (1.0 - e))) };
    let layered = e < 1.0;
    if layered {
        p.layer(e);
    }
    for item in &f.scene.items {
        page_item(&mut p, f, item);
    }
    // The page's own controls (the folder's Change, the Playout page's fields) enter with the page;
    // the foot's buttons, Help and the title bar's stay where they are.
    let on_page = |w: &&crate::layout::Widget| {
        w.rect.x >= RAIL_W && w.rect.y >= TITLE_H && w.rect.bottom() <= FOOT_Y
    };
    for w in f.scene.widgets.iter().filter(on_page) {
        widget(&mut p, f, w);
    }
    if layered {
        p.pop();
    }
    unsafe { rt.SetTransform(&Matrix3x2::identity()) };
    for w in f.scene.widgets.iter().filter(|w| !on_page(w)) {
        widget(&mut p, f, w);
    }
    if !f.dwm_border {
        p.border_round(Rect::new(0.0, 0.0, WIN_W, WIN_H), 0.0, palette::BORDER, 1.0);
    }
}

fn rail(p: &mut Painter, f: &Frame) {
    p.fill(Rect::new(0.0, 0.0, RAIL_W, WIN_H), palette::SPLASH_BG, 1.0);
    p.vline(RAIL_W - 0.5, 0.0, WIN_H, palette::BORDER);
    // `P-067` — the product's OWN scene, faint above Help (CG Control's is the one every rail drew).
    draw_art(p, &rail_art::display_list(rail_art::rail_art(f.product)));
    // The lockup: the mark, then the wordmark — `CG` heavy, the role light, tracked 0.3 em.
    for (geo, c) in &p.g.logo.clone() {
        let b = p.brush(*c, 1.0);
        unsafe { p.rt.FillGeometry(geo, &b, None) };
    }
    wordmark(p, f.role);
    // The steps.
    for (i, step) in f.scene.rail.iter().enumerate() {
        if i > 0 {
            let prev = &f.scene.rail[i - 1];
            let c = if prev.state == StepState::Done {
                palette::ACCENT_LINE
            } else {
                palette::SPLASH_RAIL
            };
            let b = p.brush(c, 1.0);
            unsafe {
                p.rt.DrawLine(
                    v(step.cx, prev.cy + 11.0),
                    v(step.cx, step.cy - 11.0),
                    &b,
                    1.5,
                    None,
                )
            };
        }
        rail_step(p, step, f.step_t[i]);
    }
}

fn wordmark(p: &mut Painter, role: &str) {
    let text = format!("CG {}", role.to_uppercase());
    let size = 13.0;
    let spacing = 0.3 * size;
    let Ok(layout) = (|| -> Result<IDWriteTextLayout> {
        let format = p.g.format(Style::Body, true)?;
        let wide: Vec<u16> = text.encode_utf16().collect();
        unsafe {
            let layout = p.g.dwrite.CreateTextLayout(&wide, &format, 400.0, 100.0)?;
            layout.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP)?;
            layout.SetFontWeight(
                DWRITE_FONT_WEIGHT_BOLD,
                DWRITE_TEXT_RANGE {
                    startPosition: 0,
                    length: 2,
                },
            )?;
            if let Ok(l1) = layout.cast::<IDWriteTextLayout1>() {
                l1.SetCharacterSpacing(
                    0.0,
                    spacing,
                    0.0,
                    DWRITE_TEXT_RANGE {
                        startPosition: 0,
                        length: wide.len() as u32,
                    },
                )?;
            }
            Ok(layout)
        }
    })() else {
        return;
    };
    let m = Gfx::metrics(&layout);
    // CSS centres the INK (`text-indent` matches the trailing spacing); so do we.
    let x = RAIL_W / 2.0 - (m.widthIncludingTrailingWhitespace - spacing) / 2.0;
    // Under the mark (34 + 36), a 10 px gap, a 13 px line: its centre at 86.5.
    let y = 86.5 - m.height / 2.0;
    let b = p.brush(palette::SPLASH_INK, 1.0);
    unsafe {
        p.rt.DrawTextLayout(v(x, y), &layout, &b, D2D1_DRAW_TEXT_OPTIONS_NONE)
    };
}

/// The rail's art: the product's own scene (`rail_art`), executed call for call. CG Control's list is
/// the very calls `0.11.3`'s `splash_scene` made (pinned in `rail_art`'s tests), so its rail is unchanged.
fn draw_art(p: &mut Painter, ops: &[ArtOp]) {
    for op in ops {
        match op {
            ArtOp::Layer(opacity) => p.layer(*opacity),
            ArtOp::Pop => p.pop(),
            ArtOp::StrokeRect {
                rect,
                radius,
                color,
                width,
            } => {
                let b = p.brush(*color, 1.0);
                unsafe {
                    p.rt.DrawRoundedRectangle(&rr(*rect, *radius), &b, *width, None)
                };
            }
            ArtOp::FillRect {
                rect,
                radius,
                color,
            } => {
                let b = p.brush(*color, 1.0);
                unsafe { p.rt.FillRoundedRectangle(&rr(*rect, *radius), &b) };
            }
            ArtOp::Line {
                from,
                to,
                color,
                width,
            } => {
                let b = p.brush(*color, 1.0);
                unsafe {
                    p.rt.DrawLine(v(from.0, from.1), v(to.0, to.1), &b, *width, None)
                };
            }
            ArtOp::StrokePath { cmds, color, width } => {
                if let Ok(geo) = p.g.geometry(cmds, false) {
                    let b = p.brush(*color, 1.0);
                    unsafe { p.rt.DrawGeometry(&geo, &b, *width, &p.g.round) };
                }
            }
            ArtOp::FillPath { cmds, color } => {
                if let Ok(geo) = p.g.geometry(cmds, true) {
                    let b = p.brush(*color, 1.0);
                    unsafe { p.rt.FillGeometry(&geo, &b, None) };
                }
            }
        }
    }
}

fn rail_step(p: &mut Painter, step: &RailStep, t: f32) {
    let (cx, cy) = (step.cx, step.cy);
    let r = 10.25;
    let (label_style, label_color) = match step.state {
        StepState::Pending => {
            p.circle(cx, cy, r, palette::SPLASH_BG, 1.0);
            p.ring(cx, cy, r, 1.5, palette::SPLASH_LINE, 1.0);
            (Style::Rail, palette::TEXT_MUTED)
        }
        StepState::Current => {
            // The splash's glow, around the step being taken.
            for (d, a) in [(6.0, 0.05), (4.0, 0.09), (2.0, 0.16)] {
                p.circle(cx, cy, r + d, palette::BRAND, a * palette::GLOW_ALPHA * 2.0);
            }
            p.circle(cx, cy, r, palette::SPLASH_BG, 1.0);
            p.ring(cx, cy, r, 1.5, palette::BRAND, 1.0);
            p.circle(cx, cy, 4.0, palette::BRAND, 1.0);
            (Style::RailCurrent, palette::TEXT)
        }
        StepState::Done => {
            let fill = ease_out(t * 2.0);
            p.circle(cx, cy, r + 0.75, palette::SPLASH_BG, 1.0);
            p.ring(cx, cy, r, 1.5, palette::BRAND, 1.0);
            p.circle(
                cx,
                cy,
                (r + 0.75) * (0.6 + 0.4 * fill),
                palette::BRAND,
                fill,
            );
            p.check(
                cx,
                cy,
                13.0,
                ease_out(((t - 0.25) / 0.75).clamp(0.0, 1.0)),
                palette::INK_ON_ACCENT,
                3.0,
            );
            (Style::Rail, palette::TEXT_SECONDARY)
        }
        StepState::Failed => {
            p.circle(cx, cy, r, palette::DANGER_BG, 1.0);
            p.ring(cx, cy, r, 1.5, palette::DANGER_TEXT, 1.0);
            p.icon(
                Icon::X,
                cx - 6.5,
                cy - 6.5,
                13.0,
                palette::DANGER_TEXT,
                1.0,
                3.0,
            );
            (Style::Rail, palette::DANGER_TEXT)
        }
    };
    p.text(
        Rect::new(cx + 25.0, cy - 10.0, 150.0, 20.0),
        step.label,
        label_style,
        label_color,
        1.0,
        DWRITE_TEXT_ALIGNMENT_LEADING,
        false,
    );
}

fn page_item(p: &mut Painter, f: &Frame, item: &Item) {
    match item {
        Item::Text {
            rect,
            text,
            style,
            color,
            right,
            wrap,
            ..
        } => {
            let align = if *right {
                DWRITE_TEXT_ALIGNMENT_TRAILING
            } else {
                DWRITE_TEXT_ALIGNMENT_LEADING
            };
            p.text(*rect, text, *style, *color, 1.0, align, *wrap);
        }
        Item::Icon { rect, icon, color } => p.icon(*icon, rect.x, rect.y, rect.w, *color, 1.0, 2.0),
        Item::Tile { rect } => {
            let px = (rect.w * p.scale).round() as u32;
            if let Some(png) = f.tile_png {
                if let Some(bmp) = p.g.tile(p.rt, p.dev, png, px) {
                    unsafe {
                        p.rt.DrawBitmap(
                            &bmp,
                            Some(&self::rect(*rect)),
                            1.0,
                            D2D1_BITMAP_INTERPOLATION_MODE_LINEAR,
                            None,
                        )
                    };
                }
            }
            // The safe-area ticks the splash draws around its monitor, around the app's own tile.
            let (l, t, r, b) = (
                rect.x - 8.0,
                rect.y - 8.0,
                rect.right() + 8.0,
                rect.bottom() + 8.0,
            );
            for (x, y, dx, dy) in [
                (l, t, 10.0, 10.0),
                (r, t, -10.0, 10.0),
                (l, b, 10.0, -10.0),
                (r, b, -10.0, -10.0),
            ] {
                let (sx, sy) = (p.snap(x), p.snap(y));
                p.hline(sx.min(sx + dx), sx.max(sx + dx), sy, palette::SPLASH_LINE);
                p.vline(sx, sy.min(sy + dy), sy.max(sy + dy), palette::SPLASH_LINE);
            }
        }
        Item::Callout { rect } => {
            p.fill_round(*rect, 6.0, palette::ACCENT_FILL, 1.0);
            p.border_round(*rect, 6.0, palette::ACCENT_LINE, 1.0);
        }
        Item::Field { rect } => {
            p.fill_round(*rect, 5.0, palette::FIELD_BG, 1.0);
            p.border_round(*rect, 5.0, palette::BORDER, 1.0);
        }
        Item::Bar { rect, fraction } => {
            p.fill_round(*rect, 2.0, palette::SPLASH_RAIL, 1.0);
            let w = rect.w * fraction.clamp(0.0, 1.0);
            if w > 0.5 {
                let filled = Rect::new(rect.x, rect.y, w, rect.h);
                // The splash's glow under its fill (`--r-splash-glow`, 14 px), in soft steps.
                for (d, a) in [(6.0, 0.03), (4.0, 0.06), (2.0, 0.12)] {
                    p.fill_round(
                        inflate(filled, d),
                        2.0 + d,
                        palette::BRAND,
                        a * palette::GLOW_ALPHA * 2.0,
                    );
                }
                unsafe {
                    let stops = [
                        D2D1_GRADIENT_STOP {
                            position: 0.0,
                            color: color(palette::BRAND_DEEP, 1.0),
                        },
                        D2D1_GRADIENT_STOP {
                            position: 1.0,
                            color: color(palette::BRAND, 1.0),
                        },
                    ];
                    if let Ok(coll) = p.rt.CreateGradientStopCollection(
                        &stops,
                        D2D1_GAMMA_2_2,
                        D2D1_EXTEND_MODE_CLAMP,
                    ) {
                        let props = D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES {
                            startPoint: v(rect.x, 0.0),
                            endPoint: v(rect.x + w, 0.0),
                        };
                        if let Ok(brush) = p.rt.CreateLinearGradientBrush(&props, None, &coll) {
                            p.rt.FillRoundedRectangle(&rr(filled, 2.0), &brush);
                        }
                    }
                }
            }
        }
        Item::Mark { rect, ok } => {
            let t = ease_out(f.mark_t);
            let (cx, cy) = (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0);
            let r = (rect.w / 2.0 - 0.75) * (0.85 + 0.15 * t);
            let (bg, line) = if *ok {
                (palette::OK_BG, palette::SUCCESS)
            } else {
                (palette::DANGER_BG, palette::DANGER_TEXT)
            };
            p.circle(cx, cy, r, bg, t);
            p.ring(cx, cy, r, 1.5, line, t);
            if *ok {
                p.check(
                    cx,
                    cy,
                    22.0,
                    ((f.mark_t - 0.3) / 0.7).clamp(0.0, 1.0),
                    palette::SUCCESS,
                    2.5,
                );
            } else {
                p.icon(
                    Icon::X,
                    cx - 11.0,
                    cy - 11.0,
                    22.0,
                    palette::DANGER_TEXT,
                    t,
                    2.5,
                );
            }
        }
    }
}

fn widget(p: &mut Painter, f: &Frame, w: &crate::layout::Widget) {
    let hover = if w.enabled { (f.hover)(w.id) } else { 0.0 };
    let pressed = w.enabled && f.pressed == Some(w.id);
    let a = if w.enabled { 1.0 } else { 0.45 };
    let focused = f.focus_visible && f.focus == Some(w.id) && w.enabled;
    let r = if pressed {
        Rect::new(w.rect.x, w.rect.y + 1.0, w.rect.w, w.rect.h)
    } else {
        w.rect
    };
    match w.kind {
        WidgetKind::Button(variant) => {
            let k = if pressed { 0.92 } else { 1.0 + 0.12 * hover };
            let (fill, line, ink, style) = match variant {
                Variant::Primary => (
                    Some(palette::brightness(palette::ACCENT_STRONG, k)),
                    palette::brightness(palette::ACCENT_STRONG, k),
                    palette::INK_ON_ACCENT,
                    Style::ButtonBold,
                ),
                Variant::Secondary => (
                    Some(palette::brightness(palette::SURFACE_RAISED, k)),
                    palette::brightness(palette::ACCENT, k),
                    palette::brightness(palette::ACCENT, k),
                    Style::Button,
                ),
                Variant::Ghost => (
                    (hover > 0.0)
                        .then(|| mix(palette::SURFACE_RAISED, palette::BORDER_SOFT, hover)),
                    palette::SURFACE_RAISED,
                    mix(palette::TEXT_MUTED, palette::TEXT, hover),
                    Style::Button,
                ),
            };
            if let Some(fill) = fill {
                p.fill_round(r, 4.0, fill, a);
            }
            if variant != Variant::Ghost {
                p.border_round(r, 4.0, line, a);
            }
            p.text(
                r,
                &w.label,
                style,
                ink,
                a,
                DWRITE_TEXT_ALIGNMENT_CENTER,
                false,
            );
            if focused {
                focus_ring(p, r, 4.0);
            }
        }
        WidgetKind::Checkbox(checked) => {
            let b = Rect::new(r.x, r.y + 3.0, 18.0, 18.0);
            if checked {
                let fill = mix(palette::ACCENT, palette::TOGGLE_ON_HOVER, hover);
                p.fill_round(b, 4.0, fill, a);
                p.check(b.x + 9.0, b.y + 9.0, 13.0, 1.0, palette::INK_ON_ACCENT, 3.0);
            } else {
                p.fill_round(
                    b,
                    4.0,
                    mix(palette::SURFACE_RAISED, palette::CONTROL_HOVER_BG, hover),
                    a,
                );
                p.border_round(
                    b,
                    4.0,
                    mix(palette::BORDER_STRONG, palette::ACCENT, hover),
                    a,
                );
            }
            p.text(
                Rect::new(r.x + 28.0, r.y + 2.0, r.w - 28.0, 20.0),
                &w.label,
                Style::Body,
                palette::TEXT,
                a,
                DWRITE_TEXT_ALIGNMENT_LEADING,
                false,
            );
            if focused {
                focus_ring(p, b, 4.0);
            }
        }
        WidgetKind::Link => {
            let ink = mix(palette::TEXT_MUTED, palette::TEXT, hover);
            p.icon(Icon::CircleHelp, r.x + 4.0, r.y + 4.0, 16.0, ink, a, 2.0);
            p.text(
                Rect::new(r.x + 28.0, r.y + 2.0, r.w - 28.0, 20.0),
                &w.label,
                Style::Body,
                ink,
                a,
                DWRITE_TEXT_ALIGNMENT_LEADING,
                false,
            );
            if focused {
                focus_ring(p, r, 4.0);
            }
        }
        WidgetKind::TextField {
            caret,
            all,
            refused,
        } => text_field(p, f, w, caret, all, refused, hover, a),
        WidgetKind::Radio(on) => {
            // A chip: the field's ground, the accent when chosen, a radio mark and the address.
            let (fill, line) = if on {
                (palette::ACCENT_FILL, palette::ACCENT)
            } else {
                (
                    mix(palette::FIELD_BG, palette::CONTROL_HOVER_BG, hover),
                    mix(palette::BORDER_STRONG, palette::ACCENT, hover),
                )
            };
            p.fill_round(r, 4.0, fill, a);
            p.border_round(r, 4.0, line, a);
            let (cx, cy) = (r.x + 16.0, r.y + r.h / 2.0);
            p.ring(
                cx,
                cy,
                6.5,
                1.5,
                if on {
                    palette::ACCENT
                } else {
                    palette::BORDER_STRONG
                },
                a,
            );
            if on {
                p.circle(cx, cy, 3.5, palette::ACCENT, a);
            }
            p.text(
                Rect::new(r.x + 30.0, r.y, r.w - 36.0, r.h),
                &w.label,
                Style::Body,
                palette::TEXT,
                a,
                DWRITE_TEXT_ALIGNMENT_LEADING,
                false,
            );
            if focused {
                focus_ring(p, r, 4.0);
            }
        }
        WidgetKind::TitleButton => {
            if hover > 0.0 || pressed {
                let bg = if pressed {
                    palette::BORDER_SOFT
                } else {
                    palette::SURFACE_RAISED
                };
                p.fill(w.rect, bg, if pressed { 1.0 } else { hover });
            }
            let icon = if w.id == WidgetId::Minimize {
                Icon::Minus
            } else {
                Icon::X
            };
            let ink = mix(palette::TEXT_MUTED, palette::TEXT, hover);
            p.icon(icon, w.rect.x + 15.0, w.rect.y + 12.0, 16.0, ink, a, 1.5);
        }
    }
}

/// `RELEASE-0111-01` Part A — one line of text (`.cg-field`): the field's ground and border — the accent
/// while it has the keyboard, caution ink when refused — the value or its placeholder, clipped to the
/// box and scrolled so the caret stays in it, and the caret (or the whole value, selected).
#[allow(clippy::too_many_arguments)]
fn text_field(
    p: &mut Painter,
    f: &Frame,
    w: &crate::layout::Widget,
    caret: usize,
    all: bool,
    refused: bool,
    hover: f32,
    a: f32,
) {
    let r = w.rect;
    let editing = f.focus == Some(w.id) && w.enabled;
    let line = if refused {
        palette::CAUTION_TEXT
    } else if editing {
        palette::ACCENT
    } else {
        mix(palette::BORDER, palette::BORDER_STRONG, hover)
    };
    p.fill_round(r, 4.0, palette::FIELD_BG, a);
    p.border_round(r, 4.0, line, a);
    let inner = Rect::new(r.x + 10.0, r.y + 1.0, r.w - 20.0, r.h - 2.0);
    let before: String = w.value.chars().take(caret).collect();
    let caret_x = if before.is_empty() {
        0.0
    } else {
        p.g.measure(&before, Style::Body, 4000.0).0
    };
    let shift = (caret_x - inner.w + 2.0).max(0.0);
    unsafe {
        p.rt.PushAxisAlignedClip(&rect(inner), D2D1_ANTIALIAS_MODE_ALIASED);
    }
    let x = inner.x - shift;
    if editing && all && !w.value.is_empty() {
        let width = p.g.measure(&w.value, Style::Body, 4000.0).0;
        p.fill(
            Rect::new(x - 1.0, r.y + 7.0, width + 2.0, r.h - 14.0),
            palette::ACCENT_LINE,
            a,
        );
    }
    let (text, ink) = if w.value.is_empty() {
        (w.placeholder.as_str(), palette::TEXT_MUTED)
    } else {
        (w.value.as_str(), palette::TEXT)
    };
    if !text.is_empty() {
        p.text(
            Rect::new(x, r.y, 4000.0, r.h),
            text,
            Style::Body,
            ink,
            a,
            DWRITE_TEXT_ALIGNMENT_LEADING,
            false,
        );
    }
    if editing && !(all && !w.value.is_empty()) {
        let cx = p.snap(x + caret_x);
        let b = p.brush(palette::TEXT, 1.0);
        unsafe {
            p.rt.DrawLine(
                v(cx, r.y + 8.0),
                v(cx, r.bottom() - 8.0),
                &b,
                p.hairline(),
                None,
            )
        };
    }
    unsafe {
        p.rt.PopAxisAlignedClip();
    }
    if editing && f.focus_visible {
        focus_ring(p, r, 4.0);
    }
}

/// `.cg-btn:focus-visible`: a 2 px ring in the accent, just outside the control's edge.
fn focus_ring(p: &mut Painter, r: Rect, radius: f32) {
    let b = p.brush(palette::ACCENT, 1.0);
    unsafe {
        p.rt.DrawRoundedRectangle(&rr(inflate(r, 1.0), radius + 1.0), &b, 2.0, None)
    };
}
