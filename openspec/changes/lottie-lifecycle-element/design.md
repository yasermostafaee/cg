# Design — Lottie lifecycle element (D-125)

> **DESIGN REVIEW CHECKPOINT.** This document is the review gate. No implementation ships until the
> owner signs off on it — especially **§D6 (the element-outro seam)** and **§D5 (the bundle
> recommendation)**. Everything below is grounded in the code as it stands on `origin/main` at
> authoring; where a premise was verified against the source, the file:line is cited.

## Recon summary — what exists vs. what must be added

| Piece                                      | State today                                                                                                                      | This change                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `LottieElementSchema` (`elements.ts:770`)  | `assetId`/`speed`/`loopMode`/`segment?`/`fieldOverrides?`                                                                        | **add** `phases`, `holdBehavior`, `drivesHold`                       |
| `LifecycleSchema` (`scene.ts:29`)          | `outPoint` + `contentStart?` (a **single** out-point, not an intro/outro pair)                                                   | unchanged — the element maps **onto** it                             |
| `@cg/lottie-bridge` import (`import.ts`)   | allowlist validator; returns `{v,fr,ip,op,w,h,nm,raw}` — **no markers**                                                          | **add** marker reading + `markersToSegments`                         |
| `@cg/lottie-bridge` runtime (`runtime.ts`) | `createLottiePlayer` on **full** `lottie-web`; exposes `goToFrame`, `autoplay:false`                                             | **switch** to `lottie_light`; keep the handle                        |
| `lottie` asset kind                        | end-to-end already (`AssetKindSchema`, `KIND_BY_EXT json→lottie`, `AssetStore` writes `assets/lottie/<sha>.json`, `mimeOf`)      | wire the import UI                                                   |
| `scene-builder.ts:156`                     | renders a placeholder div                                                                                                        | mount `createLottiePlayer`                                           |
| `lottie-override` (`bindings.ts:210`)      | literal no-op                                                                                                                    | implement through the bridge                                         |
| Content-driver contract (`runtime.ts:108`) | `{ id, drivesHold, whenComplete }`; `data-cg-content` marker; per-kind drivers with `reset/start/stop/pause/resume/whenComplete` | **add** `LottieDriver` + `scope.lotties`                             |
| Exit cascade (`runtime.ts:1247/1261`)      | `out()` fades all `[data-cg-content]` 400 ms → background; `stop()` hard-hides → background                                      | **add** the element-outro seam                                       |
| `@cg/template-runtime` deps                | does **not** depend on `@cg/lottie-bridge`                                                                                       | add the dep (puts `lottie_light` in the bundle + under the CEF scan) |

---

## D1. Phase mapping — bodymovin markers → segments, mapped ONTO the composition lifecycle

### D1.1 The element's own frame space vs. the composition's lifecycle

