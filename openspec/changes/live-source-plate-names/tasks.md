## 1. Implementation

- [x] 1.1 Generate the next free `plate-N` in the current switchable state.
- [x] 1.2 Make the author-mode plate label readable at ordinary zoom.
- [x] 1.3 Use Plate across Designer-visible labels, actions, accessible names and refusals.
- [x] 1.4 Update unit and rendering coverage.

## 2. Verification

- [x] 2.1 Run focused checks, full gate and Designer E2E.

Verification on 2026-11-04:

- Focused Designer state/DOM tests: 34 passed; template-runtime rendering tests: 23 passed.
- Focused D-171 Designer browser scenarios: 3 passed.
- Full repository gate: 103/103 tasks passed; 117/117 OpenSpec items passed.
- Full Designer E2E: every D-171 scenario passed; the lane reported 350 passed, 14 skipped and
  4 unrelated existing failures in B-359, B-360, the Looks rendering scenario and Persian-number
  validation.

## Current Designer/gallery integration

The earlier focused, gate and browser results above belong to their original source snapshots. They do not verify the reconciled Designer/gallery tree.

Existing checked tasks are historical implementation/evidence records; no completed Linux E2E
is inferred from a checkbox without its carrying-commit run URL. The combined source still owes:

- [ ] I.1 Verify this feature against the reconciled current Designer/gallery source and browser build.
- [ ] I.2 Run the final merged-tree gate and record completed Linux E2E evidence for its carrying commit.

Integration scope and shared validation checklist: `../reconcile-current-designer-gallery/tasks.md`.
