## 1. Designer

- [x] 1.1 Pass the project name to both export save paths without changing composition package identity.
- [x] 1.2 Add explicit notice tone and visible export progress.
- [x] 1.3 Cover filename, busy state, success and failure treatments.

## 2. Verification

- [x] 2.1 Run focused checks, full gate and Designer E2E.

Verification (2026-11-04): focused Designer export DOM tests (7), single-file
export tests (30), and book-export E2E tests (2) passed. The full repository
gate passed (103 tasks; 117 strict OpenSpec items). Full Designer E2E passed
352 tests with 14 expected skips; the two failures were pre-existing and
unrelated (`live-source.spec.ts` B-359 and `persian-digits.spec.ts`).
