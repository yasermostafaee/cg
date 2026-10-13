# Tasks — after the Playout's dongle drops and comes back (B-328, B-329, B-330, R-099; `DONGLE-RECOVER-01`)

Lane: **FULL** — a take's wire (`B-328`), the cadence a refusal reads (`B-330`), and the bridge's log.

## 0. Read the evidence, then reproduce by running

- [x] 0.1 The owner's logs (`Claude outputs/evidence-dongle-2026-10-11/`) re-read: two outages. The first ended
      before 06:37:09Z. The second ran ~06:44–06:51Z, with its silence question at the off-cadence `INFO 1`
      06:50:13Z. Each wiped a STOPPED page the bridge never noticed: `1-59` (taken at 06:37:24Z) and `1-98` (taken at
      06:52:03Z). Both takes were `CG UPDATE << 403` with no ADD.
- [x] 0.2 CasparCG `v2.5.0-stable` read: `CG UPDATE` / `STOP` / `NEXT` answer `403` when the layer's foreground holds
      no CG producer (`get_expected_cg_proxy` → `expected_user_error` → `AMCPCommandQueue` `403`). `CG PLAY` answers
      `202` regardless. The HTML proxy's `update` throws nothing.
- [x] 0.3 The AMCP mock made faithful, test-only: `CLEAR <channel>` clears the channel (it was a no-op: a bare channel
      parsed as layer 0), and `CG STOP` / `NEXT` answer `403` on a layer with no page (`stage-fidelity.test.ts`).
- [x] 0.4 `dongle-recover.integration.test.ts` against the unchanged bridge: 2 red of 6. S1 (R2, R4, R6 took by the
      resident route onto emptied layers, R4 with the "look tell refused" message the owner's log shows) and the
      06:37:24Z replay. S2 (back inside the window) and the mid-take CLEAR measurement were green.
- [x] 0.5 `license-return-cadence.test.ts` against the unchanged reader: the return took 60 000 ms.

## 1. B-328 — a resident take whose page is gone

- [x] 1.1 `#takeImpl`: on a primary `403` to the resident take tell, forget the page and complete the same take by
      the ADD route. One stderr line, no banner, no command of the bridge's own.
- [x] 1.2 `look-switch-refusal`'s `B-309` case scripted its refused tell as `403`, which the core cannot answer on
      a resident page. It now scripts `501`, and its assertion is unchanged.
- [x] 1.3 Tests green: `dongle-recover.integration.test.ts` 6/6, and the bridge suite.

## 2. B-330 — the license after a return

- [x] 2.1 While the held license reads `false`, read at the 5 s floor. While licensed, the minute is unchanged.
- [x] 2.2 `license-return-cadence.test.ts`: return within 5 s; one read a minute while licensed; removal still within
      the minute (measured, unchanged); the floor still a floor while unlicensed.
- [x] 2.3 The ripple: the living requirement said "at most once per 60 s", so it is MODIFIED here. The two comments
      that state the cadence (`playout-license.ts`, `shared-ipc` `license.ts`) now say it. The pending
      `console-polish` scenario "A re-take whose look tell is refused" now excepts the `403` that re-routes the take.

## 3. R-099 and B-329 — the log

- [x] 3.1 One line per change of the license fields a take reads, and of D4's per-channel words
      (`license-change-lines.test.ts`).
- [x] 3.2 The refresh refusal logged once per run, with one count at its end (`bridge-session.test.ts`).

## 4. Verification

- [x] 4.1 `pnpm gate` green before the push: the pre-push gate ran 99 successful, 0 cached, 99 total, and
      the OpenSpec validation passed 84 of 84.
- [x] 4.2 CI on `9514e011`: `ci` and `e2e` RAN and passed (E2E job log: Designer 303 passed, Runtime 341
      passed) — <https://github.com/yasermostafaee/cg/actions/runs/38234211328>. Desktop skipped by design
      (<https://github.com/yasermostafaee/cg/actions/runs/38234211089>).
- [ ] 4.3 The owner's two checks on an installed bridge (H1 and H5 in the report).
