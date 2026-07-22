# video-convert — D-128 Phase 1 spike (in-browser ffmpeg.wasm conversion)

Proves, on this machine and then on real hardware, that the D-128 conversion pipeline is
viable: in-browser ffmpeg.wasm (single-threaded, npm-delivered), rawvideo/BGRA AVI in,
WebM+alpha out, WORKERFS-bounded memory, measured seek/drift behavior — and produces the two
HTML artifacts that let the owner answer the VP9-vs-VP8 alpha question on CasparCG 2.3.2.

**No schema change, no product surface, no Designer UI.** Per the spikes convention this dir
is outside the build: no `package.json`, no turbo/tsc/eslint coverage; plain `.mjs`/`.html`.
The npm packages (`@ffmpeg/ffmpeg` `@ffmpeg/util` `@ffmpeg/core`) are ROOT devDependencies;
`serve.mjs` maps them to same-origin `/vendor/*` URLs — no binary in git, no LFS, no runtime
network (this RESOLVES the change's "vendored wasm vs git" OPEN item — decision recorded in
`openspec/changes/video-import-element/design.md`).

## THE HEADLINE FINDING — read this first

**In-browser VP9 ENCODE is broken in the current single-threaded core (`@ffmpeg/core`
0.12.10): `libvpx-vp9` crashes the wasm worker with `RuntimeError: memory access out of
bounds` on the first frame (alpha or no alpha, `good` or `realtime` deadline). VP8+alpha
(`libvpx`, `-auto-alt-ref 0`) converts flawlessly through the identical pipeline.**

Consequences, stated precisely:

- The conversion PIPELINE (import → WORKERFS → wasm → WebM+alpha → store) is PROVEN — with
  VP8 as the codec it can produce today.
- The VP9-vs-VP8 question the owner takes to hardware is now TWO-SIDED: even if CEF ~71
  plays VP9+alpha, the in-app converter cannot PRODUCE it until the upstream core bug is
  fixed. If CEF plays VP8+alpha correctly, VP8 is the shipping codec and nothing blocks.
