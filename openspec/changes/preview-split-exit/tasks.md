# Tasks — split exit (D-105)

## 1. Runtime — content exit primitive

- [ ] Add `fadeOut(durationMs): Promise<void>` to `ticker-driver.ts`,
      `clock-driver.ts`, `sequence-driver.ts` (CSS opacity transition on the root
      node + `clock.setTimeout` resolve); add/confirm an immediate `hide()`.
- [ ] `runtime.ts`: `animateContentOut(durationMs)` aggregates every scope's
      content `fadeOut` across the D-104 `instanceChildren` tree (Promise.all).
- [ ] `runtime.ts`: extract `playBackgroundOutroAndSettle()` (today's `stop()`
      body — the cascade outro).

## 2. Runtime — out() vs stop()

- [ ] `out()`: `await animateContentOut()` → `playBackgroundOutroAndSettle()`;
      re-entrancy guard (a `stop()`/`play()` mid-fade hard-clears / restarts).
- [ ] `stop()`: `hideContentNow()` (halt + hide content immediately) →
      `playBackgroundOutroAndSettle()`. Preserve the D-085 cleared end state.
- [ ] Expose `window.out` via the CasparCG globals adapter (next to
      `window.stop` / `window.remove`).

## 3. Designer — transport UI + preview wiring

- [ ] `PreviewTransport.tsx`: add an **Out** button (lucide icon + tooltip)
      alongside Stop; momentary, never "pressed".
- [ ] `PreviewModal.tsx` + the `PreviewDispatch` type: `onOut` handler + `out`
      dispatch (`post({ action: 'out' })`).
- [ ] `preview.ts`: handle `action: 'out'` → `window.out()`.

## 4. Tests

- [ ] Runtime: `out()` fades content out THEN plays the background outro
      (content opacity reaches 0 / fade promise resolves before the outro frames),
      then settles cleared.
- [ ] Runtime: `stop()` removes content immediately, then the background outro
      plays (content already hidden during the outro), then settles cleared.
- [ ] Runtime: a `stop()` during an in-flight `out()` hard-clears (no stuck state).
- [ ] Regression: existing stop-cleared behavior + nested cascade unchanged.
- [ ] Designer E2E: Out → content exits then the background closes (coordinated);
      Stop → content gone immediately, background still animates closed.

## 5. Gate

- [ ] Part of the ONE combined gate with D-106 (turbo `--force`: format:check +
      typecheck + lint + test + build) across `@cg/template-runtime` + `@cg/designer`.
- [ ] `pnpm openspec validate preview-split-exit --strict`.
