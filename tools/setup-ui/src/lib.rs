//! CG Setup (`INSTALLER-DESIGN-01`, `P-063`): the setup window all three installers open, and the
//! silent pass-through that keeps every `/S` install exactly the engine's own.

#[cfg(windows)]
pub mod app;
pub mod cmdline;
#[cfg(windows)]
pub mod dev;
#[cfg(windows)]
pub mod engine;
pub mod icons;
pub mod layout;
pub mod model;
pub mod observe;
#[cfg(windows)]
pub mod pack;
pub mod palette;
pub mod product;
pub mod svgpath;
pub mod trailer;
#[cfg(windows)]
pub mod ui;
#[cfg(windows)]
pub mod win;
