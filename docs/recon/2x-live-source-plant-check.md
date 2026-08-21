# The 2× live-source check — six values, no judgement

**For the owner, at the plant. No code, no session, ~10 minutes.**
Written 2026-08-21. Purpose: decide whether the unexplained on-air "2×" is a `cg` defect **at
all**, before a session is spent hunting one.

> ⚠ **This page is reproduced as §B of
> [the confidence-grab runbook](2026-08-22-confidence-grab-measurement.md)** so that ONE plant
> visit discharges both. Run whichever you have in front of you; do not run both and record
> different answers.

---

## Why this exists, and why the previously-planned hunt is the wrong hunt

The report: **a video used as a LIVE SOURCE played at ~2× speed, from the very first PLAY.**
The planned session was to hunt a _repetition_ — something in `cg` installed twice, advancing one
thing twice per tick.

🔴 **Nothing in `cg` can set the speed of a live-source producer.**

## ✅ Every code claim below was re-verified against the tree at `9604a3b1` (session BN)

The original draft cited these from memory of the code. They were checked one at a time, and one
path was abbreviated. **Nothing was found to be wrong.**

| Claim                                                                                  | Where it actually is                                                                                                                    | Verdict                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| The bridge's only seating command is `PLAY <ch>-<layer> <producer-arg>`                | `tools/caspar-bridge/src/command-builder.ts:209` — `` return `PLAY ${target(slot)} ${this.sourceArgument(producer)}` ``                 | ✅ verbatim                                                    |
| It sends no `SPEED` / `LOOP` / `SEEK` / framerate parameter                            | `git grep -nE "\bSPEED\b\|\bLOOP\b\|\bSEEK\b\|FRAMERATE" tools/caspar-bridge/src/` → the only hit is the word "EVENT-LOOP" in a comment | ✅ nothing touches playback rate                               |
| A live source's `producer` is `z.string()`, so it may legally be a FILE PATH           | `tools/caspar-bridge/src/live-layers.ts:147`                                                                                            | ✅ exact line                                                  |
| Project frame rate is one project-level setting, one of `25 / 29.97 / 50 / 59.94 / 60` | `FrameRateSchema`, `packages/shared-schema/src/primitives.ts:20-26`; `Scene.frameRate`, `scene.ts:501`                                  | ✅ exact lines                                                 |
| Every imported video is conformed to the project rate via `-r`                         | `apps/designer/src/renderer/features/assets/video-convert-args.ts:225-226` (`'-r', String(opts.targetFps)`), decision (d) at line 180   | ✅ — ⚠ the draft's path was abbreviated; the full path is here |
| `targetFps` IS the project's frame rate                                                | `VideoImportModal.tsx` passes `targetFps: projectFps` at all five call sites                                                            | ✅                                                             |
| The GOP comment reads _"~1s keyframe interval (25fps clips)"_ (`-g 25`)                | same file, lines 57-60                                                                                                                  | ✅ a hint, not proof                                           |
| The plant channel is `1080i5000`, framerate args `[50,1]`                              | `docs/prd/caspar.md:696,737`                                                                                                            | ✅ measured 2026-07-28                                         |

⭐ **One thing the re-verification ADDED, which strengthens step 3.** The importer already has
`fpsConformNotice(sourceFps, targetFps)` (`video-convert-args.ts:302`) — it tells the operator when
a source's rate differs from the project's. So an importer-produced file is at **the project's**
rate, deliberately and with a warning shown. That makes step 3's real question sharper: not merely
_"did it come from the importer"_ but **_"what was that project's `frameRate`"_** — because the
importer will faithfully have conformed the file to it.

So the rate is decided by exactly one party: **CasparCG, mapping the file's frame rate onto the
channel's.**

- A live source's producer is decoded by **CasparCG**, not by `@cg/template-runtime`. The RAF /
  tick drivers a repetition bug would double belong to the _page inside the html producer_ and
  never reach a producer on another layer. A template's own `<video>` is a DOM element in CEF; a
  live source is a CasparCG producer. **Different decoder, different clock.** (⚠ Whether a
  template video has ever shown the same 2× is not recorded anywhere and is not assumed either
  way — if you have seen it, say so, because it would refute the hypothesis below outright.)

