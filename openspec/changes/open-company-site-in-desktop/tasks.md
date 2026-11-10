## 1. Implementation and verification

- [x] 1.1 Open the fixed company site through the Windows shell with a main-window-only command.
- [x] 1.2 Route all app website entries through the typed bridge where the native shell is available.
- [x] 1.3 Both Tauri crates passed `cargo check`. The two capability tests passed. Windows Chromium
      verified both apps use a regular browser tab or call the shell bridge when available.
- [ ] 1.4 Verify the click in both packaged Windows apps.
- [x] 1.5 Record carrying Linux E2E. The [Linux Playwright E2E](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197) step passed on `c560f8cd`.