A Lottie carries its own timeline in **animation frames** `[ip, op]` at rate `fr` (from the JSON).
The composition ships a **single** lifecycle marker — `LifecycleSchema = { outPoint, contentStart? }`
(`scene.ts:29-32`), verified: **not** an intro-end/outro-start pair. The intro is
`[activeRange.in, outPoint]`, the hold is the held `outPoint`, the outro is
`[outPoint, activeRange.out]` (`designer-playout-lifecycle` spec, "Composition has an IN / HOLD / OUT
lifecycle via a single out-point").

So the element's two markers **cannot** be stored as, or replace, the composition's one marker. They
are mapped **by phase**, not by frame rescaling:

| Composition phase               | Trigger (runtime transition) | Lottie behaviour                                           |
| ------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| IN (`play()` → hold entry)      | `play()`                     | drive `[introStart → introEnd]` **once** at `fr × speed`   |
| HOLD (held `outPoint`)          | intro completes              | **freeze** at `introEnd`, or **loop** `[idleIn → idleOut]` |
| OUT (`out()`/`stop()` → settle) | `out()` / `stop()`           | drive `[outroStart → op]` **once**, then resolve           |

**Decision — the Lottie owns its intro timing (element-time driven), NOT slaved to the composition
IN length.** The element reaches its hold frame when _its_ intro completes, at the authored speed —
it is never stretched/squashed to the background's authored frame count. This is the direct
consequence of "opaque, converts NO keyframes into native ones": re-timing the internal animation to
fit `[activeRange.in, outPoint]` would distort it. The operator sizes the composition IN to
accommodate the intro (an authoring concern, surfaced as Inspector guidance), exactly as they already
size it around a keyframed background entrance.

> _Alternative considered and rejected:_ slave the Lottie so `introEnd` lands exactly at
> `contentStart` (so a ticker appearing at content-start always sees settled furniture). Rejected —
> it requires rescaling the animation's frames (violates opacity) and couples the furniture's natural
> motion to an unrelated marker. The recommended model keeps them independent and phase-aligned.

### D1.2 Markers → segments (owned by `@cg/lottie-bridge`)

bodymovin writes an optional top-level `markers: [{ tm, cm, dr }]` array (`tm` = start frame, `cm` =
comment/name, `dr` = duration frames). `@cg/lottie-bridge` gains a pure `markersToSegments(animation)`:

- **Recognised names (case-insensitive, trimmed):** a marker whose comment is `intro-end` (aliases:
  `introEnd`, `in`, `intro`) sets `introEnd = tm`; `outro-start` (aliases: `outroStart`, `out`,
  `outro`) sets `outroStart = tm`. An optional pair `idle-start` / `idle-end` (aliases `hold-start` /
  `hold-end`) sets the idle segment; absent ⇒ the idle segment defaults to `[introEnd, outroStart]`.
- **A "valid" marker set** = at least the two boundary markers resolve, and
  `ip ≤ introEnd ≤ outroStart ≤ op`. A set that is missing a boundary, has out-of-order/out-of-range
  frames, or names nothing recognised is **not** valid → the element falls back to **manual** marking
  and the importer surfaces a one-line "no usable Lottie markers — mark the phases in the Inspector"
  info (not a rejection: an unmarked Lottie is legal, it just has no distinct phases and plays
  intro-only = whole animation once, then freezes at `op`).
- The result is `{ source: 'markers' | 'manual', introEnd, outroStart, idleIn, idleOut }` in
  **animation frames**, stored on the element (see D2.1). `markersToSegments` is unit-tested in
  `@cg/lottie-bridge` (the PRD-required "marker→segment mapping" test).

Manual marking (no markers, or operator override) writes the same fields from Inspector number
inputs, clamped to `ip ≤ introEnd ≤ outroStart ≤ op`.

---

## D2. Schema additions & hold behaviour

### D2.1 `LottieElementSchema` additions

```
phases: z.object({
  introEnd:   z.number().nonnegative(),   // animation frame; intro plays [ip, introEnd] once
  outroStart: z.number().nonnegative(),   // animation frame; outro plays [outroStart, op] once
  idle: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(), // idle-loop range
  source: z.enum(['markers', 'manual']),
}).optional(),                            // absent ⇒ no phases: intro = whole clip, freeze at op, empty outro
holdBehavior: z.enum(['freeze', 'idle-loop']).default('freeze'),
drivesHold: z.boolean().optional(),       // INVERSE default: absent ⇒ does NOT drive the hold
```

- `phases` is **optional + additive** — a scene authored before D-125 (bare
  `assetId`/`speed`/`loopMode`) parses unchanged, no schema-version bump. Absent `phases` ⇒ the
  element has no distinct intro/outro (whole clip is the intro, held at `op`, empty outro) — the
  degenerate-but-legal case, and the one the current `segment`/`loopMode` fields already implied.
- `holdBehavior` defaults to `'freeze'` (PRD-locked default). `'idle-loop'` requires a resolvable idle
  segment (from `phases.idle` or `[introEnd, outroStart]`); with none it degrades to `'freeze'`.
- `drivesHold` is deliberately the **inverse** of `TickerElement.drivesHold` (`elements.ts:233`,
  where absent ⇒ participates). For the Lottie, absent/`false` ⇒ does **not** gate the content-driven
  hold; `true` ⇒ opts in. This matches the PRD ("does NOT drive the hold by default … can be opted
  IN") and the composition use case (a ticker on top drives the hold; the furniture holds beneath).
  The runtime reads it as `el.drivesHold === true` (opt-in), never `!== false` (opt-out) — a
  one-line but load-bearing difference from the other content kinds, called out in the code.

### D2.2 Hold behaviour & the Inspector

- **Freeze (default):** at `introEnd` the `LottieDriver` stops advancing and holds `goToAndStop(introEnd)`.
- **Idle-loop (opt-in):** the driver wraps elapsed active time within `[idleIn, idleOut]`
  (`idleIn = phases.idle?.[0] ?? introEnd`, `idleOut = phases.idle?.[1] ?? outroStart`), so the
  furniture breathes on air. The loop is by the injected clock, so it freezes with the scene.
- **Inspector controls (`LottieSections`, mirroring `ImageSections` at `StyleSection.tsx:495`):**
  speed (number), a hold-behaviour select (`Freeze` / `Loop idle segment`), and the phase mapping —
  read-only "from markers" chips when `source: 'markers'`, or intro-end / outro-start / idle-in /
  idle-out number inputs when manual, with a "Re-read markers" action. The animation's internal
  keyframes are never exposed (opaque). `field-registry.ts` keeps `lottie: UNIVERSAL_ONLY` (transform
  - filter animatable; no internal props).

---

## D3. Driven-frame render — the anti-drift architecture (pause/resume lockstep)

**Decision — the Lottie is a RENDERER driven by the runtime's clock, never an autonomous player.**
`scene-builder.ts:156` mounts `createLottiePlayer(container, animationData, { autoplay: false })` and
a new `LottieDriver` advances it with `goToAndStop(frame, true)` (the bridge's `goToFrame`) once per
tick, computing the frame from **elapsed active time × `fr` × `speed`** off the injected
`RuntimeClock` — exactly how `FrameDriver` (`frame-driver.ts:113`) and the ticker/clock/sequence
drivers derive their state.

Why this and not lottie-web's own `play()`/`pause()`:

- **Zero drift by construction.** The Lottie and the rest of the scene read the _same_ clock. There
  is no second wall-clock to diverge from the frozen-hold timers. Pause = freeze the driver's elapsed
  (`elapsedAtPause`), resume = re-base `startedAt` — the identical mechanism as `FrameDriver.pause()`
  / `resume()` (`frame-driver.ts:87-103`). lottie-web's autonomous `requestAnimationFrame` would run
  on real wall time, ignore the injected clock entirely, and drift against a paused/stepped scene.
- **Deterministic under a fake clock.** The PRD-required lifecycle test
  (intro → hold → ticker-driven hold → outro → CLEARED on the injected `RuntimeClock`) is only
  possible if the Lottie advances by the test's clock. An autonomous player advances on real rAF and
  can't be stepped, so the test could never assert the intro→hold→outro frames.
- **The bridge already supports it.** `createLottiePlayer` defaults `autoplay:false` and exposes
  `goToFrame` → `anim.goToAndStop(frame, true)` (`runtime.ts:98-101`). No new player capability is
  needed; the driver is pure orchestration over the existing handle.

`LottieDriver` joins the duck-typed content-driver contract:
`reset()` (jump to `ip`/segment start, re-arm the completion promise), `start()` (begin the intro),
`pause()` / `resume()` (freeze/continue in lockstep), `stop()` (halt), `destroy()` (tear down the
lottie-web instance), `whenComplete()` (see D6.3), plus **`playOutro()` → `Promise<void>`** (the new
seam). It registers under `scope.lotties` and is added to the pause/resume/reset/stop/remove cascades
in `runtime.ts` alongside the existing `for (const sub of subtrees) for (const t of sub.tickers) …`
loops (`runtime.ts:1287-1298`, `1205-1215`).

---

## D4. Player choice — `lottie_light`, and why it stays a candidate

**Decision — `lottie-web/build/player/lottie_light` (SVG renderer).**

- **The decisive property is zero `eval(` / `new Function`.** Eval-based code is the real on-hardware
  blocker under CasparCG's CEF loaded from `file://`; the single-file export's own CSP —
  `default-src 'none'; script-src 'unsafe-inline'` with **no** `'unsafe-eval'`
  (`exporter-single-file.ts:268-269`) — forbids it too, but the hardware is the reason, not the CSP.
  The **full** `lottie-web` build carries the After Effects **expression evaluator** and therefore
  `eval`; the importer already rejects expressions (`import.ts` allowlist), so dropping the evaluator
  costs nothing and the two decisions agree.
- **No WebAssembly, ES5-era, no fetch.** `lottie_light` needs no WASM and its only `XMLHttpRequest`
  is the `path:` loader we never use — we always pass `animationData` inline. This is why
  `@lottiefiles/dotlottie-web` is the **wrong** bet: its WASM core must be fetched and instantiated,
  which both `file://` and `default-src 'none'` forbid.
- **It already scans clean.** With `@cg/template-runtime` depending on `@cg/lottie-bridge`, the
  bundled player lands inside `cgJs`/`cgJsIife` and the existing `cef-compat.test.ts` artifact scan
  (`CEF_BANNED_BUILTINS`) covers it — the gate this change must pass. PRD recon reports lottie-web
  5.13.0 scans clean against all ten needles; this change makes that scan real by wiring the dep, and
  extends the scan to the player bundle if §D5 lands the conditional entry.

**CANDIDATE status (B-066 lesson).** The artifact scan and a modern-Chrome preview prove **nothing**
about 2.3.x CEF. `lottie_light` is confirmed only by a real smoke test on **CasparCG 2.3.x CEF
hardware** (§D7). Recorded as a pre-archive gate.

---

## D5. Bundle strategy — MEASURED both ways (OWNER DECISION)

`bundle-runtime.mjs` runs `minify: false` (`bundle-runtime.mjs:51`), so the export ships the
**unminified** player. Measured on this repo (lottie-web **5.13.0**, esbuild iife / `target:chrome71`,
matching the real bundler config; post-inline = the number that affects CEF boot from `file://`,
which reads the file off disk uncompressed — so **raw** bytes matter more than gzip):

| Artifact                                                                   | raw          | gzip    |
| -------------------------------------------------------------------------- | ------------ | ------- |
| Current `cgJsIife` baseline (no Lottie)                                    | 364.1 KB     | 73.4 KB |
| `lottie_light` bundled contribution, `minify:false` (**as shipped today**) | **425.7 KB** | 68.5 KB |
| `lottie_light` bundled contribution, `minify:true` (for reference)         | 168.3 KB     | 48.3 KB |

Post-inline single-file HTML **script payload** (excludes the scene/fonts/JSON asset, which are equal
either way):

| Strategy                              | export with **no** Lottie    | export **with** a Lottie |
| ------------------------------------- | ---------------------------- | ------------------------ |
| **(a) Unconditional bundle**          | **789.7 KB** (364.1 + 425.7) | 789.7 KB                 |
| **(b) Conditional 2nd esbuild entry** | **364.1 KB** (unchanged)     | 789.7 KB                 |

The Lottie JSON asset itself inlines **on top** of these (a lower-third is typically 20–200 KB of
JSON), the same under both strategies.

**Recommendation — (b) conditional second esbuild entry.** Rationale:

1. The vast majority of exports have **no** Lottie element and would otherwise carry a fixed
   **+425.7 KB** (unminified) they never use — **more than doubling** the on-disk single-file every
   CEF must read from `file://` on boot (364→790 KB). There is no export size budget today, but
   doubling every unrelated template's payload for a feature they don't use is the wrong default.
2. The change is localized and low-risk: `bundle-runtime.mjs` emits a third const (e.g.
   `cgJsLottieIife`); the single-file exporter appends that script only when
   `collectLottieElements(scene).length > 0`; the `.vcg` `Exporter` includes it likewise. The
   `cef-compat.test.ts` scan gains one more artifact to cover.
3. Orthogonal lever (owner may combine): minifying **just** the player entry cuts 425.7 → 168.3 KB
   (~60%) without touching the readable main bundle. Independent of (a)/(b); flagged, not assumed.

**This is an owner call.** (a) is simpler (one bundle, one scan target, no conditional in the
exporter) at the cost of every export. Left for review; the implementation follows whichever the owner
picks. Tasks 8.x are written against (b) with an (a) fallback noted.

---

## D6. THE ELEMENT-OUTRO SEAM (the crux)

### D6.1 The problem

The runtime has **no** "play your outro now" hook. Today (`runtime.ts:1247-1279`):

- `out()` → `fadeContentOut(OUT_FADE_MS=400)` fades **every** `[data-cg-content]` root's opacity to 0
  over 400 ms → awaits → `playBackgroundOutroAndSettle()` (`cascade(rootNode, c => c.stop())`).
- `stop()` → `hideContentNow()` (opacity 0 + `visibility:hidden`, immediate) → background.

A blanket opacity fade is exactly what the Lottie must **not** get — it must play its authored OUTRO
segment (`outroStart → op`) instead. And per the PRD both `stop()` **and** `out()` must play it (so a
scene containing a Lottie changes `stop()` from a pure hard-hide into "play the Lottie outro, then
background"; other content still hard-hides on `stop()`).

The sole precedent is `SequenceDriver`'s D-116 `'exit'` phase (`sequence-driver.ts:126-129, 417-430,
508-521`): the element owns its exit motion (the last item's `transitionOut`) and **`whenComplete()`
resolves LATE** — only after the exit finishes — so the parent's outro fires after the content has
left (content-first / background-last). The Lottie models this, but the **trigger differs**:
SequenceDriver's exit fires on natural content-completion inside a content-driven hold; the Lottie
outro fires on the explicit `out()` / `stop()` command (the Lottie does not drive the hold by
default, so it can't rely on the content-driven completion path).

### D6.2 The seam

Add an **element-outro registry** in `createRuntime`: the set of content roots that own an outro (in
v1, the `LottieDriver`s across every subtree). Each exposes `playOutro(): Promise<void>` — drives
`[outroStart → op]` once off the injected clock, resolving when it reaches `op`.

`out()` / `stop()` change to (pseudocode, preserving the existing generation-token + pause-defer
logic):

```
async out() {
  const gen = ++exitGen;
  const outros = collectElementOutros();          // every subtree's LottieDrivers with an outro
  await Promise.all([
    fadeContentOut(OUT_FADE_MS),                  // ticker/clock/sequence roots — unchanged 400ms fade
    ...outros.map(d => d.playOutro()),            // Lotties play their OWN outro segment concurrently
  ]);
  if (gen !== exitGen) return;                    // superseded by stop()/play()/out() — bail
  if (paused) { pendingExitOutro = true; return; }
  playBackgroundOutroAndSettle();                 // background LAST — content-first preserved
}

async stop() {
  const gen = ++exitGen;
  const outros = collectElementOutros();
  hideContentNow();                               // ticker/clock/sequence — immediate (unchanged)
  await Promise.all(outros.map(d => d.playOutro())); // but the Lottie still plays its outro
  if (gen !== exitGen) return;
  playBackgroundOutroAndSettle();
}
```

- A Lottie root is **excluded from `fadeContentOut`/`hideContentNow`** (it animates itself). It still
  carries `data-cg-content='lottie'` for D-105 selection, but the fade/hide helpers skip nodes whose
  driver is playing an outro (a `data-cg-outro` guard, or filtering `contentRoots()` by the outro
  set). This avoids fighting the driver's `goToAndStop` with an opacity transition.
- `playBackgroundOutroAndSettle` is unchanged — the background cascade and the `onRootSettled`/
  CLEARED settle (D-085) run exactly as today, just **after** the element outros.

### D6.3 `whenComplete()` (content-driven hold) vs. `playOutro()` (exit) — kept separate

Two distinct signals, deliberately not conflated:

- **`whenComplete()`** — used only by the content-driven **hold** aggregation (`runtime.ts:769`,
  `aggregateContentWait`). The Lottie contributes to it **only when `drivesHold === true`** (opt-in,
  D2.1). When it does: a **freeze** Lottie's `whenComplete()` resolves when the intro reaches
  `introEnd` (the hold frame) — a coherent "self-contained sting with no overlay" use case
  (`holdBehavior:'freeze'` + `drivesHold:true` ⇒ hold ends at intro-end ⇒ auto-out ⇒ outro plays). An
  **idle-loop** Lottie that opts in **never** resolves `whenComplete()` (holds until `stop()`, like an
  infinite ticker — `elements.ts:748` precedent).
- **`playOutro()`** — used only by the **exit** seam (D6.2), on every `out()`/`stop()` regardless of
  `drivesHold`. Independent of the hold.

### D6.4 Risks — the B-030/B-031/B-033/B-034 cascade territory, and how we avoid a strand/never-settle

This touches the lifecycle cascade that B-030..B-034 hardened. The specific failure modes and the
design's defence:

1. **A never-resolving outro hangs the background forever (a strand).** `playOutro()` **must** always
   resolve. Defences: a degenerate outro (`outroStart >= op`, or absent `phases`) resolves
   **immediately** (mirrors SequenceDriver's `'none'` edge / zero-duration completing at once,
   `sequence-driver.ts:423-424`); the driver clamps the final paint to `op` then resolves (mirrors
   `FrameDriver.finishOnce`, `frame-driver.ts:121-125`); a driver already destroyed resolves
   immediately.
2. **A superseding command re-opens a settled scene (B-031/B-033 territory).** The existing `exitGen`
   generation token already guards this; `playOutro()` is folded **inside** the same `gen` check, and
   a `play()` bumps `exitGen`, clears `pendingExitOutro`, and calls `restoreContent()` +
   `driver.reset()` (which re-arms the completion promise, the B-033 re-mint pattern,
   `runtime.ts:791`). A second `out()` mid-outro supersedes the first via `gen !== exitGen`.
3. **Pause during the outro must not close the graphic (D-105 pause-aware exit).** The Lottie
   `playOutro()` freezes with the scene (D3), and the existing `paused`/`pendingExitOutro` defer
   (`runtime.ts:1272-1276`, `1299-1303`) still gates `playBackgroundOutroAndSettle` — so a pause
   mid-outro holds the half-played outro frame and the background waits for `resume()`.
4. **`remove()` (hard kill) must not await anything.** `remove()` (`runtime.ts:1315`) stays a
   synchronous teardown: it `destroy()`s every subtree (now including `scope.lotties`) with no outro —
   the true panic path. `stop()`/`out()` are the graceful paths that play the outro.
5. **CLEARED settle with every driver halted.** After the background cascade settles, the LottieDriver
   is `stop()`ped in `stopScopeContent` (extended to halt `scope.lotties`), so no driver is left
   ticking. The lifecycle test asserts the terminal state is CLEARED with the Lottie halted.

---

## D7. Validation & gates

- **This design-only step:** `pnpm format:check` + `pnpm openspec validate lottie-lifecycle-element
--strict`. CI is billing-blocked until ~Aug 1 (a red `required` check is a quota block, not a code
  failure), so those two are the gate for the checkpoint PR.
- **The implementation prompt (next):** full local `pnpm gate` (`format:check` + `typecheck` + `lint`
  - `test` + `build` for every touched workspace, run uncached at least once — `turbo --force` — per
    the stale-cache lesson) **plus** `pnpm gate:e2e` on Linux/WSL/Docker (the Playwright suite builds
    first and runs against `dist/`). Required tests: `markersToSegments` in `@cg/lottie-bridge`; a
    `@cg/template-runtime` lifecycle test on the injected `RuntimeClock`
    (intro → hold → ticker-driven hold → outro → **CLEARED**); exporter tests for `.vcg` (asset bytes
    packed) and single-file (JSON + player inlined, **zero** external requests); the `cef-compat.test.ts`
    artifact scan (extended to the player bundle); an E2E import → place → preview → export.
- **Pre-archive hardware gate (non-negotiable, B-066):** a real smoke test of an exported single-file
  Lottie template on **CasparCG 2.3.x CEF hardware** from `file://` — confirming the player boots,
  renders, plays intro → hold → outro, and issues zero external requests. Modern Chrome does not count.
  Only after this smoke passes does the change archive.

## D8. What stays out of v1 (per PRD)

Converting a Lottie into editable native paths/keyframes; editing the animation internals; AE
expressions (rejected by the allowlist); mask / matte / trim-path fidelity guarantees beyond what
`lottie_light` renders. Field overrides beyond text/colour (image if cheap) are the secondary path —
the native overlay, not the Lottie, carries the dynamic content.
