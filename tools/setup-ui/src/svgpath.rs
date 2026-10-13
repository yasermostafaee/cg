//! SVG path data → absolute drawing commands.
//!
//! The setup window draws its vector art the way the browser draws the splash and the sign-in
//! card: from path data. The APASAI mark is read from `apps/runtime/brand/apasai-logo.svg` itself
//! (compiled in), and the icons are the console's lucide paths, so nothing is re-drawn by hand and
//! nothing is a bitmap that blurs at 150 % or 200 %.

/// One absolute command, in the path's own coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Cmd {
    Move(f32, f32),
    Line(f32, f32),
    Cubic(f32, f32, f32, f32, f32, f32),
    Quad(f32, f32, f32, f32),
    /// rx, ry, x-axis rotation (degrees), large arc, sweep, end x, end y
    Arc(f32, f32, f32, bool, bool, f32, f32),
    Close,
}

/// A 2×3 affine transform: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Xform {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl Xform {
    pub const IDENTITY: Xform = Xform {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        e: 0.0,
        f: 0.0,
    };

    pub fn scale_translate(sx: f32, sy: f32, tx: f32, ty: f32) -> Xform {
        Xform {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            e: tx,
            f: ty,
        }
    }

    /// `self` applied AFTER `inner`.
    pub fn then(self, inner: Xform) -> Xform {
        Xform {
            a: self.a * inner.a + self.c * inner.b,
            b: self.b * inner.a + self.d * inner.b,
            c: self.a * inner.c + self.c * inner.d,
            d: self.b * inner.c + self.d * inner.d,
            e: self.a * inner.e + self.c * inner.f + self.e,
            f: self.b * inner.e + self.d * inner.f + self.f,
        }
    }

    pub fn apply(&self, x: f32, y: f32) -> (f32, f32) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    fn det(&self) -> f32 {
        self.a * self.d - self.b * self.c
    }

    /// Transform commands. Arcs are only ever drawn under uniform scale (the lucide icons), so a
    /// radius scales by √|det| and a mirrored transform flips the sweep.
    pub fn map(&self, cmds: &[Cmd]) -> Vec<Cmd> {
        let s = self.det().abs().sqrt();
        let mirror = self.det() < 0.0;
        cmds.iter()
            .map(|c| match *c {
                Cmd::Move(x, y) => {
                    let (x, y) = self.apply(x, y);
                    Cmd::Move(x, y)
                }
                Cmd::Line(x, y) => {
                    let (x, y) = self.apply(x, y);
                    Cmd::Line(x, y)
                }
                Cmd::Cubic(x1, y1, x2, y2, x, y) => {
                    let (x1, y1) = self.apply(x1, y1);
                    let (x2, y2) = self.apply(x2, y2);
                    let (x, y) = self.apply(x, y);
                    Cmd::Cubic(x1, y1, x2, y2, x, y)
                }
                Cmd::Quad(x1, y1, x, y) => {
                    let (x1, y1) = self.apply(x1, y1);
                    let (x, y) = self.apply(x, y);
                    Cmd::Quad(x1, y1, x, y)
                }
                Cmd::Arc(rx, ry, rot, large, sweep, x, y) => {
                    let (x, y) = self.apply(x, y);
                    Cmd::Arc(rx * s, ry * s, rot, large, sweep != mirror, x, y)
                }
                Cmd::Close => Cmd::Close,
            })
            .collect()
    }
}

struct Lexer<'a> {
    s: &'a [u8],
    i: usize,
}

impl<'a> Lexer<'a> {
    fn skip(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\r' | b'\n' | b',')
        {
            self.i += 1;
        }
    }
    fn command(&mut self) -> Option<u8> {
        self.skip();
        let c = *self.s.get(self.i)?;
        if c.is_ascii_alphabetic() {
            self.i += 1;
            Some(c)
        } else {
            None
        }
    }
    fn at_number(&mut self) -> bool {
        self.skip();
        matches!(self.s.get(self.i), Some(c) if c.is_ascii_digit() || matches!(c, b'-' | b'+' | b'.'))
    }
    fn number(&mut self) -> Option<f32> {
        self.skip();
        let start = self.i;
        let s = self.s;
        if matches!(s.get(self.i), Some(b'-' | b'+')) {
            self.i += 1;
        }
        let mut dot = false;
        while let Some(&c) = s.get(self.i) {
            if c.is_ascii_digit() {
                self.i += 1;
            } else if c == b'.' && !dot {
                dot = true;
                self.i += 1;
            } else {
                break;
            }
        }
        if matches!(s.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(s.get(self.i), Some(b'-' | b'+')) {
                self.i += 1;
            }
            while matches!(s.get(self.i), Some(c) if c.is_ascii_digit()) {
                self.i += 1;
            }
        }
        std::str::from_utf8(&s[start..self.i]).ok()?.parse().ok()
    }
    /// An arc flag: a single `0` or `1`, which SVG lets run into the next number (`a2 2 0 012 2`).
    fn flag(&mut self) -> Option<bool> {
        self.skip();
        let c = *self.s.get(self.i)?;
        self.i += 1;
        match c {
            b'0' => Some(false),
            b'1' => Some(true),
            _ => None,
        }
    }
}

