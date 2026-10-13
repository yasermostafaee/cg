//! `P-067` — the art at the foot of the step rail: each product's OWN, drawn faintly above Help in the
//! splash scene's three inks.
//!
//! - **CG Control** — its splash's playout scene, its instrument only (the three layer rows, the wires,
//!   the program monitor and its safe-area ticks), exactly as `0.11.3` drew it.
//! - **CG Designer** — its splash's artboard, its instrument only: the canvas grid, the motion path and
//!   the four keyframes on it (`apps/designer/index.html`'s scene). Until `0.11.3` its rail drew CG
//!   Control's scene, which is the fault `P-067` names.
//! - **CG Bridge** — it has no window and no splash of its own, so there is nothing to quote: its scene
//!   is its place between the other two — three consoles, each linked to the one service they all
//!   connect to (a light per link), and that service's one link on to the Playout's program monitor.
//!   Drawn in the playout scene's own vocabulary (outlines, bars, wires, the monitor's ticks), and lower
//!   in the frame than the others, because CG Bridge's rail has a fifth step (Playout).
//!
//! Pure data and a display list, so WHICH scene a product draws, and every coordinate of it, is tested
//! without a GPU (`tests`); `ui::gfx` only executes the list.

use crate::layout::{Rect, WIN_H};
use crate::palette::{self, Rgb};
use crate::product::ProductId;
use crate::svgpath::{self, Cmd, Xform};

/// Every scene is in its splash's own units: the `viewBox="0 0 360 150"` both splashes share.
pub const VIEW_W: f32 = 360.0;
pub const VIEW_H: f32 = 150.0;
/// Placed in the rail: 192 DIPs wide, 20 in from its left edge, the viewBox's foot 60 above the window's.
pub const ART_X: f32 = 20.0;
pub const ART_W: f32 = 192.0;
pub const ART_FOOT: f32 = 60.0;
/// Faint: the whole scene composed, then laid down at 40 %.
pub const OPACITY: f32 = 0.4;

/// The splash scene's three inks, and no others: outlines, fills, and wires (and the grid).
const LINE: Rgb = palette::SPLASH_LINE;
const BAR: Rgb = palette::SPLASH_SCENE_BAR;
const WIRE: Rgb = palette::SPLASH_RAIL;

/// Which scene a rail carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArtId {
    /// CG Control's splash: the playout scene.
    Playout,
    /// CG Designer's splash: the artboard.
    Artboard,
    /// CG Bridge: the consoles, the service, the Playout.
    Links,
}

/// One shape, in the scene's viewBox units. Outlines and lines are 1 unit wide (SVG's default stroke).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Shape {
    /// A rounded rectangle's outline (`<rect x y width height rx>`, stroked).
    Outline {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        r: f32,
    },
    /// A filled rounded rectangle.
    Bar {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        r: f32,
    },
    /// A straight line.
    Line { x0: f32, y0: f32, x1: f32, y1: f32 },
    /// A stroked path (round caps and joins), from SVG path data.
    Path { d: &'static str, width: f32 },
    /// A keyframe: the splash's `size` × `size` square at (x, y), turned 45° about its centre, filled.
    Keyframe { x: f32, y: f32, size: f32 },
}

pub struct Art {
    pub id: ArtId,
    /// In drawing order.
    pub shapes: &'static [(Shape, Rgb)],
}

const fn outline(x: f32, y: f32, w: f32, h: f32, r: f32) -> (Shape, Rgb) {
    (Shape::Outline { x, y, w, h, r }, LINE)
}
const fn bar(x: f32, y: f32, w: f32, h: f32, r: f32) -> (Shape, Rgb) {
    (Shape::Bar { x, y, w, h, r }, BAR)
}
const fn wire(x0: f32, y0: f32, x1: f32, y1: f32) -> (Shape, Rgb) {
    (Shape::Line { x0, y0, x1, y1 }, WIRE)
}
const fn keyframe(x: f32, y: f32, size: f32) -> (Shape, Rgb) {
    (Shape::Keyframe { x, y, size }, BAR)
}

