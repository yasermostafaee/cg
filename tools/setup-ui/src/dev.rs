//! A developer's doors into a BARE `cg-setup.exe` (nothing appended). An installer never reaches
//! them: `app::run` takes this path only when no payload is found behind the program.
//!
//! `--cg-preview <dir> <dark tile.png> <light tile.png>` renders every page, for each product, at
//! 100 %, 150 % and 200 %, the way the window paints them.

use crate::layout::{build, WidgetId};
use crate::model::{Facts, Model, Outcome, Page, Space};
use crate::observe;
use crate::product::{product, Config, MainFile, ProductId};
use crate::ui::gfx::Gfx;
use crate::ui::preview::{render, Shot};
use std::path::Path;

fn config(id: ProductId) -> Config {
    Config {
        product: id,
        version: "0.10.0".into(),
        engine_name: "engine.exe".into(),
        install_bytes: if id == ProductId::Bridge {
            95_800_000
        } else {
            19_600_000
        },
        main_files: vec![MainFile {
            path: "x.exe".into(),
            bytes: 1,
        }],
    }
}

pub fn preview(args: &[String]) -> u32 {
    let (Some(out), Some(dark), Some(light)) = (args.first(), args.get(1), args.get(2)) else {
        return 2;
    };
    let out = Path::new(out);
    let _ = std::fs::create_dir_all(out);
    let (Ok(dark), Ok(light)) = (std::fs::read(dark), std::fs::read(light)) else {
        return 2;
    };
    let Ok(g) = Gfx::new() else {
        return 2;
    };
    let mut failures = 0;
    for id in [ProductId::Control, ProductId::Designer, ProductId::Bridge] {
        let p = product(id);
        let tile = if p.dark_tile { &dark } else { &light };
        let home = match id {
            ProductId::Bridge => r"C:\Program Files\CG Bridge".to_string(),
            _ => format!(r"C:\Users\operator\AppData\Local\{}", p.name),
        };
        let fresh = Facts {
            default_dir: home.clone(),
            webview2_missing: id != ProductId::Bridge,
            data_dir: (id == ProductId::Bridge).then(|| r"C:\ProgramData\CG Bridge".to_string()),
            ..Facts::default()
        };
        let update = Facts {
            installed_version: Some("0.9.1".into()),
            installed_dir: Some(home.clone()),
            app_running: id == ProductId::Control,
            ..fresh.clone()
        };
        let mut shots: Vec<(String, Model, Option<WidgetId>)> = Vec::new();
        let mk = |facts: &Facts| {
            let mut m = Model::new(p, config(id), facts.clone(), None, true);
            m.space = Space {
                drive: "C:".into(),
                free: Some(126_000_000_000),
                writable: true,
            };
            m
        };
        shots.push(("welcome".into(), mk(&fresh), None));
        shots.push(("welcome-focus".into(), mk(&fresh), Some(WidgetId::Next)));
        shots.push(("update".into(), mk(&update), None));
        let mut loc = mk(&fresh);
        loc.page = Page::Location;
        shots.push(("location".into(), loc, None));
        let mut inst = mk(&fresh);
        inst.page = Page::Installing;
        inst.progress = if id == ProductId::Bridge {
            observe::bridge(
                "[stopping the service (if it runs)] exit 0\r\n",
                1.0,
                40,
                100,
                true,
            )
        } else {
            observe::app(observe::AppSignals {
                prepared: 1.0,
                engine_started: true,
                main_copied: 42,
                main_expected: 100,
                ..Default::default()
            })
        };
        inst.shown = inst.progress.fraction;
        shots.push(("installing".into(), inst, None));
        let mut done = mk(&fresh);
        done.page = Page::Done;
        done.outcome = Outcome {
            ok: true,
            service_running: Some(true),
            ..Outcome::default()
        };
        shots.push(("done".into(), done, None));
        let mut failed = mk(&fresh);
        failed.page = Page::Failed;
        failed.outcome.reason = Some(if id == ProductId::Bridge {
            "Writing the configuration failed.".into()
        } else {
            "The WebView2 runtime could not be installed.".into()
        });
        shots.push(("error".into(), failed, None));
        if id == ProductId::Bridge {
            let mut warn = mk(&fresh);
            warn.page = Page::Done;
            warn.outcome = Outcome {
                ok: true,
                service_running: Some(true),
                warning: Some("A firewall rule was not added: consoles on other machines may not reach CG Bridge.".into()),
                ..Outcome::default()
            };
            shots.push(("done-warning".into(), warn, None));
        }
        for (name, model, focus) in &shots {
            let scene = build(model, &g);
            for scale in [1.0f32, 1.5, 2.0] {
                if scale != 1.0 && name != "welcome" {
                    continue;
                }
                let suffix = if scale == 1.0 {
                    String::new()
                } else {
                    format!("@{scale}x")
                };
                let file = out.join(format!("{}-{name}{suffix}.png", p.role.to_lowercase()));
                let shot = Shot {
                    scene: &scene,
                    role: p.role,
                    tile_png: Some(tile),
                    focus: *focus,
                    hover: None,
                };
                if render(&g, &shot, scale, &file).is_err() {
                    failures += 1;
                }
            }
        }
    }
    u32::from(failures > 0) * 2
}
