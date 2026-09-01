# A look switch becomes a SINGLE-CLOCK operation: the plate-bearing page moves BELOW the plates, and the mask is retired

## Why

A look switch is two mutations on two independent clocks — the page draws its mask holes on the
browser's paint clock, CasparCG moves the pictures on the channel tick. `B-174` chased the gap
through three shipped outcomes and the owner rejected all three:

| outcome                                     | measured                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| raw skew (`SKEW-COUNT-01`)                  | holes 1–3 fields behind the fills, 20 / 30 / 60 ms                        |
| the mixer hold (`SKEW-HOLD-01`)             | `k` = −20 / 0 / +20 ms — ±1 field of clock quantisation, irreducible      |
| the intersection mask (`SKEW-INTERSECT-01`) | black 0 % in 10 of 10, but 45–54 % of the frame "misplaced" for 60–100 ms |

**No constant aligns two clocks that drift**, and phase-lock is dead: no channel frame number
reaches the page on any transport (`/foreground/file/frame` absent per ADR 0004; `INFO` has no tick
index; the tick tap is rate-limited to 1 Hz; the page has only `rAF`), and 2.5.0 has no scheduling
verb. **While the page is above the plates and punches holes, this class can only be reshaped.**

Put the plates ABOVE the page and there is no hole: the picture covers the page, a switch is
`MIXER FILL`/`CLIP` only, the page is not involved, and misalignment becomes unrepresentable.

### What made this affordable, and it was not obvious

`B-194` rejected the idea on the cost of a second CEF page per row. `B-195` overturned that on two
counts, both from evidence rather than argument:

- **The audit.** Across the client's twelve packages and the repo's nine, **not one element draws
  over a live picture.** The only package with plates (`3ghab.vcg`) has exactly one non-plate
  element — a full-frame image BELOW all three look instances, i.e. the backdrop the punch exists
  for. The client's over-the-picture furniture — `ارم`, `زیرنویس`, `نوار خبر`, `توالی خبر`,
  `میان‌برنامه` — is authored as **separate templates on separate rows**, which the bank already
  runs above the plates.
- **The cost number did not survive its control.** `B-194`'s "three extra pages break cadence" used
  a full-frame 50 fps `requestAnimationFrame` probe. Five STATIC pages of the same furniture, same
  settle, break **0 of 10** with `k` unchanged. The cost is per-frame full-frame repainting, not
  page count.

⇒ **No second CEF page is built.** The change is a LAYER ORDER.

## What changes

```
layers 1–9      the plate-bearing page      (moves here; they are free)
the live band   the plates                  (UNCHANGED, 10–59 by declaration)
layers 70–99    the bank / furniture rows   (UNCHANGED, already above the plates)
```

**A SECOND declared bank**, low, for plate-bearing rows. The alternative — an item whose slot is no
longer its row — was rejected; see `design.md` §1 for why, and it is the same objection this project
already used once, in `design.md §9b.5`.

## Status

🔴 **THE SHAPE IS BUILT. THE ACCEPTANCE IS NOT MET, AND NOTHING WAS PUSHED.**

The reorder and the mask retirement are implemented and green (one local commit, `a7976e14`, not on
the remote). The campaign that gates them ran on the plant on 2026-09-01 — **100 recordings**, the
same file-consumer harness and the same artefact classifier that produced the 20 / 30 / 60 ms
numbers, at `1080i5000`:

| term                                             | result                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| `k` — the PAGE against the MIXER, `B-174`'s term | **0 channel frames in 100 of 100**                   |
| BLACK frames                                     | **0 in 100 of 100**                                  |
| DROPPED frames                                   | **none; no recording discarded, worst deficit 2/76** |
| MISPLACED frames                                 | 0 in 99 — **2 frames (40 ms) in ONE**                |

**The one non-zero is a different disagreement and it is filed as `B-198`:** in that recording the
arriving plate's `MIXER … FILL` took effect a whole channel frame before the departing box's, so the
outgoing box was drawn over the incoming picture for 40 ms. The page and the fills were exactly
together in that run as in every other (`k = 0`); what split was two `MIXER` commands of ONE batch.

The acceptance is all-or-nothing by instruction — _"Any non-zero recording is a failure — stop,
report it, land nothing"_ — so it is reported as a failure. ⚠ **That is not a report that the reorder
failed:** the term it targets read zero in every recording, which no `B-174` campaign had achieved
before. `B-198` has to be closed, or the acceptance re-scoped by the owner with these numbers in
front of him, before this ships.

## What this does NOT fix

**Producer start latency (`B-192`) survives untouched.** A plate whose producer the switch had to
`PLAY` shows nothing for **+2 … +4 fields (40–80 ms)** while it acquires, and no compositing order
puts a picture where there is none. The owner must not be told a residual he can still see was
fixed by this.
