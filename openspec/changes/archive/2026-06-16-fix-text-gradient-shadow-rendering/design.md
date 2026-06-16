# Design — fix-text-gradient-shadow-rendering (B-016, B-017)

## Context

Recon established the shared root: in `buildText`, text-shadow (`el.style.textShadow`),
the box background (`el.style.background`/`backgroundColor`), and the gradient text fill
(`el.style.background` + `background-clip: text` + `color: transparent`) all live on the
SAME node. The gradient's `background` overwrites the box background (B-016); and the
clipped-gradient background layer is painted below `text-shadow`, so the shadow covers
the gradient (B-017). Clock/sequence repeat the gradient+text-shadow pattern on their
host `el` (text in inner span/items inherits transparent colour + the shadow) but carry
no box background — so B-017 only. PRE-EXISTING; box-shadow/shape correct.

## Decision — gradient-only restructure, per-kind mechanism

The solid path is the common, currently-correct case and is left byte-for-byte the same
(outer node, `color` + `text-shadow`). Only the gradient case changes.

### Text — dedicated inner node (fixes B-016 + B-017 together)

`buildText` gradient branch creates an inner `<div data-cg-text>` carrying:
`background = fillToCss(colorFill)` (linear OR radial) + `-webkit-background-clip:text` +
`background-clip:text` + `color:transparent`; the glyph shadow as
`filter: drop-shadow(ox oy blur color)`; and the text content. It is appended to the
outer `el`. The outer `el` keeps box background/`backgroundColor`/`backgroundFill`,
border + radius (`applyBoxStyle`), padding, `box-shadow` (`element.shadow`), layout
(flex/align/wrap/direction), transform, `element.filter`, `data-cg-element-id`, and the
`elementMap` registration. Because the gradient/clip is now on a NODE WHOSE RENDERED
OUTPUT is the gradient glyphs, `filter: drop-shadow` shadows that output → the shadow
sits behind the gradient (B-017); and the box `background` is no longer overwritten
(B-016). The inner node is **layout-transparent**: no width/height/margin, inherits
font/align/direction/white-space, and is the single (flex) child — so auto-size, wrap,
horizontal + vertical align, and RTL/bidi are unchanged.

### Clock / sequence — composed drop-shadow (fixes B-017)

No box background ⇒ no inner-node restructure. `buildClock`/`buildSequence` gradient
branch: keep the gradient/clip on `el`; render the glyph shadow as
`filter: drop-shadow(...)` composed onto `el.style.filter` (which `applyBaseStyles`
already set from `element.filter`). Solid keeps `text-shadow`. Because there's no box,
`drop-shadow` on `el` shadows only the gradient text.

## The shared "text render node" + the solid↔gradient switch

`text-render-node.ts` exports `TEXT_NODE_DATASET = 'cgText'` and
`textRenderNode(host)` — returns the child marked `data-cg-text` if present, else the
host. Build creates the marker exactly when text colour is a gradient; bindings and the
animation applier resolve through `textRenderNode`, so all three agree with whatever the
DOM currently is. Switching text colour solid↔gradient rebuilds the scene (a schema
change → fresh `buildScene`), so the inner node is created/removed and the next
binding/colour/shadow write lands on the correct node — no stale write to a removed node
(the B-015 mode-switch concern, here resolved by structural rebuild + a DOM-keyed
resolver rather than cached references).

### Ripples

- `bindings.applyOne` `case 'text'` (incl. placeholder via `textOriginals`) and
  `case 'color'` (text property) → `textRenderNode(el)`.
- `animation-applier`: `text.color` (text + time-driven) → `textRenderNode`. `applyShadow`:
  shape → `box-shadow` (unchanged); text/time-driven SOLID → `text-shadow` on the render
  node (unchanged for solid); text GRADIENT → `drop-shadow` on the inner node; time-driven
  GRADIENT → delegated to `applyFilter`. `applyFilter`: for a time-driven gradient kind it
  appends `drop-shadow(resolved glyph shadow)` to the composed `filter`, and runs whenever
  filter._ OR (static/animated) shadow is present — so the glyph drop-shadow and
  `element.filter` (+ animated `filter._`) compose into ONE declaration without clobbering.

## Risks / guards

- **Solid unchanged** — gradient-gated branch; solid renders on the outer node with
  `text-shadow` exactly as today. Proven by the untouched solid scene-builder/applier tests.
- **box-shadow / shape** — `element.shadow` box-shadow stays on the outer `el`; shape's
  `box-shadow` path is untouched.
- **Layout-transparency** — inner node sets no box metrics; auto-size/autoSqueeze/sizing
  (runtime renders `transform.size`; the Designer measures independently), wrap, align,
  RTL/bidi, inline-edit (transform-positioned `contentEditable` overlay) unaffected.
- **Filter composition (clock/seq)** — single writer: `applyFilter` owns `el.filter`
  including the glyph drop-shadow for the time-driven gradient case; `applyShadow` does
  not also write `filter` there.
- **No schema change** — additive render behavior; old scenes load/play/export unchanged.
