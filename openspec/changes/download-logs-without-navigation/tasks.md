## 1. Fix

- [x] 1.1 Replace direct `/logs.zip` navigation with an in-app fetch followed by a local Blob download.
- [x] 1.2 Allow the ticketed response to be read cross-origin without changing its station-admin or
      one-use-ticket authorization.
- [x] 1.3 Run focused Runtime/Bridge checks, browser acceptance, full gate, and push to `dev`.

      Verified 2026-11-04 on `dev`: Runtime's archive/download and Audit-panel suites passed
      (7 tests); Bridge's ticket/CORS and ZIP suites passed (10 tests); the complete repository
      gate passed before the feature's follow-up push. The browser-facing path downloads only the
      fetched local Blob, so the one-use Bridge URL is never exposed as a navigation for IDM to
      intercept.

## 2. Native Windows archive save (B-450)

- [x] Save the fetched ZIP to the Windows Downloads folder and show the actual file path in
      Audit. Keep the Bridge's authorization and ticket checks and the browser Blob path.
- [x] Verify the safe filename, duplicate name, completed write and write failure using
      the desktop shell and retained files.
- [x] Exercise a real Windows desktop save and open the archive. Verify the browser fallback
      and unauthorized or expired ticket handling separately.

      On 2026-11-23 the packaged Windows WebView fetched both archives directly. Audit showed
      the actual paths, a second archive got a numbered filename, and both ZIPs opened with
      the expected contents. The write-error UI, browser path and ticket checks passed separately.
