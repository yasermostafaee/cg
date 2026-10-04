//! `cg-setup-pack` — build one installer: CG Setup in front, the product's NSIS engine behind it.
//!
//! cg-setup-pack --ui <cg-setup.exe> --engine <engine.exe> --product <bridge|control|designer>
//!   --version <x.y.z> --install-bytes <n> --main <path>=<bytes> [--main …] --icon <.ico>
//!   --tile <.png> [--guide <.pdf>] --out <installer.exe>
//!
//! Called by `tools/release/src/pack-installers.mjs`, which reads the version from every file that
//! carries it and measures the sizes.

#[cfg(windows)]
fn main() {
    use cg_setup::pack::{pack, Inputs};
    use cg_setup::product::{Config, MainFile, ProductId};
    use std::path::Path;

    let args: Vec<String> = std::env::args().skip(1).collect();
    // `--stamp-version <exe> <x.y.z>`: give a program a version resource (a test engine has none).
    if args.first().map(String::as_str) == Some("--stamp-version") {
        let (Some(exe), Some(v)) = (args.get(1), args.get(2)) else {
            std::process::exit(2)
        };
        match cg_setup::pack::stamp_version(Path::new(exe), v) {
            Ok(()) => std::process::exit(0),
            Err(e) => {
                eprintln!("cg-setup-pack: {e}");
                std::process::exit(2);
            }
        }
    }
    let one = |name: &str| -> Option<&str> {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .map(String::as_str)
    };
    let all = |name: &str| -> Vec<&str> {
        args.iter()
            .enumerate()
            .filter(|(_, a)| *a == name)
            .filter_map(|(i, _)| args.get(i + 1).map(String::as_str))
            .collect()
    };
    let fail = |m: &str| -> ! {
        eprintln!("cg-setup-pack: {m}");
        std::process::exit(2);
    };
    let need = |name: &str| one(name).unwrap_or_else(|| fail(&format!("{name} is required")));
    let product = match need("--product") {
        "bridge" => ProductId::Bridge,
        "control" => ProductId::Control,
        "designer" => ProductId::Designer,
        other => fail(&format!("unknown product {other}")),
    };
    let engine = Path::new(need("--engine"));
    let main_files = all("--main")
        .into_iter()
        .map(|m| {
            let (path, bytes) = m
                .split_once('=')
                .unwrap_or_else(|| fail(&format!("--main {m}: expected <path>=<bytes>")));
            MainFile {
                path: path.into(),
                bytes: bytes
                    .parse()
                    .unwrap_or_else(|_| fail(&format!("--main {m}: bytes"))),
            }
        })
        .collect::<Vec<_>>();
    if main_files.is_empty() {
        fail("at least one --main is required");
    }
    let config = Config {
        product,
        version: need("--version").into(),
        engine_name: engine
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "engine.exe".into()),
        install_bytes: need("--install-bytes")
            .parse()
            .unwrap_or_else(|_| fail("--install-bytes")),
        main_files,
    };
    let result = pack(Inputs {
        ui: Path::new(need("--ui")),
        engine,
        config,
        icon: Path::new(need("--icon")),
        tile: Path::new(need("--tile")),
        guide: one("--guide").map(Path::new),
        out: Path::new(need("--out")),
    });
    match result {
        Ok(()) => println!("packed {}", need("--out")),
        Err(e) => fail(&e),
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("cg-setup-pack runs on Windows only.");
    std::process::exit(2);
}
