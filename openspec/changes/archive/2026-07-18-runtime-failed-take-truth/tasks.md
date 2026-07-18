# Tasks — a failed take retracts its own play evidence (B-079)

## 1. Recon (done, verified in-tree)

- [x] 1.1 `reconciler.ts:460-464` — `freshTruth` (OSC) is consulted ABOVE `ackedStatus`.
- [x] 1.2 `reconciler.ts:341` — `played` is set at INTENT time (B-053's contract).
- [x] 1.3 `server-session.ts:194-203` — OSC binds once for the session lifetime, BEFORE the
      AMCP connect loop, and stays bound across every failed cycle; the bridge feeds it to
      the Reconciler with no health gate (`caspar-runtime.ts:299-302`).
      ⇒ producer evidence outlives the ability to command the server. The hole is real.
- [x] 1.4 `caspar-runtime.ts:630/640` — `#armExpiry` for update/out, NEVER take; and
      `expireIntent` refuses anything not `updating`/`exiting` ⇒ an unsettled take is
      unbounded.
- [x] 1.5 Read the recorded doctrine (`reconciler.ts:111-117`): a false ON AIR is PREFERRED
      to a false IDLE (a false idle hides a live graphic) ⇒ a blanket "error outranks OSC"
      short-circuit is WRONG. Scope the retraction to the failed take's own claim.

## 2. The fix

- [x] 2.1 `applyIntent('take')` records the item's PRIOR play evidence.
- [x] 2.2 A FAILED ack for a take restores it (a take's unproven claim is withdrawn).
- [x] 2.3 `expireIntent` accepts `playing` and retracts the same way.
- [x] 2.4 `take` arms the bounded expiry timer (`#armExpiry`), like update/out.

## 3. Frozen — verified NOT changed

- [x] 3.1 B-053: play evidence still set at intent time; producer-present-never-taken still
      reads `loaded`. Regression-guarded by test.
- [x] 3.2 B-070: the failed-ack settlement contract is unchanged.
- [x] 3.3 B-072: the published position read-back is unchanged.
- [x] 3.4 A failed re-take of a genuinely on-air item still reads `on-air` (no false idle).

## 4. Tests

- [x] 4.1 AMCP-error + fresh producer OSC + take ⇒ NOT `on-air` (reads `loaded`).
- [x] 4.2 B-053 regression guard: producer present, never taken ⇒ `loaded`.
- [x] 4.3 Failed re-take of an on-air item ⇒ still `on-air`.
- [x] 4.4 Failed update/out ⇒ play evidence untouched.
- [x] 4.5 A take with no ack expires to `unconfirmed` (bounded).

## 5. Gate

- [x] 5.1 caspar-client + caspar-bridge green isolated AND parallel; full uncached gate.
