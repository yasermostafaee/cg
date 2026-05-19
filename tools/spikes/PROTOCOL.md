# M1 Spike Protocol

Run these in order. Each spike has a clear capture and a clear question it answers.

## Pre-flight

`SETUP.md` must be complete. All four boxes from §6 ticked.

Create an output directory for captures (anywhere; suggested `C:\m1-captures\`):

```pwsh
mkdir C:\m1-captures
mkdir C:\m1-captures\spike-a
mkdir C:\m1-captures\spike-b
mkdir C:\m1-captures\spike-c
mkdir C:\m1-captures\spike-d
```

---

## Spike A — Persian Rendering in CEF

**Question:** Does CasparCG's CEF render Persian shaping identically to modern Chrome?

### Capture local baseline

```pwsh
# Open in Chrome (or Edge / Chromium):
start "" "tools\spikes\persian-reference\index.html"
```

Take a full-page screenshot (Chrome DevTools → ⋯ → "Capture full size screenshot"). Save as `C:\m1-captures\spike-a\chrome-baseline.png`.

### Capture CasparCG render

```
# In amcp-poke:
PLAY 1-20 [HTML] "file:///<ABSOLUTE_PATH>/tools/spikes/persian-reference/index.html"
CG 1-20 PLAY 1
```

Capture the `<screen>` window. On Windows you can use the Snipping Tool, or for an exact 1920×1080 frame use a screen-capture utility set to the screen consumer's bounds. Save as `C:\m1-captures\spike-a\caspar-1080i50.png`.

### Compare

Open both PNGs side by side. For each of the 17 sections in `persian-reference/index.html`, note any difference:

- Glyph differences (different shaping of the same character sequence)
- ZWNJ misbehavior (sections 5 and 6 specifically)
- Font fallback (does CEF have Vazirmatn? Does Google Fonts CDN load inside CEF?)
- Digit shaping
- Emoji rendering
- Bidi misordering

### Output

Write findings into `docs/adrs/0003-persian-rendering-in-cef.md`:

- **Status:** Accepted / Concerned (per findings)
- **Decision:** keep Vazirmatn bundled; document any CEF-specific workarounds; if shaping is broken, propose the HarfBuzz-WASM fallback from Phase 8 §16 R1.

---

## Spike B — OSC Schema Observation

**Question:** Does CasparCG 2.3.x emit the OSC addresses Phase 5 §4.1 expects? What addresses does it actually emit?

### Start capture

```pwsh
node tools/spikes/osc-capture/osc-capture.mjs --ndjson C:\m1-captures\spike-b\session.ndjson
```

Leave it running.

### Exercise scenarios via `amcp-poke`

Run each block; pause 5 s between blocks so the NDJSON has clear boundaries.

```
# B1. Baseline — observe idle channel
(wait 5 s, capture idle OSC)

# B2. Load an HTML template (does not auto-play)
LOAD 1-10 [HTML] "file:///<PATH>/tools/spikes/frame-counter/index.html"

# B3. Play it
CG 1-10 PLAY 1

# B4. Send an update
CG 1-10 INVOKE 1 "update" "{\"foo\":\"bar\"}"

# B5. Stop
CG 1-10 STOP 1

# B6. Clear
CLEAR 1-10

# B7. Layer collision — load two things on the same layer
LOAD 1-20 [HTML] "file:///<PATH>/tools/spikes/frame-counter/index.html"
LOAD 1-20 [HTML] "file:///<PATH>/tools/spikes/persian-reference/index.html"

# B8. Disconnect: Ctrl+C amcp-poke. Reconnect after 10s.
```

### Stop capture and inspect

Ctrl+C `osc-capture`. Inspect the NDJSON. Useful one-liners:

```pwsh
# Unique addresses observed:
Get-Content C:\m1-captures\spike-b\session.ndjson | ConvertFrom-Json | ForEach-Object { $_.address } | Sort-Object -Unique

# Address counts:
Get-Content C:\m1-captures\spike-b\session.ndjson | ConvertFrom-Json | Group-Object address | Sort-Object Count -Descending | Select-Object Count, Name
```

### Output

Write findings into `docs/adrs/0004-osc-schema.md`:

- Catalogue every observed address.
- Note any address from Phase 5 §4.1 that's **missing** (we'd have to derive it differently).
- Note any address that's **present but renamed** (e.g., `cg.invoked` vs `cg/method`).
- Move `C:\m1-captures\spike-b\session.ndjson` into `fixtures/osc-traces/m1-baseline.ndjson` so future caspar-client tests can replay against it.

---

## Spike C — Frame-Rate Sync

**Question:** Does `requestAnimationFrame` inside CasparCG's CEF tick at the channel's frame rate (50 Hz for 1080i50)? Or does it tick at the host display's refresh rate (60/144/etc)?

### Run

```pwsh
# In amcp-poke:
PLAY 1-20 [HTML] "file:///<PATH>/tools/spikes/frame-counter/index.html"
CG 1-20 PLAY 1

# Let it run for at least 30 seconds.
# The frame counter shows: elapsed time, avg ms/frame, min/max delta.
```

Take a screenshot of the screen consumer after 30 s. Save as `C:\m1-captures\spike-c\caspar-counter-30s.png`.

For comparison, open `frame-counter/index.html` directly in Chrome on the same machine and let it run 30 s. Screenshot.

### Expected

At 50 Hz vsync-locked: `avg ≈ 20.00 ms`, `range ≈ [19, 21]`.
At 60 Hz host-locked: `avg ≈ 16.67 ms`.
At 144 Hz host-locked: `avg ≈ 6.94 ms`.

### Output

Write findings into `docs/adrs/0005-frame-rate-sync.md`:

- If 50 Hz: confirm Phase 4 §6 assumption. Frame-locked durations work as designed.
- If host-locked: animations may drift. Propose explicit clock driven by OSC `/profiler/time` or `/foreground/file/frame`.

---

## Spike D — `cg.update` Round-Trip

**Question:** Does a Persian-laden JSON payload survive `CG INVOKE update` → `window.update(data)` intact? How long does it take?

### Run

Create a tiny dedicated HTML at `tools/spikes/cg-update-probe/index.html` (one file, not pre-built — write it during this spike for explicit visibility). The HTML must:

1. Render a `<pre id="received">waiting…</pre>` block.
2. Implement `window.update(payload)` to put `payload` into the `<pre>`.
3. Record `performance.now()` at receive and at next rAF; report the delta.

(Alternatively, modify `frame-counter/index.html` to also display received update payloads — same effect.)

```pwsh
# In amcp-poke:
PLAY 1-20 [HTML] "file:///<PATH>/tools/spikes/cg-update-probe/index.html"
CG 1-20 PLAY 1

# Then issue updates with Persian content:
CG 1-20 INVOKE 1 "update" "{\"headline\":\"خبر فوری: گزارش زنده\",\"subtitle\":\"OpenAI نسخه جدید\"}"
CG 1-20 INVOKE 1 "update" "{\"headline\":\"کاراکترهای ویژه: می‌خواهم، نمی‌توانم، می‌گویند\"}"
CG 1-20 INVOKE 1 "update" "{\"headline\":\"تست ZWNJ: ‌‌‌\"}"
```

### Capture

Screenshot the screen consumer after each update. Verify the text on screen exactly matches the JSON payload. Note the receive-to-paint latency reported by the probe.

### Output

Write findings into `docs/adrs/0006-update-round-trip.md`:

- Confirm JSON survives the AMCP wire intact (escape rules from Phase 5 §3.2).
- Report observed latency. Feed into Reconciler's optimistic-UI window budget (Phase 5 §8.4).

---

## Done

When all four ADRs are written and committed:

```pwsh
# Move keepable artifacts:
mv C:\m1-captures\spike-b\session.ndjson fixtures\osc-traces\m1-baseline.ndjson

# Retire the spike code:
git rm -r tools\spikes
git commit -m "Retire M1 spike code; findings captured in ADRs 0003-0006"
git tag -a m1 -m "M1 — De-Risking Spike (Spikes A-D)"
```
