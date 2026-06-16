# Design — separate-text-box-shadow (D-057)

## Context

Recon established: `text` has `textShadow` only (no box `shadow`); `BoxStyleSchema` =
stroke + cornerRadius (no shadow); only `shape` declares box `shadow`. The
`AnimatablePropertySchema` has ONE `shadow.*` set, which `applyShadow` maps by element
type — text/time-driven → `text-shadow` (from `textShadow`), shape → `box-shadow` (from
`shadow`). So a text element's `shadow.*` already drives its text-shadow; there is no
second key for a box-shadow → the two cannot animate independently today.

## Decision — additive, no migration (option i)

Add the box shadow to text on DISTINCT keys; leave `shadow.*` exactly as-is.

- **Schema:** `TextElementSchema` gains `shadow: ShadowSchema.optional()` (explicit, not
  via `BoxStyleSchema`). `AnimatablePropertySchema` gains `boxShadow.offsetX/Y/blur/color`.
- **Key map (text):** `shadow.*` → text-shadow (`el.textShadow`, unchanged);
  `boxShadow.*` → box-shadow (`el.shadow`, new). **Key map (shape):** `shadow.*` →
  box-shadow (`el.shadow`, unchanged). No rename, so all existing keyframes keep working.
- **scene-builder `buildText`:** add `if (element.shadow) el.style.boxShadow =
composeBoxShadow(element.shadow)` (reusing the shape helper), keep the existing
  `text-shadow` paint. `buildShape` unchanged.
- **applyShadow:** keep the existing `shadow.*` branch (text→text-shadow, shape→box-shadow).
  Add a `boxShadow.*` branch (a `BOX_SHADOW_PROPS` set) that recomposes `box-shadow` for
  TEXT from static `el.shadow` + animated `boxShadow.*`. Independent of `shadow.*`.
- **registry:** the existing `shadow.*` descriptors stay (text → "Text Shadow", reading
  `textShadow`). Add a `boxShadow.*` descriptor set for TEXT only (section "Box Shadow",
  reads `el.shadow`). `shadowDesc`/`SHAPE_SHADOW` for shape unchanged; content-driven
  arrays unchanged.
- **StyleSection:** parameterize `DropShadowSection` with a `keyPrefix` (`'shadow'` |
  `'boxShadow'`) + a `field` accessor (`textShadow` | `shadow`) + `title`, so it serves
  three uses: text "Text Shadow" (`shadow.*`/`textShadow`), text "Box Shadow"
  (`boxShadow.*`/`shadow`), shape "Box Shadow" (`shadow.*`/`shadow`). Keep the one-line
  combined-offset VectorField. Content-driven kinds keep their own `TickerShadowSection`.
- **writeStaticAnimatable:** add a `boxShadow.*` case (text → writes `el.shadow`); the
  `shadow.*` cases stay.

## Risks / guards

- **Independence** — the whole point: a `boxShadow.*` track and a `shadow.*` track on the
  same text element drive different CSS properties (`box-shadow` vs `text-shadow`). The
  applier reads each set separately. Test: keyframe both, assert different values at one
  frame.
- **Shape unchanged** — relabel is the `title` prop only; same `shadow`/`shadow.*`/render.
  Test asserts the title + that behavior is identical.
- **Existing text-shadow unchanged** — `shadow.*`/`textShadow` path untouched.
- **Content-driven untouched** — no `boxShadow.*` descriptors added to their arrays;
  `shadow.*` still → text-shadow; `applyShadow` `boxShadow.*` branch gated to text (their
  `shadow` field doesn't exist / isn't exposed).
- **Additive schema** — text `shadow` optional; `boxShadow.*` keys additive ⇒ old scenes
  - `.vcg`/GDD unaffected.
