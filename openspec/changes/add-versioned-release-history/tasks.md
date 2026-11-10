## 1. Contract and source

- [x] 1.1 Allocate P-077 and record the release-history contract in the PRD
- [x] 1.2 Add a structured history containing the prepared 1.0.0 release and accepted next-version work
- [x] 1.3 Record the owner's customer-delivery confirmation and version increment before a new build.
      Keep pending changes under `next` until a numbered customer version is prepared.
- [x] 1.4 After the owner confirmed that `1.0.0` reached a customer, prepare `1.1.0` for station testing.
      Record the included changes in both languages and retain open station checks under `next`.

## 2. Generator and delivery

- [x] 2.1 Generate a standalone responsive bilingual page with features and fixes grouped per version
- [x] 2.2 Derive and bind the guide, three installer and checksum links from an optional per-version host URL
- [x] 2.3 Require the installer version in history and upload the generated page as a separate CI artifact
- [x] 2.4 Embed Vazirmatn and open the packaged page from Designer Home, Designer Help and CG Control Station setup

## 3. Verification

- [x] 3.1 Test disabled cards, hosted links and the missing-version build refusal
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
- [ ] 3.7 Read the 1.2.0 Windows installer and Linux Playwright runs before handoff.
