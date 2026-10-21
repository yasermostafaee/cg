# Tasks — plate-copy-ids (RUN-NEXT-VERSION-02 Q5)

Lane: **FULL** — a persisted key (a plate's source id, which CG Control maps to an input).

- [x] 1.1 `cloneElementWithNewIds` gives each plate in a copy the next free `live-N` (`withFreshPlateKeys`), marked
      `routeKeyAuto`; `nextAutoSourceId` takes the keys already given in the same act.
- [x] 1.2 Tests `plate-copy-ids.test.ts` (duplicate; paste twice, with the real preflight; two at once; an unassigned
      plate) — 3 red at HEAD, green now.
- [x] 1.3 Linux `e2e` discharged on the pushed commit
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `45b9b0e9`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); the whole Designer suite.
