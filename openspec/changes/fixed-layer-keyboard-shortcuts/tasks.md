# Fixed layer keyboard shortcuts

- [x] Validate and persist optional assignments in the fixed layer bank.
- [x] Add assignment, conflict feedback and unbinding to the Layers section of Station setup.
- [x] Invoke the existing row action from the selected channel, including its Clear confirmation.
- [x] Verify the binding in Chromium, with a filter, in full-screen Preview and with editing focus.
- [x] Record carrying evidence for Play, Stop and Clear. The [Linux Playwright E2E step](https://github.com/yasermostafaee/cg/actions/runs/43076672702/job/130718280080) passed on `fb3453d4`.
- [x] Add Next assignment with conflict detection, old console compatibility and restart persistence.
- [x] Verify a filtered row with only a Next binding and the book's last-page guard in Chromium.
- [ ] Record the Linux Playwright E2E result for Next.

Windows Chromium passed all 16 focused scenarios. The Bridge integration test persisted Next through an older console update and a restart, and refused a duplicate chord across both shortcut maps.
