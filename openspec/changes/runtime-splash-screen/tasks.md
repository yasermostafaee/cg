# Tasks — startup splash screen (R-035)

## 1. The timing contract (pure, testable)

- [x] 1.1 `apps/runtime/src/renderer/splashTiming.ts` — a pure module: `SPLASH_COLD_FLOOR_MS`
      (5000), `SPLASH_WARM_FLOOR_MS` (600), `SPLASH_CEILING_MS` (20000), `splashFloorMs(cold)`,
      and `splashDismissAt({ firstPaintAt, bootDoneAt, coldStart })` returning
      `min(max(firstPaintAt + floor, bootDoneAt), firstPaintAt + ceiling)`. No timers, no DOM, no
      `Date.now()` inside — every input is a parameter.
- [x] 1.2 `apps/runtime/tests/splashTiming.test.ts` — cold ≥ 5000 ms; warm ≥ 600 ms; a boot slower
      than the floor EXTENDS the hold; the ceiling fires with boot still incomplete
      (`bootDoneAt: undefined`); the ceiling wins over a boot that lands after it; `done()` twice
      is idempotent (asserted on the pure function AND on the inline runtime in 2.4).

## 2. The splash itself (paints before the bundle)

- [x] 2.1 `apps/runtime/index.html` — splash markup inside `<body>` BEFORE `#root`
      (`role="status" aria-live="polite"`), the safe-area corner brackets, the BRAND SLOT SVG
      (one documented swap point), wordmark, rule, company, tagline, rail + readout, and the foot
      carrying `<!-- CG_BUILD_STAMP -->` and `CASPARCG · AMCP + OSC`.
- [x] 2.2 Critical CSS inline in the same document — dark console, sky accent, entrance stagger,
      `prefers-reduced-motion` block. Every mirrored token literal carries a comment naming the
      `--r-*` token it mirrors. A system font stack: the splash must not wait on a webfont.
- [x] 2.3 Inline `<script>` — reads `__CG_SPLASH_DISABLED__` FIRST (set ⇒ remove the element and
      stop, no clock, no timers), stamps `firstPaintAt`, reads/writes the `CG_RUNTIME_SESSION`
      `sessionStorage` marker inside `try`/`catch`, and exposes `window.__CG_SPLASH__` with
      `phase(key)` and an idempotent `done()`. Arms the ceiling at t0. Fades ~450 ms then REMOVES
      the element.
- [x] 2.4 `apps/runtime/tests/splash.dom.test.ts` — extract the inline script + style from the real
      `index.html` and drive them in jsdom: the disabled global removes the element; phases advance
      the rail by completed phase and the readout shows `n / 4`; `done()` twice schedules once; the
      ceiling dismisses with boot incomplete.

## 3. Real phase call sites

- [x] 3.1 `main.tsx` — `PROBING BRIDGE` immediately before `createRuntimeBridge()`,
      `STARTING INTERFACE` after it resolves and before the app render, and `done()` from a mount
      effect (the first React commit). `INITIALIZING` is emitted inline at first paint. All calls
      optional-chained.
- [x] 3.2 Verify no synthesised step: the phase list is exactly the steps that exist in the boot
      path. The bare `Connecting to bridge…` pre-render is removed — the splash IS that state now.
- [x] 3.3 NO TERMINAL `READY` LABEL — three labels for three work steps. `done()` fades the label
      out (350 ms, opacity only) and the counter carries the remaining hold; the readout's left
      side goes empty. Replaces the earlier `[data-done] → success green` rule. A test greps the
      whole of `index.html` and fails if `READY` reappears in the markup, the CSS or the script.

## 4. The build stamp — one source, two consumers

- [x] 4.1 `apps/runtime/vite.config.ts` — a plugin computing `{ version, sha, builtAt }` ONCE.
      `shortShaOrFallback()` wraps `git rev-parse --short HEAD` and falls back to `'nogit'` on any
      throw / non-zero exit / empty output, so a tree without `.git` still builds.
- [x] 4.2 Feed both consumers from that one object: `transformIndexHtml` (`order: 'pre'`) replacing
      `<!-- CG_BUILD_STAMP -->`, and `define: { __CG_BUILD__ }` for a later status/about surface.
- [x] 4.3 Render `sha · builtAt` only — no `v0.0.0`. Exactly ONE comment at the render site saying
      to prefix `v${version}` when the project starts tagging releases.
