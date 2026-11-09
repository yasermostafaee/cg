# Tasks — reload imported-template sources (R-108)

## 1. Contract

- [x] 1.1 Register R-108 and define source scope, identity and row-data authority.

## 2. CG Control

- [x] 2.1 Add a main-header Templates door whose management mode needs no destination row.
- [x] 2.2 Remember chooser-imported file handles per channel/template in browser-local IndexedDB.
- [x] 2.3 Add per-template Reload and Reload all for remembered sources.
- [x] 2.4 Ask whether current row data or file defaults win, then apply the selected policy.
- [x] 2.5 Track package ids independently and review a changed source through single Reload.
- [x] 2.6 Preserve the existing catalogue id and report missing, inaccessible and skipped sources.

## 3. Verification

- [x] 3.1 Cover source persistence, permission, identity, both data policies and both Reload doors.
- [x] 3.2 Run Runtime typecheck/lint/unit checks, strict OpenSpec validation, real-browser review and
      the full gate.
      The focused Runtime suite passes 37 tests; typecheck, lint and build pass. Real Chromium verifies
      per-template reload and the direct management door. The final repository gate passed 103/103
      uncached tasks plus formatting, control-byte checks and 149 strict OpenSpec items on 2026-11-08
      (`gate-20261108T151635Z-11184.log`, exit 0, 9m56s before repository-wide final checks).
- [x] 3.3 Chromium verified a real persisted test file handle, bulk refusal, individual cancel and
      replacement under the original catalogue id, and reload of the accepted identity. The four
      focused Runtime suites pass 15 tests. The owner's package was inspected read-only.
