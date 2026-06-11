# Tasks — add-clock-element

## 1. Schema (@cg/shared-schema)

- [x] 1.1 `ClockElementSchema` (`type: 'clock'`; base + ticker's text-styling
      subset (`font`, `color`, `colorFill?`, `textShadow?`,
      `backgroundColor?`, `backgroundFill?`, `cornerRadius?`, `padding?`),
      `align: 'start'|'center'|'end'` default `'center'`,
      `mode: 'wall'|'countup'|'countdown'`, `format` min-1 default
      `'HH:mm:ss'`, `digits: 'latin'|'persian'|'arabic-indic'` default
      `'persian'`, `target?: { kind:'duration', ms: positive int } |
{ kind:'datetime', iso: ISO-8601 }`) + superRefine: countdown requires
      target; added to the Element union/exports
- [x] 1.2 Schema unit tests: valid wall/countup/countdown clocks; countdown
      without target rejected; bad target shapes rejected; defaults applied

## 2. Runtime (@cg/template-runtime)

- [x] 2.1 `clock-format.ts` (pure): longest-token-first tokenization of
      `HH H hh h mm m ss s A a`; literals pass through; largest present unit
      absorbs overflow (`mm:ss` → `90:00`); count modes: `hh`/`h` as
      `HH`/`H`, `A`/`a` → `''`; wall local time (24h/12h); digits mapped
      LAST via `@cg/text-shaping`
- [x] 2.2 `buildClock` in `scene-builder.ts`: dataset `cgElementId` +
      `applyBaseStyles`; band-subset box styling
      (background/fill/radius/padding); inner time span `direction: ltr;
unicode-bidi: isolate; font-variant-numeric: tabular-nums`,
      flex-aligned per `align`; static initial render (wall = now at build,
      countdown = full target, countup = zero); `ctx.scope.clocks.push(
{ element, node })` with `clocks: []` at every scope-creation site
- [x] 2.3 `clock-driver.ts`: `ClockDriver` — options `{ node, mode, format,
digits, target?, clock? }`; surface `start/pause/resume/stop/reset/
destroy/whenComplete`; rAF on the normalized clock; repaint only when
      the formatted string changes; relative modes by accumulated active
      time (pause-freeze, no-jump resume); absolute modes from `clock.now()`
      each paint (resume = true value); countdown clamps at 0 and resolves
      `whenComplete()` exactly once per run; `reset()` mints a fresh
      promise; past datetime target paints 0 and resolves on run start
- [x] 2.4 `runtime.ts` wiring, parallel to tickers: per-scope ClockDrivers
      from `scope.clocks`; content wait = `Promise.all` over [finite
      tickers, COUNTDOWN clocks] (wall/countup excluded); hold entry resets + starts clocks alongside tickers (generalize the ticker-only
      `onHoldStart`/`waitForContent` conditions); play() cascade also
      resets + starts clocks (wall/datetime tick during the intro);
      pause/resume/stop/settle/remove/destroy cascades include clocks;
      `tick(frame)` untouched
- [x] 2.5 Unit tests (injected RuntimeClock, no real rAF): formatter
      table-driven (tokens, overflow absorption, literal passthrough,
      persian + arabic-indic digits, count-mode hh/A behavior); driver
      repaint-only-on-change; countdown-duration completes exactly at 0 and
      clamps; datetime-past immediate completion; pause/resume (relative
      no-jump vs absolute true-now); loop-cycle re-runs the count each hold
      entry; content-driven hold with countdown only; mixed
      ticker+countdown (`Promise.all`); wall/countup never holding; stop()
      during a countdown hold = immediate hard out; scene-builder
      golden/static-render coverage for `buildClock`
- [x] 2.6 Doc-sync: `packages/template-runtime/README.md` (ClockDriver
      section beside TickerDriver; self-wire/content-completion wording;
      extension-point worked-example pointers);
      `docs/engines/overview.md` if it mentions ticker-only completion

## 3. Designer UI

- [x] 3.1 Clock tool `{ id: 'clock', label: 'Clock', icon: '◷' }` in the
      canvas toolbar + placement branch in the canvas overlay;
      `defaultClock` in `state/element-defaults.ts` (wall, `'HH:mm:ss'`,
      digits `'persian'`, Vazirmatn 600/48, transform ≈320×84, color
      `#FFFFFF`, align `'center'`, transparent background); any
      element-type switch that must learn `'clock'` (timeline icon etc.)
- [x] 3.2 `ClockSections` in `features/inspector/StyleSection.tsx` modeled
      on `TickerSections`: pinned "Clock" CollapseSection (Mode select;
      Format input with token hint; Digits select; countdown target editor
      — Duration/Date-time kind toggle, duration edited in SECONDS ↔
      stored ms, datetime via `<input type="datetime-local">` ↔ stored
      ISO) + time-driven note + `TextStyleSection` reuse; NO
      DynamicDataSection for clock
- [x] 3.3 `PlayoutSection.tsx`: `hasContentElement` also true for
      countdown clocks; content-driven copy generalized ("until the
      content completes (ticker passes / countdown reaching zero)")
- [x] 3.4 Designer unit coverage where sibling suites exist (element
      defaults / inspector smoke)

## 4. Export/GDD assertion

- [x] 4.1 Test: a clock scene's single-file export boots clean and its GDD
      is unchanged vs. the same scene without the clock (no exporter code
      changes expected)

## 5. E2E + gate

- [x] 5.1 `apps/designer/tests/e2e/clock.spec.ts` mapping the spec
      scenarios through the real UI (extend `fixtures/designer.ts` with
      `addClock` etc.): add clock → canvas shows Persian-digit time
      (`/[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}/`) → wall ticks in the preview (text
      changes within ~1.5s of play) → switch to countdown duration=2s +
      auto-out + content-driven hold via PlayoutSection → preview plays,
      holds, and exits on its own shortly after zero; run via
      `pnpm test:e2e`
- [x] 5.2 Green gate per CLAUDE.md for touched workspaces (format:check +
      typecheck + lint + test + build), test task run uncached at least
      once (`turbo --force`); `pnpm openspec validate add-clock-element
--strict`