- [x] 4.4 Tests assert the SHAPE (`/^([0-9a-f]{7,}|nogit) · \d{4}-\d{2}-\d{2}$/`) and non-emptiness,
      never the literal stamp — it changes every build.

## 5. Tokens

- [x] 5.1 Add the splash tokens to `theme.ts` `cssVars` AND `controls.css` `:root` with identical
      values; `tests/tokenParity.test.ts` stays green.
- [x] 5.2 `apps/runtime/tests/splashCss.test.ts` — parse the inline `<style>` from `index.html` and
      assert (a) every mirrored literal equals its `cssVars` token, and (b) NO red is reachable:
      no `red`, no `--r-danger` / `--r-onair` reference, and no red-dominant hex.

## 6. The test-suite door and the E2E

- [x] 6.1 `tests/e2e/fixtures/runtime.ts` — the `app` fixture sets `__CG_SPLASH_DISABLED__ = true`
      in its init script, so every existing spec is untaxed. Its own global, not an overload of
      `CG_E2E`.
- [x] 6.2 `tests/e2e/splash.spec.ts` — opts back in by NOT setting the bypass:
      (a) a fresh context holds the splash ≥ 5 s;
      (b) `page.reload()` in the same context dismisses well under the cold floor;
      (c) with the bridge refused the splash still dismisses and NOT CONNECTED is shown;
      (d) `prefers-reduced-motion: reduce` renders the splash with no entrance animation.
- [x] 6.3 Measure the Playwright suite wall-clock BEFORE and AFTER; report both. Stop and report
      rather than ship if the regression exceeds ~10 s.

      **Result: median +3.7 s for five added tests — inside the budget.** Baseline 41 tests,
      median **46.6 s** (n=9). Branch 46 tests, median **50.3 s** (n=10). Measured INTERLEAVED
      (checkout → build → run, alternating arms) because a single before/after pair is worthless
      here: this host's suite is BIMODAL, with a ~45 s mode and an occasional ~80 s mode. The
      slow mode appears in BOTH arms — the baseline's own worst run was 70.7 s against the
      branch's 83.6 s — so it is host noise, not the splash. Per-test durations confirm it: the
      two long splash specs are 8.7 s and 7.0 s, sitting in the same band as existing tests at
      7.0 / 6.8 / 6.7 s. The first "before" figure taken (68 s) was a cold first run and is
      discarded; every number here is from a warmed host.

## 7. Gate

- [x] 7.1 `pnpm gate` green (uncached) and `pnpm format:check` clean.
- [x] 7.2 `pnpm openspec validate runtime-splash-screen --strict` green.
- [x] 7.3 `git diff --stat` shows ZERO lines changed in `createRuntimeBridge.ts`,
      `WebSocketRuntime.ts`, `MockRuntime.ts`, `tools/**`, `apps/designer/**` and `packages/**`.

## 8. Debt owed (NOT discharged by this change)

- [x] 8.1 **A Linux `gate:e2e` is OWED** — this change alters UI and rendering, and a green Windows
      `gate:e2e` is a signal, never the discharge. Must run before archive.
      **DISCHARGED 2026-08-08** by a COMPLETED, GREEN `e2e` job on GitHub Actions
      (`ubuntu-latest`), commit `a344cd2`, which carries this change:
      <https://github.com/yasermostafaee/cg/actions/runs/31252541925>
      Run conclusion `success`; both Playwright suites ran for real (runtime **62 passed
      (2.1m)**, designer **237 passed (7.7m)**, 0 failed, 0 flaky) — `test:e2e` is
      `"cache": false` in `turbo.json`, so it cannot be a cache replay. This change's own
      specs passed on Linux: `apps/runtime/tests/e2e/splash.spec.ts` all 6 (the 8s cold-start
      hold, the phase-label handoff, the refused-bridge dismissal, the build stamp, and both
      reduced-motion specs), plus the designer's 6 splash specs.
- [ ] 8.2 The APASAI mark and brand colours are PLACEHOLDERS. The swap point is the single BRAND
      SLOT `<svg>` in `index.html`; replacing it is a later task once the real mark exists.
- [ ] 8.3 No in-application about/version surface is built here. When one lands it reads
      `__CG_BUILD__` — it does not re-derive a second stamp.
- [ ] 8.4 The Runtime's UI font still comes off a CDN. This change made that link
      non-render-blocking (it blocked the first paint, which its own acceptance forbids) and
      nothing more; moving the app UI onto the self-hosted `fonts.css` faces is its own item.

All four are written up with their reasoning in `DEBT.md` beside this file.
