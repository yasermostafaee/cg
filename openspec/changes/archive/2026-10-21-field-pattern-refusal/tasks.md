# Tasks — field-pattern-refusal (R-101; RUN-NEXT-VERSION-02 Q14)

Lane: **FULL** — a refusal condition on the Update path, and what reaches air.

- [x] 1.1 `valueMatchesPattern` (`@cg/text-shaping`); the Designer's preview form asks it.
- [x] 1.2 The presets moved to `@cg/shared-schema` (`field-patterns.ts`, `patternPresetOf`); the Designer re-exports them.
- [x] 1.3 `patternCheck.ts`; `applyDraft` refuses the whole press on a refused draft; the Inspector's line under the
      field; `App.tsx` passes the template's form to the three Update doors.
- [x] 1.4 Tests `patternRefusal.test.ts` (the rule, the line, groups, nothing sent); e2e `pattern-refusal.spec.ts`
      (`25:00` refused under the field and not sent; `۲۰:۳۲` sent) — Windows, non-authoritative.
- [x] 1.5 Linux `e2e` discharged on the pushed commit
      — run [39588699000](https://github.com/yasermostafaee/cg/actions/runs/39588699000) on `c23b1cea` (which carries `18dab0df`): success, read from the log: `ci` and the `E2E` step RAN — Designer 340 passed / 13 skipped; CG Control 353 passed / 2 skipped / 2 flaky (`pvw-live-plate-placeholder.spec.ts:381`, `rehearse-layout.spec.ts:81`: layout timing, passed on retry, not touched by this change); `pattern-refusal.spec.ts` among them.
