# Chromium bug report — ready to submit at https://issues.chromium.org (Blink>Paint)

Attach: `chromium-bug-repro.html` (single self-contained file, no dependencies).

---

**Title:** Stale raster: `left` changes smaller than ~2 CSS px inside a `transform: scale(64)`
subtree update layout but are never repainted

**Component:** Blink > Paint (raster invalidation)

**Chrome version:** 149.0.7827.201 (also reproduces in Playwright-driven headless with
`deviceScaleFactor` emulation)
**OS:** Windows 10 (10.0.19045), device pixel ratio 1.25 (125 % display scaling)
**GPU compositing:** default (also reproduces headless/software)

## Summary

Inside a subtree scaled up by a large CSS transform (`transform: scale(64)`, e.g. a zoomed-in
graphics editor at 6400 %), changing an absolutely-positioned element's `style.left` by less
than ~2 CSS px (sub-pixel moves like 0.2775px, and even exactly 1px) updates layout —
`getBoundingClientRect()` / computed style report the new position — but the painted pixels
stay at the OLD position indefinitely. At scale 64 a 1 px model move is 64 screen px, so the
painted box visibly sits tens of pixels away from where layout (and e.g. any overlay drawn
from `getBoundingClientRect`) says it is.

The stale raster:

- survives seconds of idle time — it is not a deferred invalidation;
- survives scrolling the element out of view and back;
- survives REPLACING the DOM node (removing it and rebuilding an identical subtree with the
  new `left` — the fresh node still paints at the stale position);
- is NOT fixed by nearby display-list changes: overlays added/removed over the region,
  `outline`/`opacity`/`visibility` toggles on the element, or a `will-change: transform`
  promote/demote round-trip all leave the stale pixels in place;
- IS fixed by any `left` change ≥ ~2 CSS px (and by unrelated full re-paints such as reload).

## Steps to reproduce

1. Open the attached `chromium-bug-repro.html`.
2. Click "left += 0.2775px" (or "left += 1px").
3. Compare the grey box's painted right edge with the blue marker (the marker is positioned
   from `getBoundingClientRect()` — where layout says the edge is).

## Expected

The painted edge follows the marker (≈18 screen px per 0.2775 px click, 64 px per 1 px click).

## Actual

The marker moves; the painted edge does not. Repeated clicks accumulate the divergence
(e.g. arrow-key-style 1 px steps in an editor leave the content trailing its true position by
multiple whole model pixels). Clicking "left += 2px" repaints and resnaps everything.

## Workaround (useful signal for diagnosis)

Pinning the element's box at `left: 0` and carrying the position in
`transform: translate(x, 0)` instead paints correctly for EVERY step size (the repro's
"toggle workaround" button) — transform updates are compositor-tracked and never miss, so the
defect appears specific to raster invalidation of pixel-snapped `left`/`top` movement under a
large raster scale.

## Notes

- Measured quantitatively with `page.screenshot({ scale: 'device' })` luminance profiling in
  Playwright: after `left: 6.4125px → 6.69px` at scale 64 / dpr 1.25, layout's right edge
  moves +22.5 device px, the painted edge moves 0.0 and stays put through +3 s idle and a
  scroll round-trip.
- Reproduces with the element inside a same-origin `srcdoc` iframe within the scaled subtree
  (our real-world case, a design tool's preview) AND with a plain div subtree (the attached
  minimal repro) — the iframe is not a factor.
- Reproduces headless (emulated dpr 1.25) and headed on a native 1.25-dpr Windows display.
