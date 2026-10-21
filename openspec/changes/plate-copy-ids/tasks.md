# Tasks — plate-copy-ids (RUN-NEXT-VERSION-02 Q5)

Lane: **FULL** — a persisted key (a plate's source id, which CG Control maps to an input).

- [x] 1.1 `cloneElementWithNewIds` gives each plate in a copy the next free `live-N` (`withFreshPlateKeys`), marked
      `routeKeyAuto`; `nextAutoSourceId` takes the keys already given in the same act.
- [x] 1.2 Tests `plate-copy-ids.test.ts` (duplicate; paste twice, with the real preflight; two at once; an unassigned
      plate) — 3 red at HEAD, green now.
- [ ] 1.3 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_
