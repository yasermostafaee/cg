## 1. Implementation and verification

- [x] Add independent Layer details and Position disclosures with visible state and draft summaries.
- [x] Use compact field rows and retain complex editors and the sticky footer.
- [x] Verify Ready state, keyboard disclosures, collapsed Position draft and complex field editing
      in Windows Chromium. The focused run passed 22 cases covering Inspector geometry, ticker
      lists, nested Fields, file-backed Sequences and date/time pickers.
- [x] Chromium verified full-width text inputs and draft retention in the narrow companion beside
      each maximized monitor.
- [x] Chromium verified same-row Sequence navigation and load controls, the file chooser, and the
      full-width layout at 200% with right-to-left text.
- [ ] Record the carrying Linux E2E run.

The [Linux run for c019352a](https://github.com/yasermostafaee/cg/actions/runs/43015973303/job/130509988163)
found five layout failures that prompted the companion-width and Sequence-width follow-up.
