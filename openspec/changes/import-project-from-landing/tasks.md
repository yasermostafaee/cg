# Tasks

- [x] 1.1 Register D-191 in the Designer PRD and number registry.
- [x] 2.1 Extract the existing File → Open operation into one shared shell action.
- [x] 2.2 Add **Import project** beside **New project** on Landing and use that shared action.
- [x] 3.1 Add focused DOM coverage for the Landing action and shared opener.
- [x] 3.2 Add Playwright coverage for opening a `.cgproj` directly from Landing.
- [x] 3.3 Run focused Designer checks and strict OpenSpec validation.

## Current Designer/gallery integration

The Landing file chooser opened an actual saved .cgproj without a temporary project in the pre-integration gallery browser checks (2026-11-04).

Existing checked tasks are historical implementation/evidence records; no completed Linux E2E
is inferred from a checkbox without its carrying-commit run URL. The combined source still owes:

- [x] I.1 Verify the reconciled direct-import and starter-loading browser paths.
      `landing-import-project.spec.ts` passes in the current five-case batch (22.9 seconds): both
      Landing actions are visible, an actual packed `.cgproj` opens directly into Studio, and no
      temporary project or New Project dialog is created. The subsequent seven-case Landing run
      passes in 34.3 seconds and verifies starter selection/real authored content in Studio.
- [ ] I.1a Verify the remaining cancellation/recent-project browser scenarios on the reconciled build.
      The recorded direct-import and starter suites do not exercise cancelling the picker or opening
      a Recent project; no fresh browser result is inferred for those paths.
      The subsequent fresh-build ten-case Preview/Canvas batch passes in 23.0 seconds but contains
      no Landing cases, so it does not close this remaining coverage.
- [ ] I.2 Run the final merged-tree gate and record completed Linux E2E evidence for its carrying commit.

Integration scope and shared validation checklist: `../reconcile-current-designer-gallery/tasks.md`.
