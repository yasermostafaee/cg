# Sequence text and the authored clip

The owner's `cr.vcg` has a 1920×1080 outer stage, a 1920×48 child and an inner 45px Sequence.
At rest the line box fits, while the Persian glyphs extend below it. A diagnostic browser
comparison with just the Sequence clip removed restored 635 glyph pixels below the window.
The output uses the same Sequence builder for the console preview and the Bridge-served page.

Keep the viewport clipping, because entering and leaving items must be clipped even when the
template's own stage is large. Adjust text only when the font's vertical ink can fit in the
current window. Shift the resting text as little as needed. Page images, composition items and
intentionally oversized text retain their established positioning and clipping.
