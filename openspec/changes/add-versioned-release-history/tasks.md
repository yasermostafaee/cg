## 1. Contract and source

- [x] 1.1 Allocate P-077 and record the release-history contract in the PRD
- [x] 1.2 Add a structured history containing the prepared 1.0.0 release and accepted next-version work
- [x] 1.3 Record the owner's customer-delivery confirmation and version increment before a new build.
      Keep pending changes under `next` until a numbered customer version is prepared.
- [x] 1.4 After the owner confirmed that `1.0.0` reached a customer, prepare `1.1.0` for station testing.
      Record the included changes in both languages and retain open station checks under `next`.
- [x] 1.5 Correct the confirmed delivered versions `1.0.0`, `1.1.0`, `1.2.4` and `1.2.5` to published
      in both languages, including the stale internal-test title and summary for `1.1.0`.

## 2. Generator and delivery

- [x] 2.1 Generate a standalone responsive bilingual page with features and fixes grouped per version
- [x] 2.2 Keep the five canonical filenames in release tooling and omit download sections from public history.
- [x] 2.5 Show numbered releases in pages of fifteen and omit the `next` draft from the public page.
- [x] 2.3 Require the installer version in history and upload the generated page as a separate CI artifact
- [x] 2.4 Embed Vazirmatn and open the packaged page from Designer Home, Designer Help and CG Control Station setup
- [x] 2.5 Fill the Designer viewport for history, retain CG Control's near-full-window history layout,
      and label both footer actions Close.

## 3. Verification

- [x] 3.1 Test hidden download sections, confirmed release status, the fifteen-entry page boundary and the missing-version build refusal.
- [x] 3.2 Release typecheck, lint and tests passed. Both languages were checked in Chromium from both apps.
- [x] 3.3 [Carrying Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42568697446/job/129000870086)
      passed on `665668e4`. The Windows installer run on `4b3bb243` produced a standalone HTML
      artifact identical to the repository page.
- [x] 3.4 Verify the `1.1.0` package and bilingual history. The
      [Windows build and acceptance](https://github.com/yasermostafaee/cg/actions/runs/42662909793)
      passed on `623f6d43` and its three installer hashes matched the local copy.
      [Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42670891955/job/129347143905)
      passed on `e3aa2014`, which adds test fixes to the same product source.
- [x] 3.5 The approved `1.1.0` internal test rebuild `e5474cc1` passed
      [Windows build and acceptance](https://github.com/yasermostafaee/cg/actions/runs/42727984581)
      and [Linux E2E](https://github.com/yasermostafaee/cg/actions/runs/42727985027/job/129538550944).
      The downloaded installers match their CI hashes, all three contain the same verified
      Persian guide, and the separately downloaded history identifies the preview updates.
- [x] 3.6 The owner confirmed that 1.1.0 reached the customer. Prepare product version 1.2.0 and its bilingual history and installation guide; keep target-station checks in the next section.
- [x] 3.7 Read the `1.2.0` candidate results on `c560f8cd`: [Linux Playwright](https://github.com/yasermostafaee/cg/actions/runs/42873144431/job/130029489197), [Windows installers](https://github.com/yasermostafaee/cg/actions/runs/42873144144/job/130029350792), [installer smoke](https://github.com/yasermostafaee/cg/actions/runs/42873144144/job/130039694110) and [fresh Playout installation](https://github.com/yasermostafaee/cg/actions/runs/42873144144/job/130039694274) passed. The independent [No Playout acceptance](https://github.com/yasermostafaee/cg/actions/runs/42873144144/job/130039694031) connected and saved the station; its assertion of the address spelling prevented the installed Take check. The candidate is for station testing.
- [x] 3.8 Windows Edge measured Designer history against the full viewport and verified the Close
      footer action, published 1.1.0 status and hidden Next/download sections in both apps.
      Both `app-version` suites passed with 3 tests each. Linux E2E for the carrying commit remains owed.
- [x] 3.9 Windows Edge verified pagination with 32 releases, including 15/15/2 entries and navigation
      boundaries. The current one-page history has disabled navigation in both languages and apps.