/// Parse path data into absolute commands. Unknown or malformed input ends the path where it is.
pub fn parse(d: &str) -> Vec<Cmd> {
    let mut lx = Lexer {
        s: d.as_bytes(),
        i: 0,
    };
    let mut out = Vec::new();
    let (mut cx, mut cy) = (0.0f32, 0.0f32);
    let (mut sx, mut sy) = (0.0f32, 0.0f32);
    // The last control point, for S/s and T/t.
    let mut last_cubic: Option<(f32, f32)> = None;
    let mut last_quad: Option<(f32, f32)> = None;
    let mut cmd = b'M';
    loop {
        if let Some(c) = lx.command() {
            cmd = c;
        } else if !lx.at_number() {
            break;
        }
        let rel = cmd.is_ascii_lowercase();
        let (ox, oy) = if rel { (cx, cy) } else { (0.0, 0.0) };
        match cmd.to_ascii_uppercase() {
            b'M' => {
                let (Some(x), Some(y)) = (lx.number(), lx.number()) else {
                    break;
                };
                cx = ox + x;
                cy = oy + y;
                sx = cx;
                sy = cy;
                out.push(Cmd::Move(cx, cy));
                // Further pairs after a moveto are linetos.
                cmd = if rel { b'l' } else { b'L' };
                last_cubic = None;
                last_quad = None;
            }
            b'L' => {
                let (Some(x), Some(y)) = (lx.number(), lx.number()) else {
                    break;
                };
                cx = ox + x;
                cy = oy + y;
                out.push(Cmd::Line(cx, cy));
                last_cubic = None;
                last_quad = None;
            }
            b'H' => {
                let Some(x) = lx.number() else { break };
                cx = ox + x;
                out.push(Cmd::Line(cx, cy));
                last_cubic = None;
                last_quad = None;
            }
            b'V' => {
                let Some(y) = lx.number() else { break };
                cy = oy + y;
                out.push(Cmd::Line(cx, cy));
                last_cubic = None;
                last_quad = None;
            }
            b'C' => {
                let v: Vec<f32> = (0..6).filter_map(|_| lx.number()).collect();
                if v.len() < 6 {
                    break;
                }
                let (x1, y1, x2, y2) = (ox + v[0], oy + v[1], ox + v[2], oy + v[3]);
                cx = ox + v[4];
                cy = oy + v[5];
                out.push(Cmd::Cubic(x1, y1, x2, y2, cx, cy));
                last_cubic = Some((x2, y2));
                last_quad = None;
            }
            b'S' => {
                let v: Vec<f32> = (0..4).filter_map(|_| lx.number()).collect();
                if v.len() < 4 {
                    break;
                }
                let (x1, y1) = match last_cubic {
                    Some((px, py)) => (2.0 * cx - px, 2.0 * cy - py),
                    None => (cx, cy),
                };
                let (x2, y2) = (ox + v[0], oy + v[1]);
                cx = ox + v[2];
                cy = oy + v[3];
                out.push(Cmd::Cubic(x1, y1, x2, y2, cx, cy));
                last_cubic = Some((x2, y2));
                last_quad = None;
            }
            b'Q' => {
                let v: Vec<f32> = (0..4).filter_map(|_| lx.number()).collect();
                if v.len() < 4 {
                    break;
                }
                let (x1, y1) = (ox + v[0], oy + v[1]);
                cx = ox + v[2];
                cy = oy + v[3];
                out.push(Cmd::Quad(x1, y1, cx, cy));
                last_quad = Some((x1, y1));
                last_cubic = None;
            }
            b'T' => {
                let (Some(x), Some(y)) = (lx.number(), lx.number()) else {
                    break;
                };
                let (x1, y1) = match last_quad {
                    Some((px, py)) => (2.0 * cx - px, 2.0 * cy - py),
                    None => (cx, cy),
                };
                cx = ox + x;
                cy = oy + y;
                out.push(Cmd::Quad(x1, y1, cx, cy));
                last_quad = Some((x1, y1));
                last_cubic = None;
            }
            b'A' => {
                let (Some(rx), Some(ry), Some(rot)) = (lx.number(), lx.number(), lx.number())
                else {
                    break;
                };
                let (Some(large), Some(sweep)) = (lx.flag(), lx.flag()) else {
                    break;
                };
                let (Some(x), Some(y)) = (lx.number(), lx.number()) else {
                    break;
                };
                cx = ox + x;
                cy = oy + y;
                out.push(Cmd::Arc(rx.abs(), ry.abs(), rot, large, sweep, cx, cy));
                last_cubic = None;
                last_quad = None;
            }
            b'Z' => {
                out.push(Cmd::Close);
                cx = sx;
                cy = sy;
                last_cubic = None;
                last_quad = None;
                // `z` takes no numbers: the next token must be a command.
                if lx.command().map(|c| cmd = c).is_none() {
                    break;
                }
                continue;
            }
            _ => break,
        }
    }
    out
}

