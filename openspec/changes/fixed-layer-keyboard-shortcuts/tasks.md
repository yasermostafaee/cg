# Fixed layer keyboard shortcuts

- [x] Validate and persist optional assignments in the fixed layer bank.
- [x] Add assignment, conflict feedback and unbinding to the Layers section of Station setup.
- [x] Invoke the existing row action from the selected channel, including its Clear confirmation.
- [x] Verify the binding in Chromium, with a filter, in full-screen Preview and with editing focus.
- [x] Record carrying evidence for Play, Stop and Clear. The [Linux Playwright E2E step](https://github.com/yasermostafaee/cg/actions/runs/43076672702/job/130718280080) passed on `fb3453d4`.
- [x] Add Next assignment with conflict detection, old console compatibility and restart persistence.
- [x] Verify a filtered row with only a Next binding and the book's last-page guard in Chromium.
- [ ] Record the Linux Playwright E2E result for Next.
- [x] Provide the F1–F12 preset for layers 99–88 on channels without saved bindings.
- [x] Apply or revert shortcut edits from their own dialog footer.
- [x] Verify the preset and modal persistence in Chromium. All 31 focused Windows Chromium scenarios passed with the final picker fixture. A further 16 passed with the concurrent shortcut edit scenario. The four modal and station suites passed all 46 Vitest checks.
- [x] Verify all 48 function-key chords through physical Windows input in an isolated WebView2 host. Assigned Alt+F4 fired once under key repeat. The close guard held ordinary close and unassigned Alt+F4.
- [x] Drive a three-page book on layer 96 with real key input in the Windows production build using MockRuntime. Alt+F4 advanced exactly once and was inert during editing or setup. F4, Ctrl+F4 and Shift+F4 invoked Play, Stop and the Clear confirmation.
- [x] Keep hidden shortcut controls outside the visible layer rows and keep default and custom bindings available in filtered and fullscreen views.
- [x] Verify both monitor companion layouts and default and custom shortcut actions in Windows Chromium. All four focused cases passed.
- [ ] Verify first-run row counts on Linux. The local Windows fixture stopped at the channel occupancy warning before counting rows.
- [ ] Record the Linux Playwright E2E result for the preset and modal footer.

Windows Chromium passed all 16 focused scenarios. The Bridge integration test persisted Next through an older console update and a restart, and refused a duplicate chord across both shortcut maps.
