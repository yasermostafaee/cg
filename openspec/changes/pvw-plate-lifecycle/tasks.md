## 1. PVW

- [x] 1.1 Track the local composite lifecycle and show plate markers only while playing.
- [x] 1.2 Remove the Safe Area control, state and guide rendering.
- [x] 1.3 Update DOM/unit/E2E coverage.

## 2. Verification

- [x] 2.1 Run focused checks, full gate and Runtime E2E.

Verification (2026-11-04): Runtime typecheck and lint passed (pre-existing warnings only); all 2,529
Runtime unit/DOM tests passed; the focused Chromium suites passed 15/15. The full Runtime Chromium
run passed 382 tests with 2 skipped; the three lifecycle-dependent failures were updated and passed
on their focused rerun. The remaining `first-run.spec.ts:593` failure reproduces alone and is outside
this change (its channel-2 occupied-layer seed never appears). `pnpm gate` passed after the final diff.
