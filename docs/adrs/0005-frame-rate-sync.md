# ADR 0005 — Frame-rate sync in CasparCG CEF

- **Status:** Accepted
- **Date:** 2026-05-23
- **Spike:** M1 Spike C
- **Capture:** [`fixtures/spike-captures/spike-c-frame-counter.png`](../../fixtures/spike-captures/spike-c-frame-counter.png)

## Context

Phase 4 §6 assumed that `requestAnimationFrame` inside CasparCG's CEF
ticks at the channel's frame rate (vsync-locked), not at the host
display's refresh rate. If false, animations expressed in frames at
the broadcast tier would drift relative to the channel's frame clock,
and we'd need an explicit clock driven by OSC `/profiler/time` or
`/foreground/file/frame`. Spike B already established that those OSC
addresses are **not emitted** by 2.3.x, so a vsync-lock failure here
would have meant a meaningful redesign.

## Measurement

`tools/spikes/frame-counter/index.html` was loaded via
`PLAY 1-20 [HTML]` on a 1080i50 channel. It increments a counter once
per `requestAnimationFrame` and reports `elapsed`, `avg ms/frame`,
`min`, `max`.

After **367.25 seconds** (~6 minutes, 18,363 frames):

| Metric | Value                   | Interpretation                             |
| ------ | ----------------------- | ------------------------------------------ |
| `avg`  | **20.00 ms (50.00 Hz)** | Exactly the channel rate                   |
| `min`  | 5.50 ms                 | One-shot fast frame (rebound after a miss) |
| `max`  | 41.50 ms                | One missed frame followed by a recovery    |

## Decision

**CEF's `requestAnimationFrame` is vsync-locked to the channel's frame
rate in CasparCG 2.3.x.** Phase 4 §6's design holds. The broadcast
runtime can express animation durations in frames at the scene's
declared rate and trust rAF to deliver one callback per channel frame.

No explicit clock or OSC-derived frame counter is needed.

## Consequences

- **`@cg/template-runtime/clock` (M3.2-β)** can be implemented as a
  thin wrapper that converts frames → seconds at the scene's declared
  rate, and uses GSAP's default rAF ticker without further coordination.
- **Frame-rate mismatch warning** (Phase 4 §11): if a 50fps scene is
  loaded on a 60fps channel, animations will play at the _channel's_
  rate (so a 50-frame slide takes 50 channel frames = 833 ms on a 60fps
  channel instead of the intended 1000 ms). The warning at ingest is
  still useful; the actual rendering is just "the channel decides."
- **Outlier handling**: occasional ±1-frame jitter (min 5.5 ms / max
  41.5 ms above) is normal and below the threshold any operator would
  notice. Soak testing in M10 will verify the rate stays this stable
  over 24 hours.

## What this doesn't decide

- **Multi-channel hosts** with different per-channel frame rates. We
  ran one 1080i50 channel. If a host runs 1080i50 + 1080p60 + 720p60
  concurrently, do all CEF instances tick at their own channel's rate
  independently? Expected yes (each HTML producer is per-layer), but
  verify pre-production.
- **Drop frame behavior**: when CEF can't keep up (heavy template,
  large Lottie), does it block the channel or skip frames? Our max
  41.5 ms suggests one missed frame followed by recovery — not a
  cascading drop. Worth re-checking under M10's soak load.

## Open follow-ups

- **24-hour soak** with the frame counter running to confirm rate
  stability over time (M10).
- **High-load test**: load the Persian reference card AND the frame
  counter on adjacent layers and see if either's avg shifts.
