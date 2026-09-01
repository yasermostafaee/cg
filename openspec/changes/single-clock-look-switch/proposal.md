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

**The two-bank shape is ADOPTED. The zero-skew result is PENDING MEASUREMENT.** This change carries
the spec; the reorder, the mask removal and the measurement campaign land together as one commit,
because a maskless page under plates that are still BELOW it puts black on air for every plate.

Acceptance for that campaign is unchanged and is all-or-nothing: **zero black and zero
hole-misalignment in EVERY recording**, both directions, `1↔2` and `1↔3` separately plus `1→2→3` and
`3→2→1`, at least ten recordings per transition, measured with the same file-consumer harness that
produced the 20 / 30 / 60 ms numbers. A partial win is reported as a failure.

## What this does NOT fix

**Producer start latency (`B-192`) survives untouched.** A plate whose producer the switch had to
`PLAY` shows nothing for **+2 … +4 fields (40–80 ms)** while it acquires, and no compositing order
puts a picture where there is none. The owner must not be told a residual he can still see was
fixed by this.
