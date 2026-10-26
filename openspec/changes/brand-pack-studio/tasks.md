# Tasks — Brand Pack Studio

Lane: **FULL** — this local UI persists customer configuration and produces playout artifacts.

## 1. Contract and workspace

- [x] 1.1 Record P-069 and strict OpenSpec requirements: private loopback tool, no installer, local
      external workspace, no Designer starter integration
- [x] 1.2 Implement canonical workspace layout, safe customer ids, atomic JSON writes and delivery
      enumeration
- [x] 1.3 Cover repository-boundary, restart, invalid-document and previous-valid-document behavior
      (`studio-workspace.test.ts`)

## 2. Local server and API

- [x] 2.1 Add `studio` CLI command with configurable port/workspace, loopback-only binding and
      local Host-header enforcement
- [x] 2.2 Add customer CRUD-without-delete, validate, build, delivery-file and master-inspection API
      routes with body/path limits
- [x] 2.3 Route validation/build through `preparePack` and `writeDelivery`; Studio builds always run
      preview QC and create append-only timestamped deliveries
- [x] 2.4 Accept pnpm's literal `--` script delimiter so the documented root command works with the
      repository's current pnpm version

## 3. Browser operating surface

- [x] 3.1 Add Persian/RTL responsive customer list and customer creation
- [x] 3.2 Add structured Brand Kit forms for target, colours, fonts, logo/assets and licence evidence
- [x] 3.3 Add template recipe forms, explicit mapping rows, preview data and read-only master
      inspection results
- [x] 3.4 Add save/validate/build progress, readable errors and delivery history/contact-sheet links

## 4. Isolation and documentation

- [x] 4.1 Keep Designer landing/starter catalogue untouched and add a regression census proving the
      Studio has no Designer integration path
- [x] 4.2 Add the root start command and document port, workspace layout, operation and backup

## 5. Verification

- [x] 5.1 Focused typecheck/lint/unit tests green: 22/22 tests plus package typecheck/lint/build;
      includes the pnpm literal-delimiter regression
- [x] 5.2 Real-browser Studio E2E covers restore → edit/save → inspect → validate/build →
      restart-visible and responsive RTL layout at 1280/390 px; both package Playwright tests green
- [x] 5.3 Full local gate green: 103/103 tasks; strict OpenSpec 90/90
- [x] 5.4 Pushed through `4f730e0f` to `dev`; Linux CI completed green, including the E2E job:
      <https://github.com/yasermostafaee/cg/actions/runs/40285911739>
- [ ] 5.5 Request owner confirmation before archive

## 6. Owner UX follow-up (reported 2026-10-26)

- [ ] 6.1 Mark every required Brand Kit/recipe/mapping field visibly and distinguish optional fields
- [ ] 6.2 Add short field guidance plus a next-incomplete-step summary before save/validate/build
- [ ] 6.3 Add read-only, end-to-end examples showing distinct output types, with representative
      preview/delivery evidence
- [ ] 6.4 Allow an example to be copied into a new independent customer; examples remain outside the
      customer workspace and Designer starter catalogue
- [ ] 6.5 Cover required-state guidance, example inspection/copy and Designer isolation in unit and
      real-browser tests
