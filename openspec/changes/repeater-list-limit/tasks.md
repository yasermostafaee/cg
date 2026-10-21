# Tasks — repeater-list-limit (RUN-NEXT-VERSION-02 Q3, Q4)

Lanes: Q3 **FULL** (a refusal condition in an editor); Q4 **FULL** (the operator's Inspector, the GDD, an import-derived
field key on the wire).

## Q3 — the Designer's Preview form

- [x] 1.1 `ListFieldSchema.maxItems` (optional, derived); `listFieldMaxItems` + `withListLimits` (`@cg/shared-schema`).
- [x] 1.2 The Preview modal stamps its aggregate; the form passes `maxItems` to the shared `ListItemsEditor`.
- [x] 1.3 Tests `list-limits.test.ts` (shared-schema), `repeater-row-limit.dom.test.ts` › "Q3 …".
- [ ] 1.4 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_

## Q4 — the GDD and CG Control

- [x] 2.1 The GDD writes `maxItems` on a repeater's array property (`listFieldMaxItems`).
- [x] 2.2 CG Control's import stamps `maxItems` (`withListLimits`); the Inspector's list editor states `n / max` and
      withholds Add item at the limit.
- [x] 2.3 Tests `gdd.test.ts` › "Q4 …"; e2e `repeater-limit.spec.ts` (`2 / 2` withheld; remove → `1 / 2`; add → `2 / 2`)
      — Windows, non-authoritative.
- [ ] 2.4 Linux `e2e` discharged on the pushed commit — run URL: _(pending)_
