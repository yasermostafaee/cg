// CG Setup — the program every CG installer is (INSTALLER-DESIGN-01, P-063). See `app.rs`.
#![windows_subsystem = "windows"]

#[cfg(windows)]
fn main() {
    let code = cg_setup::app::run();
    std::process::exit(code as i32);
}

#[cfg(not(windows))]
fn main() {
    eprintln!("CG Setup runs on Windows only.");
    std::process::exit(2);
}
