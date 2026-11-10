## 1. Implementation

- [x] 1.1 Separate the cleared artwork from the canvas stage backdrop.
- [x] 1.2 Assert artwork clear and the visible checkerboard after the real Outro in Chromium.
- [x] 1.3 Verify the carrying Linux E2E step. The [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) step passed on `c560f8cd`.

## 2. Follow-up

- [x] 2.1 Restore the document body's opacity when the main Canvas clears a rehearsal.
- [x] 2.2 Verify both checker colors in the rendered frame after the authored Outro in Chromium. Both tones were absent before the fix and visible afterward on Windows, including in the reported Designer project.
- [ ] 2.3 Verify the carrying Linux E2E step for the follow-up.