- `artifacts/vp8-alpha-test.html` embeds the IN-BROWSER-converted clip (the real pipeline).
  `artifacts/vp9-alpha-test.html` embeds a SYSTEM-ffmpeg encode of the same fixture
  (playback-on-CEF is independent of in-browser encodability; provenance is stamped in each
  file's `<title>`).

## Claims verified (2026-07-22)

- **C1 — TRUE.** `@ffmpeg/ffmpeg` 0.12.15 + `@ffmpeg/core` 0.12.10 (single-thread) install
  from npm; the wrapper's `load()` takes local `coreURL`/`wasmURL` (`dist/esm/types.d.ts`) —
  no default-CDN path is exercised (we always pass same-origin URLs).
- **C2 — TRUE.** `FFmpeg.mount('WORKERFS', { files: [file] }, dir)` exists
  (`classes.js:223`, worker-side `ffmpeg.FS.mount`, `worker.js:90-95`); the File is read
  lazily in the worker — proven by the big-file run below (1.93 GB in, 3.00 MB peak JS heap).
- **C3 — TRUE.** `tools/spikes/` convention: bare per-spike folder + README, plain
  `.mjs`/`.html`, NO package.json/tsconfig/eslint — deliberately outside turbo/tsc/lint. This
  spike follows it exactly (so "wire typecheck/lint/build per the convention" = wire NOTHING).
- **C4 — TRUE.** Zero `SharedArrayBuffer` references in the single-thread core JS; no
  COOP/COEP headers served; everything works.
- **C5 — TRUE.** Playwright budgets are expect 7 s / test 30 s / webServer 120 s
  (`apps/designer/playwright.config.ts:50-79`). The automated conversion driver is therefore
  a STANDALONE script (below), not a Playwright-runner test: wasm load + convert + a 60 s
  drift harness cannot RELIABLY fit 30 s, and budgets are never raised (B-078).

## How to run

```bash
# 1. serve (node built-ins only; no vite — spikes convention)
node tools/spikes/video-convert/serve.mjs          # → http://127.0.0.1:8199/

# 2. open the page, PICK a video file (picker or drag-drop), convert, eyeball alpha
#    over the checkerboard, run the harnesses, download metrics.json / artifacts.

# 3. or run the whole measured pass headless (writes results/ + artifacts/):
node tools/spikes/video-convert/test.mjs                       # tiny fixture, vp8+vp9, harnesses
node tools/spikes/video-convert/test.mjs --drift-ms 60000      # drift duration override

# 4. big-file bounded-memory run (generate a ~2 GB rawvideo AVI locally first):
node tools/spikes/video-convert/make-big-fixture.mjs 10        # → fixtures/big/ (gitignored)
node tools/spikes/video-convert/test.mjs --big tools/spikes/video-convert/fixtures/big/big-1080p-bgra-10s.avi

# 5. CEF banned-builtins scan over the two artifacts (build the list's package once):
pnpm --filter @cg/eslint-config build
node tools/spikes/video-convert/check-cef.mjs
```

**Local AV caveat:** on this machine a local AV/proxy layer swallows BINARY bodies fetched
over localhost HTTP (Chrome receives a synthesized `204 No Content`; JS/wasm pass). The
page's "Load committed fixture" button uses `fetch()` and may hit this — the FILE PICKER /
drag-drop path (an OS-backed lazy `File`) is unaffected and is what `test.mjs` uses via
`setInputFiles`.

## Measured numbers (this machine: Windows 11, Chrome 150 headless, single-threaded wasm)

### Tiny committed fixture — 64×64, 1.6 s / 40 frames, rawvideo BGRA AVI, 647 KiB

| metric                                                          | value                                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wasm core load (lazy, on first convert)                         | 140–350 ms                                                                                                                                                             |
| VP8+alpha in-browser                                            | **178 ms**, 4 585 B out, `V_VP8` verified                                                                                                                              |
| VP9+alpha in-browser                                            | **CRASH** — `memory access out of bounds` (worker dies; also with `yuv420p` no-alpha and `realtime` deadline)                                                          |
| VP9+alpha via system ffmpeg (same flags)                        | 3 354 B out (artifact provenance only)                                                                                                                                 |
| seek harness (×20 spread, on the VP8 output)                    | max \|Δ\| **0 frames**; latency mean **2.2 ms**, max **4.6 ms**                                                                                                        |
| hold-loop drift harness (60 s loop of [0.2 s, 1.4 s], rAF wrap) | 49 wraps; \|drift\| mean **12.8 ms**, max **26.6 ms**; wrap seek mean **0.9 ms**, max **1.3 ms**; wrap overshoot max 12.9 ms; **0 corrections** at the 80 ms threshold |
| peak JS heap during convert                                     | no sample — the convert finishes inside one 200 ms sampler tick                                                                                                        |

### Generated big file — 1920×1080, 10 s / 250 frames, rawvideo BGRA AVI, **1.93 GB**

| metric                      | value                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VP8+alpha in-browser        | **40.7 s** (≈ 6.1 fps encode), 659 464 B out                                                                                                              |
| peak JS heap during convert | **3.00 MB** — the 1.93 GB input is never copied through JS; WORKERFS reads it lazily (the bounded-memory claim, proven)                                   |
| caveat                      | `performance.memory.usedJSHeapSize` is Chrome-only and does not fully count wasm linear memory (which holds a few frames of encoder state, not the input) |

Raw data: `results/metrics-fixture.json`, `results/metrics-bigfile.json` (the page's
"Download metrics.json" produces the same shape).

What the drift numbers mean for the design (`design.md` D3): with a driver-commanded rAF
wrap, `<video>` stays within ~27 ms of the expected clock over 60 s and wrap seeks land in
~1 ms — the "resume/wrap-only correction" cadence is comfortably sufficient at this clip
size; no per-tick correction was ever triggered. Re-measure on a broadcast-size clip when
the owner runs the real archive file.

## Owner runbook — the two things Phase 1 still needs from you

### 1 · Convert the REAL archive AVI with the page

```bash
node tools/spikes/video-convert/serve.mjs
# open http://127.0.0.1:8199/ in Chrome
```

Pick (or drag-drop) your rawvideo/BGRA archive AVI — do NOT pre-convert it. Convert as
VP8+alpha; eyeball the result over the checkerboard; run the seek + drift harnesses (set
`loop t1/t2` inside your clip's hold region); Download `metrics.json` and attach it to the
PR. If VP9 matters to you, note that the VP9 button currently CRASHES the in-browser
converter (see the headline finding) — that is expected, not your machine.

### 2 · Drop both artifacts on real CasparCG 2.3.2

Copy `artifacts/vp9-alpha-test.html` and `artifacts/vp8-alpha-test.html` into the CasparCG
template dir, then on a channel with a COLOUR-BARS (or any video) background layer beneath:

```
PLAY 1-10 AMB LOOP                    # or your bars/video background
CG 1-20 ADD 1 "vp9-alpha-test" 1
# … watch, then:
CG 1-20 CLEAR
CG 1-20 ADD 1 "vp8-alpha-test" 1
```

What to look for, per codec:

- **alpha punch-through** — the page background must be fully transparent: bars visible
  everywhere except the moving red box (an opaque black/white page = that codec's alpha does
  not decode in CEF ~71);
- **edge fringing** — dark/light halo around the box edge (premultiplication errors);
- **frame pacing** — the box must crawl smoothly; stutters/freezes = decode too slow.

Record per artifact: plays at all / alpha correct / edges clean / pacing clean. That verdict
closes the change's "CEF ~71 VP9+alpha" OPEN item (VP8 fallback per `design.md` if VP9
fails — and note VP9 currently cannot be produced in-app regardless).

## Fixture reproducibility

`fixtures/box-64x64-bgra.avi` (committed, 647 KiB) was generated ONCE with system ffmpeg
(`make-fixture.mjs`, exact command inside). The multi-GB file is generated locally with
`make-big-fixture.mjs` (output gitignored — never commit it).

## Files

| file                                        | role                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve.mjs`                                 | static server (node built-ins), maps npm `@ffmpeg/*` → same-origin `/vendor/*`                                                                                      |
| `index.html` + `app.js`                     | the spike page: picker/drag-drop → WORKERFS → convert (VP9/VP8, progress, cancel) → checkerboard eyeball → seek/drift harnesses → artifacts + metrics               |
| `test.mjs`                                  | headless driver (repo Playwright, system-Chrome fallback): fixture pass, codec assertions, harnesses, artifacts, metrics; `--big <path>` for the bounded-memory run |
| `make-fixture.mjs` / `make-big-fixture.mjs` | fixture generators (system ffmpeg)                                                                                                                                  |
| `check-cef.mjs`                             | points the repo's curated `CEF_BANNED_BUILTINS` list at the two artifacts (both ✓ clean vs Chromium 71)                                                             |
| `artifacts/`                                | the two committed hardware test pages                                                                                                                               |
| `results/`                                  | committed measured metrics from this machine's runs                                                                                                                 |
