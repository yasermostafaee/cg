# installer-rail-art — each installer's step rail carries its own art (`P-067`)

Prompt: `RELEASE-0114-01` Part B2, 2026-10-07. The owner's check of `0.11.3`, picture 2
(`Claude outputs/OWNER-0114-2-designer-setup-rail-art.png`, untracked).

## Why

CG Designer's setup window shows, at the foot of its step rail, CG Control's illustration: the playout
scene (layer rows, wires, the program monitor). CG Setup (`tools/setup-ui`) is one front end for all three
installers, and its rail drew that one scene whatever the product. The owner: CG Control keeps today's;
CG Designer gets its own (or none); CG Bridge gets its own (or none).

The same picture showed a second window frame behind the setup window, `Version 0.11.3` at its foot. It is
**not CG Setup's**: CG Setup creates exactly one window (one `CreateWindowExW`, `ui/window.rs`). The frame
matches CG Control's first-run "Set up" card (640 px wide, `Version <release>` at its foot), a CG Control
window that was already open behind. Nothing is changed for it here.

## What changes

- **The art becomes per product** (`tools/setup-ui/src/rail_art.rs`): each scene is data (shapes in its
  splash's own 360 × 150 units), `rail_art(product)` picks the product's own, and one display list places
  it in the rail. The painter (`ui/gfx.rs`) executes the list; the window and the developer preview give it
  the product. Placement, footprint and treatment are the ones `0.11.3` used for every rail: 192 DIPs wide,
  20 in from the rail's edge, its foot 60 above the window's, the whole scene at 40 %, in the splash scene's
  three inks (`--r-splash-line`, `--r-splash-scene-bar`, `--r-splash-rail`). No new colour.
- **CG Control** — unchanged: its list is the very calls `0.11.3`'s `splash_scene` made, pinned call for
  call by a test; its preview pictures are byte-identical before and after.
- **CG Designer** — its splash's artboard, its instrument only, as CG Control's is its splash's instrument
  only: the canvas grid, the motion path and the four keyframes on it (`apps/designer/index.html`). The
  graphic the path produces (strap, bug, ticker, dot) and the playhead are left out, as CG Control's
  graphics are.
- **CG Bridge** — its own scene. It has no splash and no window of its own to quote, and its rail has five
  steps (Playout), so it needs one that sits lower. The scene is CG Bridge's place: three consoles, each
  linked to the one service they all connect to (a light per link), and the service's one link on to the
  Playout's program monitor, drawn in the playout scene's own vocabulary (outlines, bars, wires, the
  monitor's safe-area ticks). Chosen over none so the three rails read alike; none stays a one-line change
  in `rail_art()`.
- **CI**: the `installers` job renders every page of all three setup windows with the CG Setup it just
  built (`--cg-preview`, the bare program's developer preview) and uploads them as `setup-rail-art`. The
  clean runners' `setup-window-windows-2022` / `-2025` go on capturing each installer's first screen.

## Impact

- New: `tools/setup-ui/src/rail_art.rs`.
- Changed: `tools/setup-ui/src/{lib.rs, dev.rs, ui/gfx.rs, ui/preview.rs, ui/window.rs}`;
  `.github/workflows/desktop.yml` (one render step and one upload in `installers`).
- Unchanged: the window, its pages and their words, the silent paths and exit codes, every engine, what is
  installed. No wire, schema or persisted key.
- Spec: `desktop-delivery` — one requirement ADDED.
