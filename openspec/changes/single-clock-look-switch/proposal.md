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

⭐ **THE ACCEPTANCE IS MET. Measured on the plant, twice: 2026-09-01 found one residual, and
2026-09-02 closed it and re-ran the campaign clean.**

| term                                             | 2026-09-01                     | 2026-09-02 (after `B-198`)   |
| ------------------------------------------------ | ------------------------------ | ---------------------------- |
| `k` — the PAGE against the MIXER, `B-174`'s term | 0 channel frames in 100 of 100 | **0 in 100 of 100**          |
| BLACK frames                                     | 0 in 100 of 100                | **0 in 100 of 100**          |
| DROPPED frames                                   | none                           | **none; worst deficit 2/76** |
| MISPLACED frames                                 | 2 frames (40 ms) in ONE run    | **0 in 100 of 100**          |

**What the one residual was, and why a clean campaign is not what proves it gone.** `B-198`: a
seating batch's `MIXER` lines are sent one at a time and each one's ACK is awaited, so a channel
tick falling between two of them landed the fills a frame apart. At 1 recording in 50, a clean
campaign after a change looks exactly like a clean campaign before it. The proof is a FORCED
reproduction — the split made to fire on demand at the send seam — which produced the reported
artefact on 6 runs of 6 (`k` = 0, misplaced 22.68132716049383 %, the departing box's own area to
the last digit) and, **with the forcing still in place**, produces 0 % on 10 of 10 after the fix.

Every `MIXER` line of a batch now carries ` DEFER` and one `MIXER <ch> COMMIT` lands the lot on a
single channel frame.

⚠ **One thing that is NOT covered by this and must not be read into it:** term (b), producer start
latency (`B-192`), at **+2 … +4 fields (40–80 ms)**. It is absent from the campaign only because
the `ghab3` fixture seats every plate in every look on purpose, so no producer is ever started
inside a window. On the owner's real template a look revealing a parked box still shows it dark for
that long, and no compositing order changes it.

## What this does NOT fix

**Producer start latency (`B-192`) survives untouched.** A plate whose producer the switch had to
`PLAY` shows nothing for **+2 … +4 fields (40–80 ms)** while it acquires, and no compositing order
puts a picture where there is none. The owner must not be told a residual he can still see was
fixed by this.
