## Authoring and rendering

- [x] Persist the optional signed offset and guard exports needing the new renderer contract.
- [x] Add the Inspector input and keep Text inline editing aligned.
- [x] Apply the offset in static and live drawing while preserving the box and separate adjustments.

## Verification

- [x] Windows Chromium passed both cases in `text-vertical-offset.spec.ts`. The 302 focused shared model and runtime tests passed.
- [x] Linux Playwright `E2E` passed on carrying commit [`3629eab7`](https://github.com/yasermostafaee/cg/actions/runs/43704522214/job/132786776989).
