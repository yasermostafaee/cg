# Tasks — pending-intent completion (B-044)

## 1. Schema (first)

- [x] `@cg/shared-schema` `StackItemStatusSchema`: add `'unconfirmed'`.

## 2. Reconciler (`@cg/caspar-client`)

- [x] `ItemRecord.settleTo`: recorded on `update` (underlying status; preserved
      across back-to-back updates, fallback `'playing'`) and `out` (`'idle'`).
- [x] `applyAck`: stale-ack guard (`seq !== lastIntentSeq` → no mutation); OK
      ack with `settleTo` → settle `intentStatus`/`ackedStatus`, clear
      `settleTo`/`errorCode` (also rescues a late ack after expiry); NAK keeps
      the `error` path and clears `settleTo`; load/take ack behavior unchanged.
- [x] `expireIntent(seq)`: latest-seq + still in flight (`updating`/`exiting`)
      → `intentStatus='unconfirmed'`, `ackedStatus` cleared,
      `errorCode='unconfirmed'`, emit. `unconfirmed` joins `isTerminalStatus`.

## 3. Bridge (`tools/caspar-bridge`)

- [x] `INTENT_TIMEOUT_MS = 5000`; per-seq expiry timers around the update/out
      sends (armed before send, cleared on ack, `unref`'d, all cleared in
      `stop()`); on fire → `reconciler.expireIntent(seq)`.

## 4. UI (`apps/runtime`)

- [x] `airStateVisual`: minimal `unconfirmed` branch (pending-amber, `?`,
      "UNCONFIRMED"). Full badge restyling stays with the queued UI-polish item.

## 5. Browser MockRuntime alignment

- [x] Re-state `update()`/`out()`/`#settle` on the real contract: transient
      `updating`/`exiting` that settles to the underlying state on the
      (simulated) ack within a small bound — no hard-coded divergence from the
      bridge lifecycle.

## 6. PRD notes (docs duty from the B-040 addendum)

- [x] `docs/prd/runtime.md` R-003: append the known hazard — blur-commit
      remount (value-signature `key`) swallows the first click on the list
      editor's structural buttons / can lose keystrokes typed into another row
      on the live bridge; R-003's staged-edits design must remove or explicitly
      handle it.
- [x] `docs/prd/bugs-runtime.md` B-044 entry: one-line cross-reference to that
      hazard note.

## 7. Tests

- [x] Reconciler unit (injected `now()`): OK-ack settles update→`playing` /
      out→`idle`; back-to-back updates settle only on the latest ack; stale ack
      ignored; NAK → `error`; expiry → `unconfirmed` (acked cleared,
      pending=false); late OK ack rescues `unconfirmed`; take/load unchanged.
- [x] Bridge→mock integration (replaces the temp diagnostic repro), BOTH OSC
      regimes (`oscHz: 40` and `disableOsc: true`): update settles within the
      bound and never rests on `updating`; out rests on `idle`; mock stopped
      mid-session → bounded explicit failure (`error`/`unconfirmed`), not stuck.
- [x] E2E (`apps/runtime`): take → Inspector commit → the badge returns to
      "ON AIR" within the bound (transient "UPDATING" allowed).
- [x] Delete `tools/caspar-bridge/tests/b044-repro.temp.test.ts`.

## 8. Gate

- [x] Full green gate UNCACHED (`turbo --force`) for `@cg/shared-schema`,
      `@cg/caspar-client`, `@cg/caspar-bridge`, `@cg/runtime` + repo
      `format:check`; `pnpm test:e2e`.
- [x] `pnpm openspec validate fix-pending-update-completion --strict`.
- [x] Verify no temporary instrumentation remains (the OSC probe is already
      reverted; confirm via `git diff`).

## 9. Live validation (operator) + wrap-up

- [ ] STOP for the operator's live pass (real CasparCG 2.5.0 `69e8ad5`):
      update on a text field AND a ticker item → badge settles within ~5 s and
      the value is on air; Take/Out badges behave (out rests IDLE, not EXIT);
      negative test — stop CasparCG mid-update → badge lands in the explicit
      `unconfirmed`/`error` state (not stuck), and after Caspar restarts + the
      bridge reconnects, a fresh Load/Take + Update works.
- [ ] After PASS: tick tasks, flip B-044 → `[x]` (note build 2.5.0 `69e8ad5`;
      root cause is NOT build-dependent — no extra 2.3.2 gate beyond the
      standing B-041 one), archive per the workflow, push, compare URL.
