## 1. Model and rendering

- [x] 1.1 Extend padding schema/evaluation/rendering to uniform and per-side shapes.
- [x] 1.2 Add a uniform padding animation property and safe track migration.

## 2. Inspector

- [x] 2.1 Add the single/per-side control using the Border Radius interaction pattern.
- [x] 2.2 Cover mode switches, persistence and render parity.

## 3. Verification

- [x] 3.1 Run focused checks, full gate and Designer E2E.

Verification on 2026-11-04:

- Focused schema/runtime/Designer tests: 188 passed.
- Focused Designer browser scenario: 1 passed.
- Full repository gate: 103/103 tasks passed; 117/117 OpenSpec items passed.
- Full Designer E2E: the new D-172 scenario passed; the lane reported 351 passed, 14 skipped and
  3 unrelated existing failures. A focused rerun cleared the close-guard failure and reproduced the
  existing Live Source multi-select and Persian-number validation failures.
