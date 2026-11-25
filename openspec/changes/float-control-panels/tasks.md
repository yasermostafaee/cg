## 1. Native prototype

- [x] Exercise the native prototype on Windows. The same iframe, WebRTC session, video and
      audio survived dock, float, maximize, restore, blocked close and redock on one display.
- [ ] Demonstrate one shared session and preview continuity in the installed workspace.
- [ ] Verify native maximize, restore, Exit floating and blocked independent close on two displays with different scaling.

## 2. Workspace

- [x] Connect detach and Exit floating for PGM, PVW, Layers and Inspector in the three interface languages.
- [x] Keep the same panel documents, preview iframe, selected layer and drafts across layout changes.
      Windows Chromium verified zero playout writes. The Windows shell exercised media continuity.
- [x] Keep detached monitors independent and exercise the docked companion modes in Windows Chromium.
- [x] Add independent session visibility for PVW and PGM and retain the combined toolbar action.
- [x] Persist floating placement and restore size in local UI profiles. The Windows shell verified
      recovery into the available work area when a saved display was absent.

## 3. Verification

- [x] Test selecting the same row and a different row with Inspector detached in Windows Chromium.
- [x] Verify main toolbar tooltips stay above intersecting docked panels in Chromium and WebView2.
      The native smoke covered hover, keyboard focus, Escape, click-through and font loading in RTL.
- [x] Verify command toast position, click-through and single announcement across the docked Layers panel.
      Windows Chromium reproduced the missing overlay before the fix and passed after it.
      The regression also covers expiry and detaching Layers.
- [x] Verify the individual and combined toolbar actions with both monitors docked.
      Windows Edge covered the mixed state, fullscreen and restore, a 760 px toolbar and zero
      playout commands. The local programme-return test kept its connection while PVW toggled and
      released it when PGM was hidden.
- [x] Recheck visibility with one or two detached monitors. Windows Edge covered both roles and
      redocking while the other monitor was hidden. The shell layout tests covered session defaults.
      A separate WebView2 host with the mock bridge confirmed the window states and localized
      toolbar labels in English, Persian and Arabic on one display.
- [ ] Verify the packaged app on two physical displays with different scaling.
- [ ] Record the carrying Linux Playwright result.