/// CG Control: `apps/runtime/index.html`'s scene, in the order `0.11.3` drew it.
static PLAYOUT_SHAPES: [(Shape, Rgb); 17] = [
    // the stack: three layer rows, each with its bar
    outline(10.0, 22.0, 120.0, 30.0, 5.0),
    bar(22.0, 34.0, 62.0, 5.0, 2.5),
    outline(10.0, 64.0, 120.0, 30.0, 5.0),
    bar(22.0, 76.0, 46.0, 5.0, 2.5),
    outline(10.0, 106.0, 120.0, 30.0, 5.0),
    bar(22.0, 118.0, 54.0, 5.0, 2.5),
    // the wires
    wire(130.0, 37.0, 180.0, 37.0),
    wire(130.0, 79.0, 180.0, 79.0),
    // the program monitor, and its safe-area ticks (each `M x y v±4 h±4`, as its two strokes)
    outline(180.0, 20.0, 168.0, 94.0, 4.0),
    wire(190.0, 32.0, 190.0, 28.0),
    wire(190.0, 28.0, 194.0, 28.0),
    wire(338.0, 32.0, 338.0, 28.0),
    wire(338.0, 28.0, 334.0, 28.0),
    wire(190.0, 102.0, 190.0, 106.0),
    wire(190.0, 106.0, 194.0, 106.0),
    wire(338.0, 102.0, 338.0, 106.0),
    wire(338.0, 106.0, 334.0, 106.0),
];

/// CG Designer's motion path, as its splash draws it.
const MOTION_PATH: &str = "M24 74 C 66 74, 86 24, 126 24 S 188 88, 216 62 S 288 16, 336 28";

/// CG Designer: `apps/designer/index.html`'s scene — the canvas, the path, the keyframes on it.
static ARTBOARD_SHAPES: [(Shape, Rgb); 16] = [
    // the canvas
    wire(0.0, 30.0, 360.0, 30.0),
    wire(0.0, 60.0, 360.0, 60.0),
    wire(0.0, 90.0, 360.0, 90.0),
    wire(0.0, 120.0, 360.0, 120.0),
    wire(45.0, 0.0, 45.0, 150.0),
    wire(90.0, 0.0, 90.0, 150.0),
    wire(135.0, 0.0, 135.0, 150.0),
    wire(180.0, 0.0, 180.0, 150.0),
    wire(225.0, 0.0, 225.0, 150.0),
    wire(270.0, 0.0, 270.0, 150.0),
    wire(315.0, 0.0, 315.0, 150.0),
    // the motion path (the splash strokes it 2 wide), and the keyframes that land on it
    (
        Shape::Path {
            d: MOTION_PATH,
            width: 2.0,
        },
        LINE,
    ),
    keyframe(18.0, 68.0, 12.0),
    keyframe(120.0, 18.0, 12.0),
    keyframe(210.0, 56.0, 12.0),
    keyframe(330.0, 22.0, 12.0),
];

/// CG Bridge: its own, in the playout scene's vocabulary. Nothing above y 40, so it clears the fifth step.
static LINKS_SHAPES: [(Shape, Rgb); 25] = [
    // three consoles
    outline(10.0, 44.0, 74.0, 20.0, 4.0),
    bar(20.0, 51.5, 40.0, 5.0, 2.5),
    outline(10.0, 72.0, 74.0, 20.0, 4.0),
    bar(20.0, 79.5, 28.0, 5.0, 2.5),
    outline(10.0, 100.0, 74.0, 20.0, 4.0),
    bar(20.0, 107.5, 34.0, 5.0, 2.5),
    // each linked to the service
    wire(84.0, 54.0, 140.0, 54.0),
    wire(84.0, 82.0, 140.0, 82.0),
    wire(84.0, 110.0, 140.0, 110.0),
    // the service: one unit per link, a light on each
    outline(140.0, 40.0, 84.0, 84.0, 5.0),
    wire(140.0, 68.0, 224.0, 68.0),
    wire(140.0, 96.0, 224.0, 96.0),
    bar(202.0, 51.5, 10.0, 5.0, 2.5),
    bar(202.0, 79.5, 10.0, 5.0, 2.5),
    bar(202.0, 107.5, 10.0, 5.0, 2.5),
    // its one link on, to the Playout's program monitor and its safe-area ticks
    wire(224.0, 82.0, 270.0, 82.0),
    outline(270.0, 46.0, 80.0, 72.0, 4.0),
    wire(280.0, 58.0, 280.0, 54.0),
    wire(280.0, 54.0, 284.0, 54.0),
    wire(340.0, 58.0, 340.0, 54.0),
    wire(340.0, 54.0, 336.0, 54.0),
    wire(280.0, 106.0, 280.0, 110.0),
    wire(280.0, 110.0, 284.0, 110.0),
    wire(340.0, 106.0, 340.0, 110.0),
    wire(340.0, 110.0, 336.0, 110.0),
];