## The hypothesis — plausible, self-consistent, and NOT YET MEASURED

⚠ **Unverified until step 4 answers it.** It rests on an assumption about how the 2.3.2 ffmpeg
producer maps a file whose rate differs from the channel's, which has **never been measured on
this box**.

**If it holds:** 50 ÷ 25 = **exactly 2×**, present **from the first PLAY**, on **live sources
only** — every part of the report, from one cause, none of it in `cg`'s code. The next session
would then not be a hunt at all; it would be a new PRD item: _the product must REPORT a file-rate ↔
channel-rate mismatch instead of silently playing it fast._

**If it does not hold** (step 4 plays correctly by hand), then `cg` **is** involved, and the next
session gets a real hunt with a much narrower axis than "repetition": the difference between what a
hand-typed `PLAY` sends and what the bridge sends.

Either answer kills half the work. That is why this is worth ten minutes before a session.

---

## The six values to record

Record them verbatim. **No judgement is wanted — the numbers decide it.**

> ⚠ Pick a scratch layer that **no band owns** — outside the Live Source band and outside the
> fixed-layer band. Check the Runtime's layer table first. Everything below writes `LAYER` where
> that number goes; substitute it by hand. (Written as a named placeholder deliberately: `<` is a
> reserved operator in PowerShell.)

**1 — the channel.** Send `INFO 1`. Record the video mode and the framerate figure verbatim.
_Expected: `1080i5000`, framerate `[50,1]`. If it is not, that alone changes the arithmetic._

|                |     |
| -------------- | --- |
| video mode     |     |
| framerate args |     |

**2 — the file's real rate.** On the plant machine, on **the exact file** that was used as the
live source: MediaInfo, or

```
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,avg_frame_rate,codec_name -of default=noprint_wrappers=1 "FILE"
```

|                  |     |
| ---------------- | --- |
| `codec_name`     |     |
| `r_frame_rate`   |     |
| `avg_frame_rate` |     |

**3 — where the file came from.** One line, in your own words: was it produced by the Designer's
importer (i.e. a VP8+alpha `.webm` that came out of an asset import), or an ordinary video file
from elsewhere? **If it came from the importer, also record that project's frame-rate setting**
(Designer → project settings). If it did not, say so — that is itself an answer, and it takes the
importer out of the chain.

|                                   |     |
| --------------------------------- | --- |
| origin                            |     |
| project `frameRate` (if importer) |     |

**4 — 🔴 THE DECISIVE ONE. By hand, with `cg` out of the picture.**
With the bridge **not running** (or on a layer the bridge does not own), from a plain AMCP client:

```
PLAY 1-LAYER "THE-SAME-FILE"
```

Watch it. **Is it ~2× fast?**

|                 |     |
| --------------- | --- |
| 2× ? (yes / no) |     |

- **YES** → `cg` is not in the chain. The cause is the rate mapping; the follow-up item is "report
  the mismatch", not "hunt a repetition". **Stop here — steps 5 and 6 then just pin the ratio.**
- **NO, it plays correctly** → `cg` **is** in the chain after all, and the hypothesis is dead. Say
  so plainly; the next session gets a narrow, real hunt.

**5 — the control.** Play a file whose frame rate **equals** the figure from step 1 (any 50 fps
clip). Correct speed? If a 50 fps file is right while the 25 fps file is 2×, the mapping is
confirmed and the ratio is exactly `channelFps ÷ fileFps`.
_Do not skip this. A zero test without a one test as control has cost this project two sessions
already._

|                              |     |
| ---------------------------- | --- |
| 50 fps clip — correct speed? |     |

**6 — what the server itself says.** While the file from step 4 is playing, send `INFO 1-LAYER`.
Record whatever it reports about the producer's framerate / file rate.

|                           |     |
| ------------------------- | --- |
| `INFO 1-LAYER` (verbatim) |     |

---

## What to send back

The six values, as they came out. Nothing else is needed — no diagnosis, no screenshots. Paste
them into the next session and the prompt writes itself from them.
