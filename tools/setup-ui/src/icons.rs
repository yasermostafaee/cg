//! The icons, as path data — the console's own set (lucide-react 1.21.0, the version this repo
//! locks), drawn with lucide's stroke: 2 on a 24-unit grid, round caps and joins. Circles, rects
//! and lines are written as the equivalent paths.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Icon {
    Check,
    X,
    Minus,
    CircleHelp,
    Folder,
    TriangleAlert,
    RefreshCw,
    Monitor,
    User,
    Users,
    Server,
    PenTool,
    Package,
}

/// A circle as four quarter arcs: left → bottom → right → top → left.
macro_rules! circle {
    ($cx:literal, $cy:literal, $r:literal) => {
        concat!(
            "M", $cx, " ", $cy, " m-", $r, " 0", " a", $r, " ", $r, " 0 0 0 ", $r, " ", $r, " a",
            $r, " ", $r, " 0 0 0 ", $r, " -", $r, " a", $r, " ", $r, " 0 0 0 -", $r, " -", $r,
            " a", $r, " ", $r, " 0 0 0 -", $r, " ", $r, " Z"
        )
    };
}

pub fn paths(icon: Icon) -> &'static [&'static str] {
    match icon {
        Icon::Check => &["M20 6 9 17l-5-5"],
        Icon::X => &["M18 6 6 18", "m6 6 12 12"],
        Icon::Minus => &["M5 12h14"],
        Icon::CircleHelp => &[circle!("12", "12", "10"), "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
        Icon::Folder => &[
            "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
        ],
        Icon::TriangleAlert => &[
            "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
            "M12 9v4",
            "M12 17h.01",
        ],
        Icon::RefreshCw => &[
            "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
            "M21 3v5h-5",
            "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
            "M8 16H3v5",
        ],
        Icon::Monitor => &["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M8 21h8", "M12 17v4"],
        Icon::User => &["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", circle!("12", "7", "4")],
        Icon::Users => &[
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M16 3.128a4 4 0 0 1 0 7.744",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            circle!("9", "7", "4"),
        ],
        Icon::Server => &[
            "M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
            "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z",
            "M6 6h.01",
            "M6 18h.01",
        ],
        Icon::PenTool => &[
            "M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z",
            "m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18",
            "m2.3 2.3 7.286 7.286",
            circle!("11", "11", "2"),
        ],
        Icon::Package => &[
            "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
            "M12 22V12",
            "M3.29 7 12 12 20.71 7",
            "m7.5 4.27 9 5.15",
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::svgpath::{parse, Cmd};

    #[test]
    fn every_icon_parses_into_drawable_paths() {
        for icon in [
            Icon::Check,
            Icon::X,
            Icon::Minus,
            Icon::CircleHelp,
            Icon::Folder,
            Icon::TriangleAlert,
            Icon::RefreshCw,
            Icon::Monitor,
            Icon::User,
            Icon::Users,
            Icon::Server,
            Icon::PenTool,
            Icon::Package,
        ] {
            for d in paths(icon) {
                let p = parse(d);
                assert!(p.len() >= 2, "{icon:?}: {d}");
                assert!(matches!(p[0], Cmd::Move(..)), "{icon:?}");
            }
        }
    }

    #[test]
    fn a_circle_closes_on_itself() {
        let p = parse(circle!("12", "12", "10"));
        assert_eq!(p[1], Cmd::Move(2.0, 12.0));
        assert!(
            matches!(p[p.len() - 2], Cmd::Arc(_, _, _, _, _, x, y) if (x - 2.0).abs() < 1e-4 && (y - 12.0).abs() < 1e-4)
        );
    }
}
