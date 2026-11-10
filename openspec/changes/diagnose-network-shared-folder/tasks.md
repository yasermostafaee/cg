## 1. Implementation and verification

- [x] 1.1 Verify service directory access and distinguish missing folders from explicit access denials.
- [x] 1.2 Keep the Station setup refusal out of the controls and preserve the input after a failed save.
- [x] 1.3 Six focused Bridge tests and the focused Runtime Chromium test passed on Windows. The browser
      measured the same input width before and after a refusal and found one message.
- [x] 1.4 Record carrying Linux E2E. The [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) step passed on `c560f8cd`.
- [ ] 1.5 Recheck the UNC path on customer server A under the Bridge service identity, with CG Control on B.
