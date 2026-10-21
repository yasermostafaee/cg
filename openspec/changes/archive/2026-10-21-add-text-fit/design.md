# Design — Shrink to Fit (TEXT-FIT-01)

## 1. One spelling, and why a migration

Three fields said "fit": `fitMode: 'shrink-to-fit'`, `autoSqueeze` and `overflow: 'shrink'`. Keeping all
three readable would make every reader decide which wins; dropping two would change how old files
open. So `fitMode` is the one spelling, and `migrateTextFit` rewrites the other two when a scene
loads: `autoSqueeze: true` or `overflow: 'shrink'` on a FIXED box becomes `fitMode: 'shrink-to-fit'`; on
an autosize box (which already hugs its text) only the legacy key goes. A text that asked for none of
it is returned as the same object — **intent preserved: nothing changes how it looks unless it had
asked for fit.** It is REGISTERED in `SCENE_MIGRATIONS` (paths, then text-fit, then the countdown
zones), which both load points run: the Designer's scene load and `createRuntime`, so an old `.vcg` is
migrated on air too. It is written for the CEF floor (Chromium 71: no `Object.fromEntries`), pinned by
`single-file-export/tests/cef-compat.test.ts`.

## 2. The fit, on the shaped run

A shrink-to-fit text is marked (`markTextFit`) and fitted by `fitText`: if the laid-out text already
fits (`scrollWidth ≤ clientWidth + 1` and `scrollHeight ≤ clientHeight + 1` — one pixel for
sub-pixel rounding) nothing changes; otherwise a binary search over the scale between
`TEXT_FIT_MIN_SCALE` (½) and 1 finds the largest size that fits, AFTER the browser has shaped and laid
out the Persian run — so joined forms, ZWNJ and mixed scripts are measured as drawn. Below the
minimum it stops shrinking and the author's overflow takes over: clip, or a one-line ellipsis.

It re-fits synchronously where new text arrives (the binding writes text, then fits, in the same
task — no frame shows the overflowing size), when the box gets or changes a size (a
`ResizeObserver`, before paint), and when a font loads. A keyframed font size keeps the last fit's
scale. Fixed text that is not marked is built exactly as before.

## 3. Measured on CasparCG 2.5.0 (local, `127.0.0.1:5250`)

A lower third with a 900 × 90 box, Vazirmatn 64 px, the name
`دکتر سید محمدعلی رضایی‌نژاد خراسانی اصفهانی`:

|                                | font               | laid-out width / box              | height / box |
| ------------------------------ | ------------------ | --------------------------------- | ------------ |
| before (`fixed`)               | 64 px              | 1220 / 900 — spills past the band | 94 / 90      |
| after, long name               | 47.28 px (× 0.739) | 901 / 900 (within the 1 px)       | 90 / 90      |
| after, short name `سارا نادری` | 59.97 px (× 0.937) | 900 / 900                         | 91 / 90      |
| after, the long name again     | 47.28 px           | 901 / 900                         | 90 / 90      |

⚠ A finding: an authored 64 px line in a 90 px box is TALLER than the box (94 px), so even a short name
shrinks slightly, to fit vertically. That is the rule doing what it says; the template's box is the
thing to adjust.
