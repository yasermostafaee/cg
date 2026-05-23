# ADR 0004 — OSC schema revisions for CasparCG 2.3.x

- **Status:** Accepted
- **Date:** 2026-05-23
- **Spike:** M1 Spike B
- **Capture:** 315,626 events across ~14 min, observed on a single-channel
  1080i50 instance. Sample preserved at
  `fixtures/osc-traces/m1-baseline-sample.ndjson` (downsampled in M1.10).

## Context

Phase 5 §4.1 sketched the OSC addresses we'd subscribe to based on a
mix of CasparCG community documentation and general expectations. Spike
B observed what CasparCG 2.3.x actually emits during a representative
session: idle baseline, PLAY [HTML], CG INVOKE update, CG STOP, CLEAR,
and a layer collision (two PLAYs on the same layer).

## Observed addresses

Eight (yes, eight) unique address patterns across the entire capture:

| Address                                                | Args                         | Notes                                             |
| ------------------------------------------------------ | ---------------------------- | ------------------------------------------------- |
| `/channel/N/framerate`                                 | `[num, den]` e.g. `[50, 1]`  | Per-frame heartbeat. Useful for clock sanity.     |
| `/channel/N/mixer/audio/volume`                        | 8 floats                     | Per-frame audio levels (8 channels). Ignorable.   |
| `/channel/N/stage/layer/L/foreground/producer`         | `"html"` \| `"empty"` \| ... | **Key state signal.** Producer kind on the layer. |
| `/channel/N/stage/layer/L/foreground/file/path`        | URL string                   | What's loaded.                                    |
| `/channel/N/stage/layer/L/foreground/paused`           | bool                         | Play / pause state.                               |
| `/channel/N/stage/layer/L/foreground/transition/frame` | `[cur, total]`               | Transition progress (CUT = `[0,0]`).              |
| `/channel/N/stage/layer/L/foreground/transition/type`  | `"cut"` \| ...               | Transition kind.                                  |
| `/channel/N/stage/layer/L/background/producer`         | `"empty"` \| ...             | Next-up tracking.                                 |

## Decision

Phase 5 §4.1 (and `runtime/osc.ts` in `@cg/shared-schema`) is **revised
to match observed reality**. The key changes:

1. **`/foreground/file/name` → `/foreground/file/path`** (URL, not basename).
2. **`/foreground/producer/name` → `/foreground/producer`** with one string arg.
3. **`/foreground/paused`** added as the primary play-state signal.
4. **`/cg.invoked` / `/cg.stopped` do NOT exist.** CasparCG 2.3.x emits
   no CG-specific OSC events. **The Reconciler relies on AMCP acks for
   INVOKE/STOP feedback, not OSC.**
5. **`/foreground/file/frame` does NOT exist.** Per-frame progress
   tracking from OSC is unavailable. Phase 4 §6's frame-locked timing
   must work from CEF's `requestAnimationFrame` alone (Spike C's job
   to confirm rAF is vsync-locked to channel rate).
6. **`/profiler/time` not observed** in this capture. May require a
   non-default OSC verbosity setting in `casparcg.config`. Documented
   as a follow-up rather than relied upon.
7. **`/output/consumer/.../dropped-frame` not observed.** Likely
   requires explicit consumer-level OSC config. Useful for health
   monitoring (Phase 5 §9) but optional.

## Consequences

### Reconciler design adjustments (Phase 5 §8)

- **AMCP acks are the source of truth for "CG operation happened"** —
  not OSC. The Reconciler tracks intent → AMCP ack as the primary path,
  and OSC only as confirmation that the layer's _state_ changed.
- **"On-air" detected via `/foreground/producer` transitioning from
  `"empty"` to `"html"`** (or whatever producer is loaded).
- **"Off-air" detected via `/foreground/producer` returning to `"empty"`**
  after a `CG STOP` + `CLEAR` sequence.
- **Mid-animation state cannot be queried from OSC** — caspar-client
  must time animations using local intent + AMCP ack timestamps, not
  observed frame counts.

### Event volume

OSC traffic is ~400 events/sec on an **idle channel** (heartbeat from
the 8 patterns above). With multiple channels or active layers this
multiplies. Phase 5 §4.2's rate limiting is mandatory, not optional:

- `/framerate` and `/audio/volume`: emit once at handshake, sample at
  ≤1 Hz thereafter.
- `/foreground/transition/frame`: sample at ≤10 Hz.
- All other addresses: dispatch on change only (the Reconciler
  receives a value only when it differs from the last observed).

### What this doesn't change

- **AMCP transport, command queue, escape rules** (Phase 5 §3, §5)
  remain as specified.
- **Redundancy adapter strategies** (Phase 5 §7) remain — AMCP-based
  failover detection doesn't depend on OSC events.
- **Layer manager / slot allocator** (Phase 5 §6) is fine; OSC
  `/foreground/producer` provides the "is the slot occupied?" signal
  the LayerManager needs.

## Open follow-ups

- **`/profiler/time` and `/output/consumer/*/dropped-frame`** —
  experiment with `<osc>` config verbosity to see whether these can
  be unlocked. Useful for health monitoring; deferred.
- **Multi-channel trace** — this capture was single-channel.
  Pre-production: capture a multi-channel session to verify the
  address shape stays stable when N > 1.
- **OSC schema across CasparCG minor versions** — Phase 5 §11 already
  flags this. Re-run Spike B against any new 2.3.x patch we adopt.
- **`@cg/shared-schema/runtime/osc.ts`** needs an update PR: replace
  the speculative `osc.cg.invoked` / `osc.cg.stopped` / `osc.frame`
  variants with the observed addresses above.
