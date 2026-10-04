# installer-design — a setup window of our own for all three installers (`P-063`)

Prompt: `INSTALLER-DESIGN-01` (v2), 2026-10-03. Order: after `central-bridge` (archived 2026-09-30),
independent of `PLAYOUT-FEATURES-01` and `CONSOLE-POLISH-01`, before `RELEASE-0110-01` (which builds the
delivery release from it).

## Why

The three installers (CG Bridge, CG Control, CG Designer) open the default NSIS wizard: a white page, a
grey system button row, the classic look. The owner does not want that, nor a version of it with a
picture pasted on top. He wants setup to feel like installing a current, well-made product — clean, calm,
confident — and to look like **the same product** as the splash and the sign-in card.

## What changes

- **CG Setup** (`tools/setup-ui`, Rust, Win32 + Direct2D + DirectWrite): one setup program, used by all
  three installers with different content. Its own frameless 800 × 520 window — the system's shadow,
  Windows 11's rounded corners, a square edge on Windows 10, its own title bar (minimise and close) —
  with a left step rail (Welcome → Location → Installing → Done, ticks drawing in) on the splash's ground,
  and the sign-in card's surface, foot and controls on the right. Every colour is a console token; the
  faces are the ones the splash and the sign-in card render with (Segoe UI); every shape is vector.
- **The installers become CG Setup + an ENGINE.** Each product's NSIS installer is built exactly as
  before and appended, unchanged, behind CG Setup (`cg-setup-pack`). Run with `/S` (or Tauri's `/P`),
  CG Setup shows nothing: it runs the engine with the installer's own command line and returns the
  engine's exit code — so every silent path, argument and exit code is the engine's. Run without, it
  shows the window and drives the same engine silently, reading its real steps (CG Bridge's
  `install.log`; for the two apps, the WebView2 runtime appearing, the program's bytes landing,
  Installed apps naming the release).
- **The pages** (§2): Welcome (the question, the app's tile, publisher, version from `tools/release`,
  two or three lines on what it installs, "Update from … to …" when older is installed), Location (the
  folder — changeable where the install mode allows it — and the space), Installing (a real bar and the
  step in words; Cancel only before the engine starts changing the machine), Done ("Launch when ready" /
  "Open CG Bridge status"; one primary; a warning line and "Open log" when the engine warned), Error (the
  reason in words, "Open log", Close). Help at the rail's foot opens the bundled install guide, or CG
  Bridge's `/health` once installed.
- **Keyboard, DPI, motion, accessibility**: Tab / Shift+Tab / Enter / Space / Esc with a visible focus
  ring; per-monitor DPI v2; a short page entrance and the tick drawing in, none of it when Windows'
  "Animation effects" is off; a UI Automation tree of every text and control.
- **CI**: CG Setup is tested and built (32-bit, like the NSIS stubs) in the installers job; the three
  installers are packed; the smokes run every silent path against the engine alone AND the installer
  (same exit codes), drive every page of every installer through UI Automation, prove the first screen
  needs no WebView2, and capture every page — plus Welcome at 150 % and 200 %.
- **Unchanged**: what gets installed (the service, the rules, WebView2 when missing, the shortcuts and
  their AppUserModelIDs, the uninstall entries), the file names, the install modes, offline, unsigned.
  The uninstallers stay the engines' own (the classic NSIS uninstall pages).

## Impact

- New: `tools/setup-ui` (crate `cg-setup`, workspace member), `tools/release/src/pack-installers.mjs`,
  the smokes `apps/runtime/tests/desktop/setup-*.mjs` / `setup-uia.ps1`,
  `tools/bridge-installer/setup-smoke.mjs`.
- Changed: `.github/workflows/desktop.yml` (build, pack, two new smoke steps, the `setup-window` job),
  `Cargo.toml` / `Cargo.lock` (shared config), `docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md` §2
  (what the installer now is; its size).
- Spec: `desktop-delivery` — the CI requirement MODIFIED; the setup window and the silent contract ADDED.
