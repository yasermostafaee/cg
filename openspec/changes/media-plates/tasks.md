# media-plates — tasks

## 0. Establish first (`design.md` §0)

- [x] 0.0 The core facts `LOOK-SWITCH-01` built on apply unchanged
- [x] 0.1 How a held plate is hidden, and where hold and unhold sit in the switch's batch — `PAUSE` after the
      commit that hid the clip, `RESUME` last in the returning plate's staged lines
- [x] 0.2 A clip that is not looping FREEZES on its last frame at its end (`av_producer.cpp:1051–1057`, measured
      `4.00/4.00` on the owner's core) — no mechanism needed; the "comes back black" comment corrected
- [x] 0.3 `PAUSE`/`RESUME` hold and continue; Restart is `CALL … SEEK 0` + `RESUME`; `CALL … LOOP 1|0` on a
      playing clip; OSC `foreground/file/time` — all from the source and measured
- [x] 0.4 `PLAYOUT-SOURCES-01`'s bound-media store has landed (`BoundMediaItemSchema`)
- [x] 0.5 One caller of `canHoldLivePlate` (`releaseLivePlate`), called once, from the release policy
- [x] 0.6 A held clip keeps its band layer exactly as a held input does; the refusal is `live-source-no-layer`

## 1. Build

- [x] 1.A The settings: `loop` / `whenHidden` on the bound-media reference (defaults on a new one, kept across a
      re-read), `mediaPlaybackOf` the one reader, `PlayoutSources.setMediaPlayback`, the operator route
      `sources.set-media-playback` audited with the clip's name; a Loop change reaches a playing clip at once
- [x] 1.B `PLAY … LOOP` for a looping clip; nothing sent at the end of one that is not
- [x] 1.C The look switch: `canHoldLivePlate` answers a clip from its `whenHidden` (exhaustive); a held clip is
      hidden (`hiddenWhenHeld`), muted, parked, and — for `pause` — paused after the commit; the reveal and a
      `RESUME` in the switch's batch; the rollback re-pauses; the reconnect re-send keeps it hidden; the ledger
      records the clip's transport as sent
- [x] 1.D `stack.media-plate-transport` — `PAUSE` / `RESUME` / `CALL … SEEK 0` + `RESUME`, refusals with nothing
      sent, audited; operator class, the row's channel, the lock
- [x] 1.E `liveLayers.media-state` from OSC only (`OscClipTimeTap`), pushed on a change a console would show
- [x] 1.F Hard stops kept: a live input's wire byte-identical (measured against `dbcd0b7b`); the take's order and
      `B-174`'s; `FIELD-FIXES-01-A`
- [x] 1.F′ The send seam lets `PAUSE`, `RESUME` and `CALL` reach only a seated clip of ours (`clipOn`); the
      ledger is written before a take's `PAUSE`s
- [x] 1.G Console: `Playback` beside a bound clip (Look inputs, Source defaults) and its panel; the transport, the
      remaining time and `Paused` / `Ended` on an on-air row; the bridge contract, `WebSocketRuntime`,
      `createRuntimeBridge` and the MockRuntime's parity (`CG_E2E_MEDIA_STATE`)
- [x] 1.H The fakes: the AMCP mock's `PAUSE`, `RESUME`, `CALL … SEEK`/`LOOP`, `PLAY … LOOP` and each clip's clock
      over OSC; the fake station tells it each library clip's length

## 2. Tests

- [x] 2.1 `tools/caspar-bridge/tests/media-plates.integration.test.ts` — the store; pause, restart (control),
      continue; a preset clip; the reconnect; Loop and the freeze; the transport and its refusals; the remaining
      time with and without OSC; take out; band capacity; the live-input wire; the gate (viewer, another channel,
      the lock)
- [x] 2.2 `tests/live-plate-release.test.ts`; `tests/amcp-guard.test.ts`; `@cg/amcp-mock`
      `tests/media-clock.test.ts`; `@cg/caspar-client` `tests/osc-clip-time.test.ts`; `@cg/shared-ipc`
      `tests/playout-sources.test.ts`
- [x] 2.3 Console: `apps/runtime/tests/mediaPlates.dom.test.ts`; e2e `apps/runtime/tests/e2e/media-plates.spec.ts`
- [x] 2.4 Superseded behaviour re-expressed: the §12.4 media teardown test is now the `restart` control; the
      release sentence in the two fixtures that copy it; the `Cleared` pill's sentence; the route and audit
      censuses; the parity surface
- [x] 2.5 Measured on a real core (the owner's CasparCG 2.5.0, channel 1, layer 90, `INFO 1` unchanged)

## 3. Docs

- [x] 3.1 PRD `R-071` (`docs/prd/runtime.md`); `B-247` and `B-192` notes (`docs/prd/bugs-runtime.md`)
- [x] 3.2 `multibox-layout-switch` amended in place: the §12.4 line in `design.md`, its scenario and task 6.5
- [x] 3.3 This change: proposal, design, three spec deltas

## 4. Gate and CI

- [ ] 4.1 Prettier; `pnpm gate`; `pnpm openspec validate --all --strict`
- [ ] 4.2 Pushed; the `e2e` and installer runs green with their jobs RUN — run URLs:
