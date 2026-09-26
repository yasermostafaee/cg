# Tasks — field fixes from 2026-09-26 (`FIELD-FIXES-01` v6, `FIELD-FIXES-01-A`)

## 0. Established (no code)

- [x] 0.1 §0's five answers, from the installed app's logs and a mock replay of the station's own
      state (`design.md` §0); the owner accepted them in `FIELD-FIXES-01-A`.
- [x] 0.2 The clean-up-after-refusal sites, with anchors (`design.md` §2).
- [x] 0.3 The look switch on a refused plate (`design.md` §3) — filed as `B-273`, not fixed.

## 1. Decision 1 and the Rule (`B-271`, `B-272`)

- [x] 1.1 `refusal-cleanup.ts` — `mayClearAfterRefusal`, `outcomeOf`; `#clearAfterRefusal` is the
      one caller of both, and every clean-up site calls it.
- [x] 1.2 The take stops at the first refused plate, never plays the graphic, undoes only what it
      seated, and removes the graphic it added (`#removeUnplayedPage`); the graphic's own refused
      `CG PLAY` undoes the same way.
- [x] 1.3 `TakeRefusalSchema` / `StackItemState.takeRefusal`, recorded on refusal and published; the
      row reads ERROR while it stands; withdrawn by the next landed take, `out`, the bank clear and
      `remove`.
- [x] 1.4 `take-all-or-nothing.integration.test.ts` 9/9 — the success wire byte for byte (recorded at
      `459c3f64`), plate 1 refused, plate 2 refused after plate 1, the neighbour's layer untouched,
      the graphic's `CG PLAY` refused, the line withdrawn, the Rule's table, the R-048 swap and its
      control. Red first: 4/9 red against `459c3f64`'s runtime (plate 1, plate 2, `CG PLAY`,
      withdrawn); the success pin, both controls and the swap were green before and after.
- [x] 1.5 The whole bridge suite green: 141 files, 1188 tests.

## 2. Decision 2 and the 5 s (`B-274`, `B-275`)

- [x] 2.1 `#takeImpl` refuses `already-on-air` (`TAKE_ON_AIR_CODE`) on `#ownsLiveSeats`, before any
      mutation; `MockRuntime.take` refuses the same.
- [x] 2.2 `Reconciler.expireIntent`: an expired take is `takeOverdue` — keeps its evidence, reads
      `unconfirmed`, and its own late reply resolves it (`applyAck`); a newer intent supersedes it.
- [x] 2.3 The row's PLAY is disabled on `ownsLiveSeats` (`@cg/shared-schema`: `isOnAirStatus` or a
      seat in the published ledger — the bridge's `#ownsLiveSeats` and the mock's take call the same
      function), titled `takeOnAirReason(row)`; a bridge refusal is worded the same;
      `errorCodeMessage` carries the row-less form.
- [x] 2.4 Tests: `take-on-air-refusal.integration.test.ts` 2/2 (two consoles through the real bridge;
      the slow reply with the bound injected) — red first 2/2 against `d2920842`'s runtime and
      Reconciler; `reconciler-failed-take.test.ts` (overdue, late OK, late failure, no OSC,
      superseded, re-take); `takeOnAirGate.test.ts` 10/10; `layerRow.dom.test.ts`'s `unconfirmed`
      case reversed to the owner's rule; the six on-air re-takes rewritten (design §4).
- [x] 2.5 The seat half at the console: `takeOnAirGate.test.ts` "a row whose plates the ledger holds"
      (+ control: the same row with no seat is offered PLAY); the five runtime e2e specs that pressed
      PLAY on the seed's seated news row retargeted, and `fixed-layers` pins the refusal title with
      PLAY back after CLEAR as its control (design §4). Local (Windows, not a discharge): the
      whole runtime suite 261/261. `MockRuntime.test.ts`: the seated seed row's take is refused with
      nothing seated twice, and the two out-then-take cases wait for OUT to settle.
