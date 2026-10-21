# Tasks — row-sound-mute (RUN-NEXT-VERSION-02 Q9)

Lane: **FULL** — the path to air (sound), the wire (`__cg.sound`), an IPC channel, a persisted (retained) key.

- [x] 1.1 `@cg/shared-schema`: `CgControl.sound` + `readSound`; `StackItemState.soundMuted` and
      `RetainedStackItemSchema.soundMuted` (+ `retainedFromStackItem`); audit action `set-sound-muted` and its `sound`
      value.
- [x] 1.2 `@cg/shared-ipc`: `StackSetSoundMutedChannel`.
- [x] 1.3 `@cg/template-runtime`: `update` and `play` apply `__cg.sound` to `setSoundMuted`.
- [x] 1.4 CG Bridge: `setSoundMuted` (gated by `#ownsLiveSeats`), `updateSound`, `#takeControl` + `updateTake`,
      publish / restore / forget, channel scope, route, audit mapping.
- [x] 1.5 CG Control: bridge contract, WebSocket, mock, the row's mark and toggle, the Log's value.
- [x] 1.6 Tests: `sound-mute-wire.integration.test.ts` (off air: nothing sent, both take routes carry it; on air: one
      UPDATE each way; never muted: no member; unknown row), `cg-control-sound.test.ts` (the page),
      `layerRow.templateSound.dom.test.ts` (the toggle), e2e `template-sound-mute.spec.ts` — Windows, non-authoritative.
- [x] 1.7 Linux `e2e` discharged on the pushed commit
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `90cb2e53`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); `template-sound-mute.spec.ts` among them.
- [ ] 1.8 A hardware run (the owner's CasparCG): a muted row's take is silent; an on-air mute silences a sound already
      playing. Owed.
