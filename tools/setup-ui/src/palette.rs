//! The setup window's colours. NONE IS NEW: each is a console token from
//! `apps/runtime/src/renderer/theme.ts` (`cssVars`, named beside it) or one of the splash's two
//! brand constants (`apps/runtime/index.html`, `.cg-splash`). The splash ground and its instrument
//! are the rail's; the sign-in card's surface, foot and controls are the page's — so installer,
//! splash and sign-in read as one product.
//!
//! `tests` pins every value against `theme.ts` and `index.html` themselves, so a palette move in the
//! console reaches this file as a red test rather than as an installer that quietly drifted.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

const fn rgb(v: u32) -> Rgb {
    Rgb((v >> 16) as u8, (v >> 8) as u8, v as u8)
}

// ── the splash: the rail's ground and instrument ─────────────────────────────────────────────
/// `--r-splash-bg`
pub const SPLASH_BG: Rgb = rgb(0x1a212d);
/// `--r-splash-line`
pub const SPLASH_LINE: Rgb = rgb(0x3d4959);
/// `--r-splash-ink`
pub const SPLASH_INK: Rgb = rgb(0xe8edf4);
/// `--r-splash-readout`
pub const SPLASH_READOUT: Rgb = rgb(0x8b97a6);
/// `--r-splash-rail`
pub const SPLASH_RAIL: Rgb = rgb(0x2c3644);
/// `--r-splash-scene-bar`
pub const SPLASH_SCENE_BAR: Rgb = rgb(0x3a4557);
/// `--r-splash-logo-bars`
pub const LOGO_BARS: Rgb = rgb(0xeef3f9);
/// `--r-splash-logo-swoosh`
pub const LOGO_SWOOSH: Rgb = rgb(0x5c6a7c);
/// `--cg-brand` — APASAI's exact brand blue (the splash's own constant; never adjusted).
pub const BRAND: Rgb = rgb(0x00aeef);
/// `--cg-brand-deep`
pub const BRAND_DEEP: Rgb = rgb(0x0090c9);
/// `--r-splash-glow` is the brand blue at 0.5; the glow is drawn from `BRAND` at that alpha.
pub const GLOW_ALPHA: f32 = 0.5;

// ── the console: the page, its foot and its controls ────────────────────────────────────────
/// `--r-surface`
pub const SURFACE: Rgb = rgb(0x141b25);
/// `--r-surface-raised`
pub const SURFACE_RAISED: Rgb = rgb(0x1b2532);
/// `--r-field-bg`
pub const FIELD_BG: Rgb = rgb(0x0e151e);
/// `--r-border`
pub const BORDER: Rgb = rgb(0x2d3a49);
/// `--r-border-soft`
pub const BORDER_SOFT: Rgb = rgb(0x24303d);
/// `--r-border-strong`
pub const BORDER_STRONG: Rgb = rgb(0x4b5563);
/// `--r-text`
pub const TEXT: Rgb = rgb(0xeef3f9);
/// `--r-text-secondary`
pub const TEXT_SECONDARY: Rgb = rgb(0xbbc8d7);
/// `--r-text-muted`
pub const TEXT_MUTED: Rgb = rgb(0x8e9eaf);
/// `--r-accent`
pub const ACCENT: Rgb = rgb(0x74cdf6);
/// `--r-accent-strong` — the primary button.
pub const ACCENT_STRONG: Rgb = rgb(0x0ea5e9);
/// `--r-accent-fill`
pub const ACCENT_FILL: Rgb = rgb(0x173243);
/// `--r-accent-line`
pub const ACCENT_LINE: Rgb = rgb(0x31556a);
/// `--r-accent-ink`
pub const ACCENT_INK: Rgb = rgb(0xcfe8f8);
/// `--r-ink-on-accent`
pub const INK_ON_ACCENT: Rgb = rgb(0x04121f);
/// `--r-toggle-on-hover` (a checked box under the pointer)
pub const TOGGLE_ON_HOVER: Rgb = rgb(0xa7e2fc);
/// `--r-control-hover-bg`
pub const CONTROL_HOVER_BG: Rgb = rgb(0x304258);
/// `--r-success` (mint) and `--r-ok-bg` — a done install's mark.
pub const SUCCESS: Rgb = rgb(0x85e4b6);
pub const OK_BG: Rgb = rgb(0x18372d);
/// `--r-caution-text` — one line that needs reading.
pub const CAUTION_TEXT: Rgb = rgb(0xf3cd88);
/// `--r-danger-text` and `--r-danger-bg` — a failed install's mark and the failed step.
pub const DANGER_TEXT: Rgb = rgb(0xffaaa7);
pub const DANGER_BG: Rgb = rgb(0x3a242a);

/// `.cg-btn:hover` brightens a button by 12 %; `:active` darkens it to 92 %.
pub fn brightness(c: Rgb, k: f32) -> Rgb {
    let f = |v: u8| ((f32::from(v) * k).round().clamp(0.0, 255.0)) as u8;
    Rgb(f(c.0), f(c.1), f(c.2))
}

#[cfg(test)]
mod tests {
    use super::*;

    const THEME: &str = include_str!("../../../apps/runtime/src/renderer/theme.ts");
    const SPLASH: &str = include_str!("../../../apps/runtime/index.html");

    fn hex(c: Rgb) -> String {
        format!("#{:02x}{:02x}{:02x}", c.0, c.1, c.2)
    }

    /// The value a `--r-*` token resolves to in `theme.ts`: a literal, or a module constant.
    fn token(name: &str) -> String {
        let line = THEME
            .lines()
            .find(|l| l.trim_start().starts_with(&format!("'{name}':")))
            .unwrap_or_else(|| panic!("{name} is not declared in theme.ts"));
        let value = line.split_once(':').unwrap().1.trim().trim_end_matches(',');
        let value = value
            .split("//")
            .next()
            .unwrap()
            .trim()
            .trim_end_matches(',');
        // `export const colors = { … } as const;` — where `colors.X` is looked up, and nowhere else.
        let colors_block = {
            let start = THEME
                .find("export const colors = {")
                .expect("theme.ts declares colors");
            let end = start + THEME[start..].find("} as const;").expect("colors ends");
            &THEME[start..end]
        };
        let resolve = |v: &str| -> String {
            if let Some(lit) = v.strip_prefix('\'') {
                return lit.trim_end_matches('\'').to_lowercase();
            }
            // `colors.panel` → `panel: REF_SURFACE,` → `const REF_SURFACE = '#…'`.
            let mut name = v.to_string();
            for _ in 0..4 {
                if let Some(key) = name.strip_prefix("colors.") {
                    let l = colors_block
                        .lines()
                        .find(|l| l.trim_start().starts_with(&format!("{key}:")))
                        .unwrap_or_else(|| panic!("colors.{key} is not in theme.ts"));
                    name = l
                        .split_once(':')
                        .unwrap()
                        .1
                        .trim()
                        .trim_end_matches(',')
                        .to_string();
                } else if let Some(l) = THEME
                    .lines()
                    .find(|l| l.trim_start().starts_with(&format!("const {name} =")))
                {
                    name = l
                        .split_once('=')
                        .unwrap()
                        .1
                        .trim()
                        .trim_end_matches(';')
                        .to_string();
                }
                if let Some(lit) = name.strip_prefix('\'') {
                    return lit.trim_end_matches('\'').to_lowercase();
                }
            }
            panic!("{v} does not resolve in theme.ts")
        };
        resolve(value)
    }

    #[test]
    fn every_colour_is_a_console_token() {
        for (name, c) in [
            ("--r-splash-bg", SPLASH_BG),
            ("--r-splash-line", SPLASH_LINE),
            ("--r-splash-ink", SPLASH_INK),
            ("--r-splash-readout", SPLASH_READOUT),
            ("--r-splash-rail", SPLASH_RAIL),
            ("--r-splash-scene-bar", SPLASH_SCENE_BAR),
            ("--r-splash-logo-bars", LOGO_BARS),
            ("--r-splash-logo-swoosh", LOGO_SWOOSH),
            ("--r-surface", SURFACE),
            ("--r-surface-raised", SURFACE_RAISED),
            ("--r-field-bg", FIELD_BG),
            ("--r-border", BORDER),
            ("--r-border-soft", BORDER_SOFT),
            ("--r-border-strong", BORDER_STRONG),
            ("--r-text", TEXT),
            ("--r-text-secondary", TEXT_SECONDARY),
            ("--r-text-muted", TEXT_MUTED),
            ("--r-accent", ACCENT),
            ("--r-accent-strong", ACCENT_STRONG),
            ("--r-accent-fill", ACCENT_FILL),
            ("--r-accent-line", ACCENT_LINE),
            ("--r-accent-ink", ACCENT_INK),
            ("--r-ink-on-accent", INK_ON_ACCENT),
            ("--r-toggle-on-hover", TOGGLE_ON_HOVER),
            ("--r-control-hover-bg", CONTROL_HOVER_BG),
            ("--r-success", SUCCESS),
            ("--r-ok-bg", OK_BG),
            ("--r-caution-text", CAUTION_TEXT),
            ("--r-danger-text", DANGER_TEXT),
            ("--r-danger-bg", DANGER_BG),
        ] {
            assert_eq!(token(name), hex(c), "{name}");
        }
    }

    #[test]
    fn the_brand_constants_are_the_splashs_own() {
        assert!(SPLASH.contains(&format!("--cg-brand: {};", hex(BRAND))));
        assert!(SPLASH.contains(&format!("--cg-brand-deep: {};", hex(BRAND_DEEP))));
        assert!(
            SPLASH.contains("rgba(0, 174, 239, 0.5)"),
            "the splash glow is the brand at 0.5"
        );
    }
}
