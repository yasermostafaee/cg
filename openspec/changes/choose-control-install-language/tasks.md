## 1. Implementation

- [x] Offer three languages on the first CG Control setup page and localize its remaining pages.
- [x] Save the setup choice after success and seed both application preferences with it when needed.

## 2. Verification

- [x] Verify the language selection, navigation and upgrade preference precedence in the Rust, Runtime unit, and Windows Chromium checks. Spot-check English, Persian and Arabic selector text and the right-to-left native layout.
- [x] Inspect actual Windows setup rendering in English, Persian and Arabic.
- [ ] Run the clean Windows desktop smoke for the real installer, including silent setup, uninstall, upgrade and installed first launch. The native setup previews and the Chromium initialization checks already passed. A hidden native WebView2 attempt returned Windows access denied.
- [ ] Record the carrying Linux Playwright result.
