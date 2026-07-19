# Tasks — protect video layers (R-015)

## 1. Mock fidelity (prerequisite for wire tests)

- [x] 1.1 `@cg/amcp-mock`: media `PLAY`/`LOAD` record `producer: 'ffmpeg'` (HTML keyword or
      http(s) URL still → `html`); widen the `LayerState.producer` type.
- [x] 1.2 Ripple: `clear-all-broadcast-safety` asserts the `.mov` program feed as `ffmpeg`
      (the mock's `html` was its lie; the test's own point gets stronger).

## 2. Bridge prohibition

- [x] 2.1 `@cg/shared-ipc` `layers.clear`: add `'foreign'` to the refusal reason enum, with
      the contract documented on the channel.
- [x] 2.2 `clearLayer`: refuse `foreign` unless the current primary's occupancy tap has a
      FRESH observation of the layer reporting `html`. `owned` still refused first; the
      html-orphan path unchanged.

## 3. Banner split

- [x] 3.1 `OrphanLayersBanner`: html orphans keep the amber `role="alert"` strip and
      confirm-gated Clear verbatim; non-html orphans render in a separate NEUTRAL strip
      (normal text tones, no alert role, no Clear control at all), naming layer + kind with
      honest copy. Unrecognised kinds render as video (fail-safe).
- [x] 3.2 `MockRuntime` parity: `clearLayer` mirrors the `foreign` refusal (non-html orphans
      refuse; html orphans resolve); the `CG_E2E_ORPHAN` seed gains a video layer.

## 4. Tests

- [x] 4.1 Bridge integration (`protect-video-layers.integration.test.ts`): `ffmpeg` orphan
      surfaces with its kind; `clearLayer` refuses `{ ok: false, reason: 'foreign' }` AND no
      CLEAR reaches the wire; html orphan still clears; unobserved layer refuses `foreign`.
      Cleanup in `afterEach`; green isolated AND under full parallel `pnpm test`.
- [x] 4.2 Banner DOM test: html → alert + Clear; `ffmpeg` → neutral, no Clear, no alert
      role; `decklink` (unrecognised) → same as video.
- [x] 4.3 E2E (`orphan-layers.spec.ts`): seeded video layer renders neutrally with no Clear
      while the html orphan's Clear flow still passes.

## 5. PRD + follow-up

- [x] 5.1 `docs/prd/runtime.md`: R-015 → `[~]`, owner's producer-kind rule recorded, change
      dir noted.
- [x] 5.2 File the allocation-path hole (Add-item adopt-CLEAR can destroy an in-range
      foreign producer; `LayerManager`'s dead collision/quarantine wiring is the natural
      seam) as a NEW caspar PRD item — number verified free against merged main AND sibling
      branches immediately before commit.

## 6. Gate

- [ ] 6.1 `pnpm openspec validate runtime-protect-video-layers --strict`.
- [ ] 6.2 `pnpm gate` green (uncached).
- [ ] 6.3 `pnpm gate:e2e` with no bridge/mock/dev server competing for CPU.
