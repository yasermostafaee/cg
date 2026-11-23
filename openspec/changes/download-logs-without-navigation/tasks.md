## 1. Ticketed archive download

- [x] 1.1 Replace direct `/logs.zip` navigation with an in-app fetch followed by a local save.
- [x] 1.2 Allow the ticketed response to be read cross-origin and preserve the station-admin
      grant and one-use ticket.
- [x] 1.3 Verify the ticketed download and browser Blob fallback. Runtime and Bridge focused
      tests and the complete repository gate passed on `dev` on 2026-11-04.

## 2. Choose archive destination (B-450)

- [x] Wire Windows Save As to the audit archive. Report the saved path after writing to the
      chosen location and preserve existing names.
- [x] Open the supported browser picker before the ticket request and fetch, or offer the
      local Blob download where the picker is unavailable.
- [x] Verify in packaged Windows Control that the chooser opens, a selected ZIP opens with
      the expected logs, and cancel writes nothing. Verified with a loopback Bridge, an
      operator-selected Unicode path, and a second run cancelled in the native dialog.
- [x] Verify browser picker activation, no ticket on cancel, the completed save and the
      browser fallback. Edge verified the picker API boundary and the actual Blob download.
      The Bridge integration suite verified the authorization and one-use ticket separately.
