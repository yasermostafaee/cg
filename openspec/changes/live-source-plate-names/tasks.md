## 1. Implementation

- [x] 1.1 Generate the next free `plate-N` in the current look.
- [x] 1.2 Make the author-mode plate label readable at ordinary zoom.
- [x] 1.3 Update unit and rendering coverage.

## 2. Verification

- [x] 2.1 Run focused checks, full gate and Designer E2E.

Verification on 2026-11-04:

- Focused Designer state/DOM tests: 34 passed; template-runtime rendering tests: 23 passed.
- Focused D-171 Designer browser scenarios: 3 passed.
- Full repository gate: 103/103 tasks passed; 117/117 OpenSpec items passed.
- Full Designer E2E: every D-171 scenario passed; the lane reported 350 passed, 14 skipped and
  4 unrelated existing failures in B-359, B-360, the Looks rendering scenario and Persian-number
  validation.
