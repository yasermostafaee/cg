# Frame Counter — Spike C

A self-contained 1920×1080 HTML that displays a frame counter incremented via `requestAnimationFrame`, with running stats (avg ms/frame, min/max delta).

The question Spike C answers: does CasparCG's CEF `requestAnimationFrame` tick at the channel's declared frame rate, or at the host's display refresh rate?

## Expected behavior

| Mode                              | avg ms/frame | implied Hz |
| --------------------------------- | ------------ | ---------- |
| Vsync-locked to channel (1080i50) | ~20.00 ms    | 50 Hz      |
| Vsync-locked to channel (1080p60) | ~16.67 ms    | 60 Hz      |
| Host display 60 Hz                | ~16.67 ms    | 60 Hz      |
| Host display 144 Hz               | ~6.94 ms     | 144 Hz     |

If the avg matches the channel rate → Phase 4 §6's vsync-locked assumption holds.
If it matches the host rate instead → animations will drift; we need an
explicit clock driven by OSC `/profiler/time` or `/foreground/file/frame`.

## Use locally (browser baseline)

```pwsh
start "" "tools\spikes\frame-counter\index.html"
```

Watch the counter for at least 30 s. Note avg/min/max. Modern Chrome on a
Windows desktop will typically show 16.67 ms (60 Hz).

## Use against CasparCG

```
# In amcp-poke:
PLAY 1-20 [HTML] "file:///<ABSOLUTE_PATH>/tools/spikes/frame-counter/index.html"
CG 1-20 PLAY 1

# Let it run for at least 30 s.
# Screenshot the screen consumer window.
```

The screen consumer shows the full 1920×1080 frame. Avg should be ~20 ms for
1080i50. If it shows ~16.67 ms instead, CasparCG's CEF is _not_ vsync-locked
to the channel — that's a Spike C finding.

## Pass / fail

This is a measurement, not a binary pass/fail. Capture the numbers; the
decision lives in ADR 0005.

Practically:

- `avg` within ±1 ms of the channel-rate target → vsync-locked (good).
- `avg` matching the host display refresh → host-locked (need an explicit
  clock at the broadcast-runtime tier).
- Wildly variable (e.g., max > 3× min) → CEF is dropping frames; investigate
  CasparCG version, GPU drivers, channel `<channel-grid>` settings.
