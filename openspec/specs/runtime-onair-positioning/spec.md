# runtime-onair-positioning Specification

## Purpose

TBD - created by archiving change runtime-onair-positioning. Update Purpose after archive.

## Requirements

### Requirement: A template carries an optional default on-air position

The shared schema SHALL define a `Position` as a 9-point anchor (`top-left`,
`top-center`, `top-right`, `mid-left`, `center`, `mid-right`, `bottom-left`,
`bottom-center`, `bottom-right`) plus a pixel offset `{x, y}` in output
space (x→right, y→down): the anchor aligns the graphic's matching handle to
the OUTPUT frame's matching handle, and the offset nudges from there. The
Scene SHALL accept an OPTIONAL scene-level `defaultPosition: Position` —
absent is legal, and every scene/`.vcg` authored before the field validates
and renders unchanged. The reference output frame is 1920×1080 (the space
manifest offsets are authored in); non-1080 channels are documented future
work.

#### Scenario: Backward compatibility — absent default validates

- **WHEN** a scene without `defaultPosition` is validated, packed, or
  unpacked **THEN** it passes exactly as before the field existed
- **WHEN** a scene carries `defaultPosition` **THEN** it round-trips
  through validation intact

### Requirement: The on-air output applies the effective position; the Designer preview never does

The runtime SHALL compute and apply the effective position at the on-air
boot — the exported single-file HTML's boot script, the one page CasparCG
loads on both the bridge-served and file-drop paths — as: the served-URL
query override (`?pos=<anchor>&dx=<x>&dy=<y>`) when present and valid, else
`scene.defaultPosition`, else CENTERED — a freshly imported graphic never
lands at (0,0). It SHALL place the stage by sizing the page to the
1920×1080 output frame and translating the scene-resolution-sized stage
root via CSS transform: `stageX = ax*(ow−fw)+offset.x`,
`stageY = ay*(oh−fh)+offset.y` with anchor fractions `ax,ay ∈ {0,0.5,1}` —
the footprint stays scene-sized, only translated. An invalid or unknown
`pos` token SHALL invalidate the whole query override (fall through to the
default chain), never a partial apply. A full-frame 1920×1080 scene SHALL
compute translate(0,0) — pixel-identical to the pre-positioning output.

The Designer preview boot path SHALL apply NO positioning: the author keeps
seeing the comp at its own resolution.

#### Scenario: Query override places the stage

- **WHEN** a 300×300 scene boots on the output path with
  `?pos=bottom-right&dx=-10&dy=-20` **THEN** the stage root is translated
  to (1610, 760) — `1*(1920−300)−10`, `1*(1080−300)−20` — and the page
  frame is sized 1920×1080

#### Scenario: Manifest default applies when no override rides the URL

- **WHEN** the same scene carries `defaultPosition` and boots with no
  position query **THEN** the stage lands at the manifest default's
  anchor+offset

#### Scenario: Centered fallback — never 0,0

- **WHEN** a scene with no `defaultPosition` boots with no position query
  **THEN** the stage is centered (translate(810, 390) for 300×300), not at
  the top-left

#### Scenario: An invalid override falls back wholesale

- **WHEN** the query's `pos` token is not one of the 9 anchors **THEN**
  the override is ignored entirely and the default chain applies

#### Scenario: The Designer preview is untouched

- **WHEN** a runtime is created on the preview path (no output-position
  call) **THEN** the stage root carries no positioning transform and the
  page frame is not resized