static PLAYOUT: Art = Art {
    id: ArtId::Playout,
    shapes: &PLAYOUT_SHAPES,
};
static ARTBOARD: Art = Art {
    id: ArtId::Artboard,
    shapes: &ARTBOARD_SHAPES,
};
static LINKS: Art = Art {
    id: ArtId::Links,
    shapes: &LINKS_SHAPES,
};

/// The art a product's rail carries.
pub fn rail_art(id: ProductId) -> &'static Art {
    match id {
        ProductId::Control => &PLAYOUT,
        ProductId::Designer => &ARTBOARD,
        ProductId::Bridge => &LINKS,
    }
}

/// One drawing call, in window DIPs. Every colour is drawn opaque inside the scene's one layer.
#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    Layer(f32),
    Pop,
    StrokeRect {
        rect: Rect,
        radius: f32,
        color: Rgb,
        width: f32,
    },
    FillRect {
        rect: Rect,
        radius: f32,
        color: Rgb,
    },
    Line {
        from: (f32, f32),
        to: (f32, f32),
        color: Rgb,
        width: f32,
    },
    StrokePath {
        cmds: Vec<Cmd>,
        color: Rgb,
        width: f32,
    },
    FillPath {
        cmds: Vec<Cmd>,
        color: Rgb,
    },
}