/// The length of a path made only of moves and lines (the check mark's draw-in).
pub fn polyline_length(cmds: &[Cmd]) -> f32 {
    let mut len = 0.0;
    let mut at = (0.0f32, 0.0f32);
    for c in cmds {
        match *c {
            Cmd::Move(x, y) => at = (x, y),
            Cmd::Line(x, y) => {
                len += ((x - at.0).powi(2) + (y - at.1).powi(2)).sqrt();
                at = (x, y);
            }
            _ => {}
        }
    }
    len
}

/// The first `fraction` of a move/line path, by length.
pub fn polyline_prefix(cmds: &[Cmd], fraction: f32) -> Vec<Cmd> {
    let total = polyline_length(cmds);
    let mut left = total * fraction.clamp(0.0, 1.0);
    let mut out = Vec::new();
    let mut at = (0.0f32, 0.0f32);
    for c in cmds {
        match *c {
            Cmd::Move(x, y) => {
                at = (x, y);
                out.push(*c);
            }
            Cmd::Line(x, y) => {
                let seg = ((x - at.0).powi(2) + (y - at.1).powi(2)).sqrt();
                if left >= seg {
                    out.push(*c);
                    left -= seg;
                    at = (x, y);
                } else {
                    if seg > 0.0 && left > 0.0 {
                        let t = left / seg;
                        out.push(Cmd::Line(at.0 + (x - at.0) * t, at.1 + (y - at.1) * t));
                    }
                    break;
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lucide_check_is_one_move_and_two_lines() {
        let p = parse("M20 6 9 17l-5-5");
        assert_eq!(
            p,
            vec![
                Cmd::Move(20.0, 6.0),
                Cmd::Line(9.0, 17.0),
                Cmd::Line(4.0, 12.0)
            ]
        );
    }

    #[test]
    fn arcs_with_run_together_flags_parse() {
        // lucide's folder: `a2 2 0 0 0 2-2` and run-together forms such as `a2 2 0 012 2`.
        let p = parse("M4 3a2 2 0 0 0-2 2a2 2 0 012 2z");
        assert_eq!(p[1], Cmd::Arc(2.0, 2.0, 0.0, false, false, 2.0, 5.0));
        assert_eq!(p[2], Cmd::Arc(2.0, 2.0, 0.0, false, true, 4.0, 7.0));
        assert_eq!(p[3], Cmd::Close);
    }

    #[test]
    fn h_v_s_and_close_return_to_the_subpath_start() {
        let p = parse("M1 1h4v4H1zm2 2l1 1");
        assert_eq!(p[1], Cmd::Line(5.0, 1.0));
        assert_eq!(p[2], Cmd::Line(5.0, 5.0));
        assert_eq!(p[3], Cmd::Line(1.0, 5.0));
        assert_eq!(p[4], Cmd::Close);
        assert_eq!(
            p[5],
            Cmd::Move(3.0, 3.0),
            "m after z is relative to the subpath start"
        );
        assert_eq!(p[6], Cmd::Line(4.0, 4.0));
        let s = parse("M0 0C1 1 2 1 3 0S5 -1 6 0");
        assert_eq!(s[2], Cmd::Cubic(4.0, -1.0, 5.0, -1.0, 6.0, 0.0));
    }

    #[test]
    fn the_logos_relative_curves_parse_whole() {
        let logo = include_str!("../../../apps/runtime/brand/apasai-logo.svg");
        let ds: Vec<&str> = logo
            .split(" d=\"")
            .skip(1)
            .map(|s| s.split('"').next().unwrap())
            .collect();
        assert_eq!(
            ds.len(),
            12,
            "the mark is 12 paths: 1 swoosh, the arc and its 3 dots, 7 bars"
        );
        for d in ds {
            let p = parse(d);
            assert!(matches!(p.first(), Some(Cmd::Move(..))));
            assert_eq!(
                p.last(),
                Some(&Cmd::Close),
                "every path closes: {}",
                &d[..20]
            );
        }
    }

    #[test]
    fn a_mirrored_transform_flips_an_arcs_sweep() {
        let x = Xform::scale_translate(2.0, -2.0, 0.0, 0.0);
        let m = x.map(&[Cmd::Arc(1.0, 1.0, 0.0, false, true, 1.0, 1.0)]);
        assert_eq!(m[0], Cmd::Arc(2.0, 2.0, 0.0, false, false, 2.0, -2.0));
    }

    #[test]
    fn a_polyline_prefix_draws_in_by_length() {
        let p = parse("M0 0 10 0 10 10");
        assert_eq!(polyline_length(&p), 20.0);
        assert_eq!(
            polyline_prefix(&p, 0.25),
            vec![Cmd::Move(0.0, 0.0), Cmd::Line(5.0, 0.0)]
        );
        assert_eq!(
            polyline_prefix(&p, 0.75).last(),
            Some(&Cmd::Line(10.0, 5.0))
        );
        assert_eq!(polyline_prefix(&p, 1.0), p);
    }
}
