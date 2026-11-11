## 1. Implementation

- [x] 1.1 Use the existing duration guard when a sound is placed.
- [x] 1.2 Show each sound's measured duration in its Timeline row.

## 2. Verification

- [x] 2.1 Verify import, fitting and oversized drops, Cancel, Extend and undo in Windows Chromium.
- [x] 2.2 Verify the shared duration guard and Timeline audition. Three existing duration-guard and two Timeline sound browser cases passed, as did 30 DOM cases covering pending project/composition changes, the current frame rate and a longer active range.
- [x] 2.3 The carrying [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/43012308177/job/130494823472) passed on `349544ee`.
