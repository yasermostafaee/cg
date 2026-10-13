# Recon — CasparCG 2.5.0 Stable hardware validation (C-018)

**Date:** 2026-07-28 · **Box:** the real Windows playout machine (FRONTEND-01) ·
**Branch:** `docs/recon-caspar-250-validation` · **Scope:** RECON ONLY — no production
code, no fixes, no config changes. Evidence files live in
`tools/caspar-amcp-probe/evidence/2026-07-28-c018-validation/` (all paths below are
relative to that directory unless noted).

Every claim below is tagged **MEASURED** (by this session, with the command and raw
output) or **PENDING-OWNER** (needs human eyes or ears — collected in the
[owner checklist](#owner-checklist) at the end).

---

## 0. Environment — located and verified, not assumed

> ⚠ **THE ENVIRONMENT BELOW IS 2026-07-28 AND NO LONGER DESCRIBES THE PLANT. Read it as history.**
> Recorded 2026-08-25; the text below is left **verbatim**, as a dated record must be.
>
> | recorded here (2026-07-28)                                  | as of 2026-08-25                                                                   |
> | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
> | install `D:\programs\casparcg-server-v2.5.0-stable-windows` | **`D:\casparcg-server-v2.5.0-stable-windows`** — no `programs\`                    |
> | channel `720p5000`                                          | `1080p5000`                                                                        |
> | consumers `<screen/>` + `<system-audio/>`                   | `<decklink>` (device `23487013`, embedded-audio) + `<screen/>` + `<system-audio/>` |
>
> 🔴 **Do NOT read the path row as "this record was sloppy".** Both values were read off a RUNNING
> PROCESS — this one via `netstat` → PID → image path, the 2026-08-25 one by the owner during the
> DeckLink walk. Either the install MOVED between the two dates or one reading is a transcription
> slip, and **this session could not tell which.** The other two rows show the box genuinely was
> reconfigured in between, which makes a move entirely plausible. What is settled is only which
> path is live NOW: see `2026-08-25-decklink-model-walk.md`.
>
> **`D:\programs\CasparCG` (the retired 2.3.2) is unaffected** — a different server, not a
> different spelling.

- **Running server found via** `netstat -ano | findstr :5250` → PID → image path:
  `D:\programs\casparcg-server-v2.5.0-stable-windows\casparcg.exe`, launched from
  Explorer (no `casparcg_auto_restart.bat` wrapper — verified via parent PID =
  `explorer.exe`).
- **Config read from disk:** `D:\programs\casparcg-server-v2.5.0-stable-windows\casparcg.config`
  - AMCP port: **5250** (line 22, `<port>5250</port>`, inside `<controllers><tcp>` lines 20–25)
  - Channel format: **`720p5000`** (line 13), consumers `<screen/>` + `<system-audio/>` (lines 14–17)
  - OSC `predefined-client`: **ABSENT**. The active configuration is lines 3–32 only;
    everything from line 34 to line 209 is one XML comment (the shipped defaults
    reference), and the only `<osc>` block (lines 199–208, client 127.0.0.1:5253) is
    inside that comment. OSC therefore flows via the compiled-in default — port 6250 to
    every connected AMCP client (`disable-send-to-amcp-clients` defaults to false) —
    and ONLY while an AMCP connection is open. All OSC captures below account for this.
- **PRD-vs-reality:** C-018's text says the rebuilt config is "1080i5000 channel, AMCP
  5250, OSC predefined-client". Measured reality: **720p5000**, AMCP 5250, **no**
  predefined-client. The 2.5.0 config is the stock distribution default, not the plant
  format — see owner checklist item 6.
- **Rollback install:** `D:\programs\CasparCG\` — its config (`casparcg.config`):
  channel **1080i5000** (line 13), consumers `system-audio` + `newtek-ivga` + `screen`
  (lines 15–19), AMCP **5250** (line 24), OSC `predefined-client` **127.0.0.1:6250**
  (lines 37–42). Only one server can run at a time (both bind 5250).
- **Platform prerequisites (MEASURED):**
  - CPU: Intel Core i5-10400 — `IsProcessorFeaturePresent`: AVX ✓, **AVX2 ✓**, AVX-512 ✗.
    The AVX2 gate (mandatory from 2.6) passes.
  - MSVC runtime: `C:\Windows\System32\vcruntime140.dll` = **14.42.34433.0**
    (VC++ 2015–2022 x64 redistributable 14.42.34433 installed).

### The build-identity discoveries that reframe this validation

1. **"2.5.0 Stable" is build `69e8ad5`** (exe `FileVersion: 2.5.0 69e8ad5`, AMCP banner
   `2.5.0 69e8ad5 Stable`) — the **same commit** as the June "2.5.0 dev build" that
   `evidence/casparcg-2.5.0-69e8ad5/` was captured against. The prior escape-sweep
   evidence was already taken on the bits that became Stable.
2. **The "2.3.3 plant" is actually `2.3.2 4de6d18f Dev`** (AMCP `VERSION` →
   `2.3.2 4de6d18f Dev`, raw log `b1-version-233.ndjson`) — the **exact build** the
   committed evidence dir `casparcg-2.3.2-4de6d18f/` and the committed OSC baseline
   came from. **The "committed baseline is 2.3.2 but the plant is 2.3.3" mismatch named
   by C-018's task brief does not exist: the plant IS the baseline build.** Every
   old-vs-new comparison below is therefore same-build, apples-to-apples.

---

## 1. Bullet 1 — boot + `VERSION` — **MEASURED: PASS**

- Boot log: `D:\programs\casparcg-server-v2.5.0-stable-windows\log\caspar_2026-07-28.log`.
  Boot banner (verbatim, log line at 15:06:01.280):
  `Starting CasparCG Video and Graphics Playout Server 2.5.0 69e8ad5 Stable`.
  Full module init clean — OpenGL 4.5 (Intel), channel `1|720p5000`, html module (CEF
  cache `cef-cache/`), screen + oal consumers, controllers, OSC. No warnings or errors.
- Command: `node tools/spikes/amcp-poke/amcp-poke.mjs` script `VERSION` (raw:
  `b1-version.ndjson`):

  ```
  > VERSION
  < 201 VERSION OK
  < 2.5.0 69e8ad5 Stable
  ```

- Note: the log shows a prior boot the same day (13:42:55) with **no shutdown lines**
  before the 15:06:01 boot — that instance was stopped uncleanly (window close or
  similar) by whoever restarted it. Contrast with §7's clean shutdown, which logs a
  five-line uninit sequence ending `Successfully shutdown CasparCG Server.`

## 2. Bullet 2 — `@cg/caspar-client` AMCP subset — **MEASURED: PASS (identical to plant), with two shared quirks**

Two instruments, both mirroring the client's verb shapes
(`tools/caspar-bridge/src/command-builder.ts`: flash layer 0, play-on-load OFF):

**(a) ADR-0006 verb matrix** — `node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs
--caspar-host 127.0.0.1 --serve-host 127.0.0.1` (results:
`probe-verbs-2.5.0-stable.results.json`, wire: `.wire.ndjson`). Field-for-field
identical to the committed 2.3.2 run (`casparcg-2.3.2-4de6d18f/results.json`),
return codes included:

| candidate                 | codes 2.3.2 | codes 2.5.0 | update fired            | exact match | Persian |
| ------------------------- | ----------- | ----------- | ----------------------- | ----------- | ------- |
| `cg-add+cg-update`        | 202,202     | 202,202     | YES = YES               | YES = YES   | YES     |
| `play-html+call-update`   | 202,202     | 202,202     | no = no                 | —           | —       |
| `cg-add+cg-invoke-update` | 202,201     | 202,201     | YES (empty)             | no = no     | —       |
| `cg-add+cg-invoke-inline` | 202,201     | 202,201     | YES (`[object Object]`) | no          | —       |
| `play-html-urlquery`      | 202         | 202         | no = no                 | —           | —       |

`CG UPDATE` remains the one verb that delivers byte-exact Persian JSON to
`window.update` — on 2.5.0 exactly as hardware-validated on 2.3.2.

**(b) scripted subset sweep** — `amcp-poke` script (raw: `b2-amcp-subset.ndjson` for
2.5.0, `b2-amcp-subset-233.ndjson` for the plant build, **identical script and
arguments**). Per-verb response lines, side by side:

| command (shape)                       | 2.5.0 Stable            | 2.3.2 plant             |
| ------------------------------------- | ----------------------- | ----------------------- |
| `VERSION`                             | `201 VERSION OK`        | `201 VERSION OK`        |
| `INFO`                                | `200 INFO OK`           | `200 INFO OK`           |
| `PLAY 1-10 [HTML] "file:///…"`        | `202 PLAY OK`           | `202 PLAY OK`           |
| `CG 1-10 ADD 0 "file:///…" 0 "{…}"`   | **`404 CG ADD FAILED`** | **`404 CG ADD FAILED`** |
| `CG 1-10 PLAY 0` (nothing on layer)   | `202 CG OK`             | `202 CG OK`             |
| `CG 1-10 UPDATE 0 "{…}"` (no CG page) | `403 CG UPDATE FAILED`  | `403 CG UPDATE FAILED`  |
| `CG 1-10 INVOKE 0 "update" "{…}"`     | `403 CG INVOKE FAILED`  | `403 CG INVOKE FAILED`  |
| `CG 1-10 STOP 0`                      | `403 CG STOP FAILED`    | `403 CG STOP FAILED`    |
| `CG 1-10 REMOVE 0`                    | `403 CG REMOVE FAILED`  | `403 CG REMOVE FAILED`  |
| `CLEAR 1-10`                          | `202 CLEAR OK`          | `202 CLEAR OK`          |
| `INFO 1` / `INFO 1-10`                | `201 INFO OK`           | `201 INFO OK`           |

Findings (both are **shared** behaviours, NOT 2.5.0 regressions — measured identically
on the plant build):

- **`CG ADD` rejects `file://` URLs with `404` on BOTH builds.** `PLAY [HTML]` accepts
  the same URL. `CG ADD` with an `http://` URL works on both (the (a) matrix above).
  The production path is unaffected — `tools/caspar-bridge` serves templates over HTTP
  for exactly this reason — but the `tools/template-fixtures` README's manual
  `file:///` workflow only works via `PLAY [HTML]`, and on 2.5.0 only (see §4).
- **`CG PLAY` acks `202 CG OK` on a layer with no CG page** while
  UPDATE/INVOKE/STOP/REMOVE fail `403` — on both builds. Client code must not read
  `202 CG OK` from `CG PLAY` as proof a template is loaded.
- `INFO 1-10` responses differ in richness: 2.5.0 returns the full stage/layer XML
  (foreground producer, file path, paused); the plant build returns a bare
  `<channel></channel>`. Reporting only — no verb behaviour differs.

**(c) lifecycle semantics** — `node tools/caspar-amcp-probe/bin/lifecycle-probe.mjs`
(results: `lifecycle-2.5.0-stable.results.json`, `lifecycle-233.results.json`).
Programmatic three-way diff (label/code/OSC-producer/JS-lifecycle per step):
**committed-2.3.2 ≡ today's-2.3.2 ≡ 2.5.0-Stable.** In particular the C-013-relevant
contract holds unchanged: `CG STOP` leaves the producer RESIDENT (`osc: html`, JS
`stop` fires, `CG PLAY` resumes with no re-ADD) and `CLEAR` destroys it (OSC goes
SILENT).

## 3. Bullet 3 — OSC diff vs the committed baseline — **MEASURED: differences exist and are documented (acceptance's "or" branch)**

Baseline: `fixtures/osc-traces/m1-baseline-sample.ndjson` — a 500-line **sample**
captured 2026-05-23 from build `2.3.2 4de6d18f` (see §0: the plant IS that build, so
the brief's "2.3.2 baseline vs 2.3.3 plant" caveat is moot). Captures:
`b2-osc-250.ndjson` (73,382 lines, 2.5.0) and `b2-osc-233.ndjson` (34,434 lines,
plant build, **same capture tool, same arguments, same driving scripts**). Analyzer:
`node tools/spikes/osc-capture/analyze.mjs <file>`.

Three-way pattern attribution (`/N/` = any number):

| address pattern                                                       | baseline sample | 2.3.2 today        | 2.5.0 today        |
| --------------------------------------------------------------------- | --------------- | ------------------ | ------------------ |
| `/channel/N/framerate` `[50,1]`                                       | ✓               | ✓                  | ✓                  |
| `/channel/N/mixer/audio/volume`                                       | ✓ (8 args)      | ✓ (8 args)         | ✓ (**16 args**)    |
| `/channel/N/stage/layer/N/background/producer`                        | ✓               | ✓                  | ✓                  |
| `/channel/N/stage/layer/N/foreground/file/path`                       | ✓               | ✓                  | ✓                  |
| `/channel/N/stage/layer/N/foreground/paused`                          | ✓               | ✓                  | ✓                  |
| `/channel/N/stage/layer/N/foreground/producer`                        | ✓ (`"html"`)    | ✓ (`"transition"`) | ✓ (`"transition"`) |
| `…/foreground/transition/frame`, `…/transition/type`                  | –               | ✓                  | ✓                  |
| `…/foreground/transition/direction`, `…/transition/producer`          | –               | –                  | **✓ new**          |
| `/channel/N/format` (`"720p5000"`)                                    | –               | –                  | **✓ new**          |
| `/channel/N/output/port/N/consumer`                                   | –               | –                  | **✓ new**          |
| `/channel/N/output/port/N/screen/{always_on_top,index,key_only,name}` | –               | –                  | **✓ new**          |

Attribution, with the same-build recapture ruling out version confusion:

- **Not version changes at all** (present in today's 2.3.2 capture; the 500-line
  baseline sample simply never included those moments): the `transition`-wrapper
  producer value and its `frame`/`type` sub-addresses. A `PLAY`-loaded layer reports
  `foreground/producer = "transition"` (wrapping `html`) on BOTH builds — client code
  matching `producer === 'html'` on the foreground address must already cope today.
  Note: a **`CG ADD`**-loaded layer reports `producer = "html"` directly (lifecycle
  probe, both builds) — the wrapper is a `PLAY`-path artifact.
- **Genuinely new in 2.5.0:** `/channel/N/format`, the `/output/port/N/*` topology
  (consumer name + four screen sub-addresses), and `transition/direction` +
  `transition/producer` detail.
- **Changed in 2.5.0:** `mixer/audio/volume` grew **8 → 16** array elements.
- **Nothing disappeared:** every baseline address pattern is present on 2.5.0 with the
  same argument types; `framerate` args identical (`[50,1]`).

Verdict: not "diffs clean" — the acceptance's second branch applies. The differences
above are recorded in C-018's body per the acceptance text. None of them breaks the
`@cg/caspar-client` contracts (occupancy = producer-presence + silence-on-CLEAR is
unchanged); the 16-element volume array and the `transition` foreground value are the
two things worth a code-audit note before the upgrade change lands.

## 4. Bullet 4 — Persian reference template under CEF 142 — **MEASURED: renders, shaping/joining intact; layout+animation observations; final eyeball PENDING-OWNER**

Template: `fixtures/templates/persian-lower-third/` (built this session via
`pnpm --filter @cg/template-fixtures build`; ES-module `index.html` + `cg.js` bundle +
`fetch('./template.json')`). Driven via `PLAY [HTML]`; frames captured **server-side**
with `PRINT 1 "<name>"` (the Image consumer writes PNGs into the install's own
`media/` — no tool wrote into the install dir; PNGs were copied out afterwards).
2.5.0's channel is 720p (1280×720 viewport) while the template is fixed 1920×1080, so
content sits below the fold; `CG 1-10 INVOKE 0 "scrollTo(0,360)"` brought it into
view. Raw logs: `b4-persian-*.ndjson`; frames: `c018-anim-*.png`, `b4-*.png`.

- **Renders under CEF 142 (2.5.0):** dark bar + red accent + Persian text over intact
  alpha. `c018-anim-05.png` (left half), `c018-anim-10-rightview.png` (right half).
  **Persian shaping/joining is correct** (connected forms in «کارشناس روابط…») and
  pixel-identical in shaping terms to the plant-build render.
- **Transparency/keying intact (MEASURED):** background pixels in the PRINT PNGs are
  `ARGB(0,0,0,0)`; the fixture panel's dark blue reads back at its authored
  `rgba(10,24,48,0.85)` (alpha 217). An earlier read of these frames as "white page"
  was viewer flattening, nothing else.
- **Same-build comparison on the plant (CEF ~71, 1080i channel = full frame, no
  scroll):** `b4-233-http-01-settled.png`. Layout is **identical** to 2.5.0 —
  including the suspicious part: both engines render the RTL text runs with their
  right edge at x≈140, overflowing LEFT off-canvas, instead of anchoring at the box's
  right edge (scene intent: `align:'start'` + `direction:'rtl'`, x=140 w=1140 —
  `tools/template-fixtures/persian-lower-third.scene.mjs:60-119`). **Not an upgrade
  regression — a `@cg/template-runtime` behaviour, same on both builds** (spawned as a
  separate investigation task; out of C-018 scope).
- **`file://` origin (MEASURED, inverted vs expectation):** the module-based template
  from `file:///` renders **nothing on the plant build** (CEF ~71: `b4-233-file-00-empty.png`,
  empty frames) but renders **fully on 2.5.0** (CEF 142: `b4-scroll-07-*.png`). The
  control: `tools/template-fixtures/audio-autoplay.html` (inline script, no modules)
  renders from `file://` on BOTH. So CEF 142 _improved_ `file://` module/fetch
  loading. Combined with §2's `CG ADD` 404-on-`file://` (both builds): HTTP serving is
  the only path that works everywhere, which is what production does.
- **Animation timing (MEASURED, with a caveat):** scene `frameRange` 0–50 @ 50 fps =
  1.0 s in-animation; the fixture auto-plays ~500 ms after ready. Named-PRINT series
  at ~370 ms cadence from PLAY-OK (`b4-persian-timing.ndjson` + `c018-anim-*.png`):
  t+0.36 s = empty channel; **t+0.73 s = fully settled frame; every frame from
  t+0.73 s through t+4.45 s is byte-identical.** If the 1 s animation had run after
  the 500 ms delay, frames at 0.73/1.11/1.49 s must differ — they do not. On 2.5.0
  the template reached its settled state ≤ 0.73 s after PLAY with **no mid-animation
  frame observable**. The plant-build series (1.2 s cadence) brackets 0.7 s(empty) →
  1.9 s(settled) — too coarse to say whether CEF 71 animates. Machine verdict:
  **the recorded 1 s in-animation was not observed on 2.5.0**; whether it visibly
  animates on the live output (vs snapping) is owner checklist item 3.
- **Fonts:** `cg.css` `@import`s Vazirmatn from Google Fonts (network). Whether the
  intended font (vs a shaping-capable fallback) actually loaded is not machine-decidable
  here — owner checklist item 2. Shaping itself is correct either way.

## 5. Bullet 5 — template audio, no user gesture — **MEASURED on the OSC axis: PASS; audibility PENDING-OWNER**

Fixture added for this bullet (the one allowed fixture):
`tools/template-fixtures/audio-autoplay.html` — **19,976 bytes**, a 1.5 s 440 Hz
stereo MP3 (12,581 B, generated with the install's own ffmpeg `sine=` filter, 64 kbps)
inlined as a base64 data URI, looped; attempts playback with **zero user gesture**
onload and again in `window.play()`; paints each attempt's outcome on-screen.

Run (`b5-audio.ndjson` + OSC `b2-osc-250.ndjson`; frames `b5-audio-*.png`):

- Pass A `PLAY 1-20 [HTML] "file:///…audio-autoplay.html"` →
  `/channel/1/mixer/audio/volume` went **nonzero 297 ms after PLAY-OK**
  (12:57:01.256 → 01.553 UTC+3:30-less; raw ≈ 1.804e8 per channel pair). The looping
  1.5 s clip shows as ~1.5 s nonzero / ~60 ms zero at the loop seam.
- **`MIXER 1-20 VOLUME 0.5` → level halved exactly** (180,474,784 → 90,237,392);
  `VOLUME 0` → 0; `VOLUME 1` → restored ≈1.80e8. MIXER VOLUME affects template audio ✓.
- Pass B (the client path): `CG 1-20 ADD 0 "http://…" 0 "{}"` → **audio reached the
  mixer 0.24 s after ADD**, i.e. while the page was still stage-loaded and hidden,
  because the fixture starts onload. Then `CG 1-20 PLAY 0` → `window.play` restarts →
  sustained nonzero; `CG 1-20 STOP 0` → `window.stop()` pauses → volume back to zero.
  On-screen record: `b5-audio-03-…png` shows
  `onload: PLAYING (no gesture)` / `window.update: {}` / `window.play: PLAYING (no gesture)`.
- **C-019 design note (measured side-effect):** a loaded-but-not-yet-played template's
  audio is already LIVE on the channel. Template audio must be gated on the template's
  own play lifecycle, not on load.
- **Contrast on the plant build (the WHY of this upgrade, measured):** identical
  fixture, identical trigger — `onload: PLAYING (no gesture)` on-screen
  (`b5-233-audio-panel.png`) yet `/channel/1/mixer/audio/volume` stayed **0 across all
  10,339 samples** of the 2.3.2 capture window. CasparCG/server#669 confirmed on the
  plant: on 2.3.x template audio plays but bypasses the channel entirely (system
  device only). On 2.5.0 it is in the mixer. This is the supported-path claim of
  PR #1590, verified end-to-end.
- "Audio is audible on the channel output" (ears): **PENDING-OWNER** (checklist 1) —
  the OSC numbers prove channel-mix presence; the config's `<system-audio/>` consumer
  routes the channel mix to the default sound device, so a listener SHOULD hear the
  tone during the checklist command.

## 6. Bullet 6 — autoplay behaviour — **MEASURED: starts with no gesture, no flag**

- Config's active `<configuration>` has **no `<html>` block at all** (§0) — zero CEF
  flags configured.
- The fixture's zero-interaction onload attempt reports **`onload: PLAYING (no
gesture)`** on 2.5.0 (frame `b5-audio-00-…png`), and OSC shows the mixer nonzero
  297 ms after PLAY. **Verdict: audio autoplay starts with no gesture and no CEF flag
  on 2.5.0's CEF 142.** (Same observed on the plant's CEF ~71 — autoplay was never the
  blocker; routing was, see §5.)

## 7. Bullet 7 — Windows first-packet behaviour + clean shutdown — **shutdown MEASURED; the leak is NOT machine-decidable on this config**

- **The brief's shutdown verb does not exist:** `QUIT` → **`400 ERROR`** on 2.5.0
  (`b7-quit-250.ndjson`) **and** on the plant build (`b7-quit-233.ndjson`). The AMCP
  shutdown verb is **`KILL`** (CHANGELOG lines 1204–1205). No window was ever closed.
- **Clean shutdown (MEASURED, both builds):** `KILL` → `202 KILL OK` → orderly log
  sequence (`video_channel Uninitializing` → asio shutdown → consumers uninit →
  `Successfully shutdown CasparCG Server.`) → all processes exited, port 5250
  released. 2.5.0 log at 15:40:03, plant log (`D:\programs\CasparCG\log\caspar_2026-07-28.log`)
  at 15:48:59. Contrast: the unclean stop of the 13:42 instance (§1) logged **nothing** —
  the shutdown block's presence is the clean/unclean discriminator.
- **First-packet leak:** on this config it is **structurally unobservable**, by machine
  or by ear: `<system-audio/>` is an active consumer, so the channel mix legitimately
  plays out the default sound device — a "leak" of template audio to that same device
  cannot be distinguished from correct output. Nothing anomalous was observed in the
  logs at first-audio or at shutdown, and no double-audio artefact is visible in the
  OSC stream, but that is weak evidence. Deciding it needs a listener AND a config
  without `<system-audio/>` — owner checklist item 4. **Verdict: still unmeasured.**
- Startup observation: both boots today were clean and warning-free; nothing in either
  boot log suggests an audio-device grab at start.

## 8. Escape-sweep re-run — **MEASURED: PROVISIONAL qualifier RESOLVED (confirmed)**

`node tools/caspar-amcp-probe/bin/caspar-amcp-probe.mjs --sweep` against **both**
servers (results: `escape-sweep-2.5.0-stable.results.json`,
`escape-sweep-233.results.json`). Programmatic equality:

- June "dev build" sweep (`casparcg-2.5.0-69e8ad5/`) ≡ today's 2.5.0 **Stable** sweep —
  expected, since Stable IS `69e8ad5` (§0).
- Today's 2.5.0 sweep ≡ today's **2.3.2 plant** sweep — the 2.3.x hardware pass that
  B-041's record said was owed has now been run on the actual plant build.

Matrix (both builds, identical): `js-escape+amcp-escape` is the **only byte-exact
winner** (`fire/parse/bytes = YES/YES/YES`, all nine character classes ✓);
`…+uXXXX-controls` passes all classes but is not byte-exact; all seven other
candidates fail exactly as the two-layer model predicts. **The probe README's "2.3.2
conclusions PROVISIONAL — no 2.3.2 build available that session" qualifier is resolved
in the CONFIRMING direction: the canonical rule is now hardware-validated on 2.3.2
`4de6d18f` and on 2.5.0 Stable `69e8ad5`.** (Locking it into `escape.ts` remains the
separate follow-up change per B-041 — out of recon scope.)

## 9. PR #1590 provisional limitations — verdicts

| Limitation (as recorded in C-018)                  | Verdict                                        | Reason                                                                                                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integer framerates only (59.94 unsupported)        | **Still unmeasured — and moot for this plant** | Both configs here are integer-rate (720p**50**, 1080i**50**); audio worked at 50 Hz. No 59.94 mode was tested (nothing on this box runs one), so the upstream claim is neither confirmed nor refuted. |
| Windows first-packet audio leak to system speakers | **Still unmeasured**                           | Structurally unobservable while `<system-audio/>` is a consumer (§7); needs owner ears + a temporary consumer change (checklist 4). Weak negative evidence only.                                      |
| Linux path lightly tested                          | **Still unmeasured**                           | This is the Windows playout box; no Linux CasparCG was run. Unrelated to the repo's separate Linux `gate:e2e` debt.                                                                                   |

## 10. Tooling notes

Existing tools covered every case: `amcp-poke` (all scripted AMCP), `osc-capture` +
`analyze.mjs` (OSC), `caspar-amcp-probe` verb/escape/lifecycle probes, `PRINT`
(server-side stills; 2.5.0 additionally honours a filename argument —
`PRINT 1 "name"` — which 2.3.x era docs don't have; bare `PRINT` names files
per-second and silently overwrites within the same second). No new probing tool was
needed or written. Two pieces of throwaway session glue lived in the scratchpad only
(a 40-line static file server so CEF could load repo templates over HTTP, and a
window-capture script that was abandoned in favour of `PRINT` once the SFML window
proved uncapturable via PrintWindow). The one committed artifact is the audio fixture
`tools/template-fixtures/audio-autoplay.html` that bullet 5's brief explicitly allows.

State left behind: **2.5.0 Stable running** (fresh boot, `VERSION` verified), 2.3.2
shut down cleanly — rollback preserved. Both servers' `media/` dirs contain this
session's PRINT PNGs (copies live in the evidence dir).

---

## Owner checklist

C-018 stays open until these are answered — each is something only a human at the box
can confirm:

1. **Audio audible on channel output (2.5.0).** With 2.5.0 running, run
   `node tools/spikes/amcp-poke/amcp-poke.mjs` and type
   `PLAY 1-20 [HTML] "file:///D:/work/projects/claude-projects/cg-broadcast/cg/.claude/worktrees/test-d0107d/tools/template-fixtures/audio-autoplay.html"`
   — a 440 Hz tone should loop from the default sound device (that IS the channel mix
   via `<system-audio/>`). `CLEAR 1-20` to stop. Confirms §5's OSC numbers with ears.
2. **Persian template: font identity + shaping/RTL eyeball.** Look at
   `tools/caspar-amcp-probe/evidence/2026-07-28-c018-validation/b4-233-http-01-settled.png`
   (plant) vs `c018-anim-05.png` + `c018-anim-10-rightview.png` (2.5.0): confirm the
   rendering is acceptable and identical, and whether the glyphs are actually
   Vazirmatn (the `@import` needs network) or a fallback. Note both builds show the
   RTL text anchored at the LEFT edge (template-runtime behaviour, separate task
   filed) — judge whether that blocks anything.
3. **Animation on live output (2.5.0).** Re-run checklist 1's command with the Persian
   template URL and watch the screen consumer: does the lower-third animate in over
   ~1 s, or snap? §4's captures saw only settled frames from t+0.73 s.
4. **First-packet leak (the one PR #1590 reported).** Only decidable with
   `<system-audio/>` temporarily removed from the 2.5.0 config's consumers (config
   changes were out of recon scope): with only `<screen/>`, play the audio fixture and
   listen — any tone from the speakers is then a genuine leak. Also listen at `KILL`.
   Until then this stays unmeasured.
5. **Decklink pass.** Everything above used the screen consumer only (this box feeds
   air). Per C-018, a Decklink pass is owed before anything on-air depends on 2.5.0 —
   name in writing which card/output is safe to use, and it can be scheduled.
6. **Channel format decision.** The rebuilt 2.5.0 config is stock `720p5000`; the
   plant runs `1080i5000`. The 1920×1080 templates overflow a 720p channel (that is
   why §4 needed `scrollTo`). Confirm whether the 2.5.0 config should move to
   `1080i5000` before the upgrade change is written (a config edit was out of recon
   scope).
7. **Shutdown runbook wording.** The shutdown verb is `KILL` (`QUIT` → `400 ERROR` on
   both builds). Update operator habit/runbooks accordingly when the upgrade change
   lands (the stale-reference sweep is the follow-up change's job, not this recon's).