/// The scene, placed in the rail: one layer at `OPACITY`, its shapes in order.
pub fn display_list(art: &Art) -> Vec<Op> {
    let s = ART_W / VIEW_W;
    let (ox, oy) = (ART_X, WIN_H - ART_FOOT - VIEW_H * s);
    let at = |x: f32, y: f32| (ox + x * s, oy + y * s);
    let place = Xform::scale_translate(s, s, ox, oy);
    let mut ops = vec![Op::Layer(OPACITY)];
    for &(shape, color) in art.shapes {
        ops.push(match shape {
            Shape::Outline { x, y, w, h, r } => Op::StrokeRect {
                rect: Rect::new(ox + x * s, oy + y * s, w * s, h * s),
                radius: r * s,
                color,
                width: s,
            },
            Shape::Bar { x, y, w, h, r } => Op::FillRect {
                rect: Rect::new(ox + x * s, oy + y * s, w * s, h * s),
                radius: r * s,
                color,
            },
            Shape::Line { x0, y0, x1, y1 } => Op::Line {
                from: at(x0, y0),
                to: at(x1, y1),
                color,
                width: s,
            },
            Shape::Path { d, width } => Op::StrokePath {
                cmds: place.map(&svgpath::parse(d)),
                color,
                width: width * s,
            },
            Shape::Keyframe { x, y, size } => {
                let (cx, cy) = (x + size / 2.0, y + size / 2.0);
                let h = size * std::f32::consts::FRAC_1_SQRT_2;
                Op::FillPath {
                    cmds: place.map(&[
                        Cmd::Move(cx, cy - h),
                        Cmd::Line(cx + h, cy),
                        Cmd::Line(cx, cy + h),
                        Cmd::Line(cx - h, cy),
                        Cmd::Close,
                    ]),
                    color,
                }
            }
        });
    }
    ops.push(Op::Pop);
    ops
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::{build, Measure, Style, WidgetId, RAIL_W};
    use crate::model::{Facts, Model};
    use crate::product::{product, Config, MainFile};

    const RUNTIME_SPLASH: &str = include_str!("../../../apps/runtime/index.html");
    const DESIGNER_SPLASH: &str = include_str!("../../../apps/designer/index.html");
    const ALL: [ProductId; 3] = [ProductId::Control, ProductId::Designer, ProductId::Bridge];

    /// `0.11.3`'s `splash_scene`, transcribed call for call — the scene every rail drew until `P-067`,
    /// and the one CG Control's rail must go on drawing exactly (same calls, same arguments, same order).
    fn control_as_0_11_3_drew_it() -> Vec<Op> {
        let s: f32 = 192.0 / 360.0;
        let (ox, oy): (f32, f32) = (20.0, WIN_H - 60.0 - 150.0 * s);
        let at = |x: f32, y: f32| (ox + x * s, oy + y * s);
        let mut ops = vec![Op::Layer(0.4)];
        for (y, bw) in [(22.0, 62.0), (64.0, 46.0), (106.0, 54.0)] {
            ops.push(Op::StrokeRect {
                rect: Rect::new(ox + 10.0 * s, oy + y * s, 120.0 * s, 30.0 * s),
                radius: 5.0 * s,
                color: palette::SPLASH_LINE,
                width: s,
            });
            ops.push(Op::FillRect {
                rect: Rect::new(ox + 22.0 * s, oy + (y + 12.0) * s, bw * s, 5.0 * s),
                radius: 2.5 * s,
                color: palette::SPLASH_SCENE_BAR,
            });
        }
        for y in [37.0, 79.0] {
            ops.push(Op::Line {
                from: at(130.0, y),
                to: at(180.0, y),
                color: palette::SPLASH_RAIL,
                width: s,
            });
        }
        ops.push(Op::StrokeRect {
            rect: Rect::new(ox + 180.0 * s, oy + 20.0 * s, 168.0 * s, 94.0 * s),
            radius: 4.0 * s,
            color: palette::SPLASH_LINE,
            width: s,
        });
        for (x, y, dx, dy) in [
            (190.0, 32.0, 4.0, -4.0),
            (338.0, 32.0, -4.0, -4.0),
            (190.0, 102.0, 4.0, 4.0),
            (338.0, 102.0, -4.0, 4.0),
        ] {
            ops.push(Op::Line {
                from: at(x, y),
                to: at(x, y + dy),
                color: palette::SPLASH_RAIL,
                width: s,
            });
            ops.push(Op::Line {
                from: at(x, y + dy),
                to: at(x + dx, y + dy),
                color: palette::SPLASH_RAIL,
                width: s,
            });
        }
        ops.push(Op::Pop);
        ops
    }

    #[test]
    fn each_product_draws_its_own_scene() {
        assert_eq!(rail_art(ProductId::Control).id, ArtId::Playout);
        assert_eq!(rail_art(ProductId::Designer).id, ArtId::Artboard);
        assert_eq!(rail_art(ProductId::Bridge).id, ArtId::Links);
        // Not one shape of CG Control's scene in another product's: `0.11.3`'s fault (CG Designer's
        // rail drawing CG Control's scene) fails here, whole or in part.
        let control = rail_art(ProductId::Control);
        for other in [ProductId::Designer, ProductId::Bridge] {
            for shape in rail_art(other).shapes {
                assert!(
                    !control.shapes.contains(shape),
                    "{other:?} draws CG Control's {shape:?}"
                );
            }
            assert_ne!(display_list(rail_art(other)), display_list(control));
        }
        assert_ne!(
            display_list(rail_art(ProductId::Designer)),
            display_list(rail_art(ProductId::Bridge))
        );
    }

    #[test]
    fn cg_control_keeps_the_scene_0_11_3_drew() {
        assert_eq!(
            display_list(rail_art(ProductId::Control)),
            control_as_0_11_3_drew_it()
        );
    }

    // ── the splashes' own markup ─────────────────────────────────────────────────────────────

    /// `<svg class="cg-splash__scene" …>` … `</svg>`.
    fn scene(html: &str) -> &str {
        let start = html
            .find("<svg class=\"cg-splash__scene\"")
            .expect("the splash has its scene");
        let end = start + html[start..].find("</svg>").expect("the scene ends");
        &html[start..end]
    }

    /// Every `<g class="{class}">` … `</g>` in the scene, joined.
    fn groups(svg: &str, class: &str) -> String {
        let open = format!("<g class=\"{class}\">");
        let found: Vec<&str> = svg
            .match_indices(&open)
            .map(|(i, _)| &svg[i..i + svg[i..].find("</g>").expect("the group ends")])
            .collect();
        assert!(!found.is_empty(), "the scene has no <g class=\"{class}\">");
        found.join("\n")
    }

    /// Every `<{name} …>` tag's attributes.
    fn tags<'a>(svg: &'a str, name: &str) -> Vec<&'a str> {
        svg.split(&format!("<{name}"))
            .skip(1)
            .map(|t| &t[..t.find('>').expect("the tag closes")])
            .collect()
    }

    fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
        let key = format!("{name}=\"");
        let at = tag
            .match_indices(&key)
            .map(|(i, _)| i)
            .find(|&i| i > 0 && tag.as_bytes()[i - 1].is_ascii_whitespace())?;
        let v = &tag[at + key.len()..];
        Some(&v[..v.find('"')?])
    }

    fn num(tag: &str, name: &str) -> f32 {
        attr(tag, name)
            .unwrap_or_else(|| panic!("no {name} in <{tag}>"))
            .parse()
            .unwrap_or_else(|_| panic!("{name} in <{tag}> is not a number"))
    }

    fn rect_of(tag: &str) -> Shape {
        Shape::Outline {
            x: num(tag, "x"),
            y: num(tag, "y"),
            w: num(tag, "width"),
            h: num(tag, "height"),
            r: num(tag, "rx"),
        }
    }

    fn as_bar(s: Shape) -> Shape {
        match s {
            Shape::Outline { x, y, w, h, r } => Shape::Bar { x, y, w, h, r },
            other => other,
        }
    }

    /// `<line>`s, and every segment of the move/line `<path>`s (the monitor's ticks).
    fn segments(svg: &str) -> Vec<Shape> {
        let mut out: Vec<Shape> = tags(svg, "line")
            .iter()
            .map(|t| Shape::Line {
                x0: num(t, "x1"),
                y0: num(t, "y1"),
                x1: num(t, "x2"),
                y1: num(t, "y2"),
            })
            .collect();
        for t in tags(svg, "path") {
            let cmds = svgpath::parse(attr(t, "d").expect("a path has d"));
            let mut at = (0.0, 0.0);
            for c in cmds {
                match c {
                    Cmd::Move(x, y) => at = (x, y),
                    Cmd::Line(x, y) => {
                        out.push(Shape::Line {
                            x0: at.0,
                            y0: at.1,
                            x1: x,
                            y1: y,
                        });
                        at = (x, y);
                    }
                    other => panic!("a wire path is moves and lines only: {other:?}"),
                }
            }
        }
        out
    }

    /// The art is exactly `want` — each shape once, none missing, none added — in `want`'s inks.
    fn is_exactly(art: &Art, want: &[(Shape, Rgb)]) {
        assert_eq!(art.shapes.len(), want.len(), "{:?}: shape count", art.id);
        for w in want {
            assert_eq!(
                art.shapes.iter().filter(|s| *s == w).count(),
                1,
                "{:?} must draw {w:?} once",
                art.id
            );
        }
    }

    #[test]
    fn cg_controls_scene_is_its_splashs_instrument() {
        let svg = scene(RUNTIME_SPLASH);
        let mut want: Vec<(Shape, Rgb)> = Vec::new();
        // `.row rect, .mon { stroke: --r-splash-line }`, `.rowbar rect { fill: --r-splash-scene-bar }`,
        // `.wire line, .wire path { stroke: --r-splash-rail }`.
        want.extend(
            tags(&groups(svg, "row"), "rect")
                .iter()
                .map(|t| (rect_of(t), LINE)),
        );
        want.extend(
            tags(&groups(svg, "rowbar"), "rect")
                .iter()
                .map(|t| (as_bar(rect_of(t)), BAR)),
        );
        want.extend(
            segments(&groups(svg, "wire"))
                .into_iter()
                .map(|l| (l, WIRE)),
        );
        let mon: Vec<&str> = tags(svg, "rect")
            .into_iter()
            .filter(|t| attr(t, "class") == Some("mon"))
            .collect();
        assert_eq!(mon.len(), 1, "one program monitor");
        want.push((rect_of(mon[0]), LINE));
        is_exactly(rail_art(ProductId::Control), &want);
    }

    #[test]
    fn cg_designers_scene_is_its_splashs_artboard() {
        let svg = scene(DESIGNER_SPLASH);
        let mut want: Vec<(Shape, Rgb)> = Vec::new();
        want.extend(
            segments(&groups(svg, "grid"))
                .into_iter()
                .map(|l| (l, WIRE)),
        );
        let path: Vec<&str> = tags(svg, "path")
            .into_iter()
            .filter(|t| attr(t, "class") == Some("path"))
            .collect();
        assert_eq!(path.len(), 1, "one motion path");
        assert_eq!(
            attr(path[0], "d"),
            Some(MOTION_PATH),
            "the motion path is the splash's"
        );
        want.push((
            Shape::Path {
                d: MOTION_PATH,
                width: 2.0,
            },
            LINE,
        ));
        let kfs: Vec<&str> = tags(svg, "rect")
            .into_iter()
            .filter(|t| attr(t, "class").is_some_and(|c| c.starts_with("kf ")))
            .collect();
        assert_eq!(kfs.len(), 4, "four keyframes");
        for t in kfs {
            assert_eq!(num(t, "width"), num(t, "height"), "a keyframe is square");
            want.push((
                Shape::Keyframe {
                    x: num(t, "x"),
                    y: num(t, "y"),
                    size: num(t, "width"),
                },
                BAR,
            ));
        }
        assert!(
            DESIGNER_SPLASH.contains("transform: rotate(45deg) scale(1);"),
            "the splash's keyframes rest turned 45°"
        );
        is_exactly(rail_art(ProductId::Designer), &want);
    }

    #[test]
    fn every_ink_is_the_splash_scenes_own() {
        for id in ALL {
            for (shape, ink) in rail_art(id).shapes {
                assert!(
                    [LINE, BAR, WIRE].contains(ink),
                    "{id:?}: {shape:?} in a new colour"
                );
            }
        }
    }

    // ── the rail ─────────────────────────────────────────────────────────────────────────────

    struct Fake;
    impl Measure for Fake {
        fn measure(&self, text: &str, style: Style, _max_w: f32) -> (f32, f32) {
            (
                text.chars().count() as f32 * style.size() * 0.55,
                style.size() * 1.35,
            )
        }
    }

    /// Every point the list draws, with each stroke's half width: (left, top, right, bottom).
    fn bounds(ops: &[Op]) -> (f32, f32, f32, f32) {
        let mut b = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        let mut add = |x: f32, y: f32, pad: f32| {
            b = (
                b.0.min(x - pad),
                b.1.min(y - pad),
                b.2.max(x + pad),
                b.3.max(y + pad),
            );
        };
        let points = |cmds: &[Cmd]| -> Vec<(f32, f32)> {
            cmds.iter()
                .flat_map(|c| match *c {
                    Cmd::Move(x, y) | Cmd::Line(x, y) => vec![(x, y)],
                    Cmd::Cubic(x1, y1, x2, y2, x, y) => vec![(x1, y1), (x2, y2), (x, y)],
                    Cmd::Quad(x1, y1, x, y) => vec![(x1, y1), (x, y)],
                    Cmd::Arc(.., x, y) => vec![(x, y)],
                    Cmd::Close => vec![],
                })
                .collect()
        };
        for op in ops {
            match op {
                Op::StrokeRect { rect, width, .. } => {
                    add(rect.x, rect.y, width / 2.0);
                    add(rect.right(), rect.bottom(), width / 2.0);
                }
                Op::FillRect { rect, .. } => {
                    add(rect.x, rect.y, 0.0);
                    add(rect.right(), rect.bottom(), 0.0);
                }
                Op::Line {
                    from, to, width, ..
                } => {
                    add(from.0, from.1, width / 2.0);
                    add(to.0, to.1, width / 2.0);
                }
                Op::StrokePath { cmds, width, .. } => {
                    for (x, y) in points(cmds) {
                        add(x, y, width / 2.0);
                    }
                }
                Op::FillPath { cmds, .. } => {
                    for (x, y) in points(cmds) {
                        add(x, y, 0.0);
                    }
                }
                Op::Layer(_) | Op::Pop => {}
            }
        }
        b
    }

    #[test]
    fn every_scene_sits_in_the_rails_foot_clear_of_the_steps_and_help() {
        for id in ALL {
            let config = Config {
                product: id,
                version: "0.11.4".into(),
                engine_name: "e.exe".into(),
                install_bytes: 1,
                main_files: vec![MainFile {
                    path: "x.exe".into(),
                    bytes: 1,
                }],
            };
            // With the guide bundled, so Help is shown.
            let m = Model::new(product(id), config, Facts::default(), None, true);
            let scene = build(&m, &Fake);
            let last = scene.rail.last().expect("the rail has steps");
            let help = scene.widget(WidgetId::Help).expect("Help is shown").rect;
            let (l, t, r, b) = bounds(&display_list(rail_art(id)));
            assert!(
                l >= 0.0 && r <= RAIL_W,
                "{id:?}: inside the rail ({l}..{r})"
            );
            // The last step's circle (11 DIPs in radius), then a clear 16-DIP gap. CG Control's scene
            // under CG Bridge's five steps, as `0.11.3` drew it, left about 10.
            assert!(
                t >= last.cy + 11.0 + 16.0,
                "{id:?}: the scene's top {t} reaches the last step (centre {})",
                last.cy
            );
            assert!(
                b <= help.y - 8.0,
                "{id:?}: the scene's foot {b} reaches Help ({})",
                help.y
            );
        }
    }
}
