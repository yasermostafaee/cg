# Tasks — Brand Pack Studio

Lane: **FULL** — this local UI persists customer configuration and produces playout artifacts.

## 1. Contract and workspace

- [x] 1.1 Record P-069 and strict OpenSpec requirements: private loopback tool, no installer, local
      external workspace, no Designer starter integration
- [ ] 1.2 Implement canonical workspace layout, safe customer ids, atomic JSON writes and delivery
      enumeration
- [ ] 1.3 Cover repository-boundary, restart, invalid-document and failed-atomic-write behavior

## 2. Local server and API

- [ ] 2.1 Add `studio` CLI command with configurable port/workspace, loopback-only binding and
      local Host-header enforcement
- [ ] 2.2 Add customer CRUD-without-delete, validate, build, delivery-file and master-inspection API
      routes with body/path limits
- [ ] 2.3 Route validation/build through `preparePack` and `writeDelivery`; Studio builds always run
      preview QC and create append-only timestamped deliveries

## 3. Browser operating surface

- [ ] 3.1 Add Persian/RTL responsive customer list and customer creation
- [ ] 3.2 Add structured Brand Kit forms for target, colours, fonts, logo/assets and licence evidence
- [ ] 3.3 Add template recipe forms, explicit mapping rows, preview data and read-only master
      inspection results
- [ ] 3.4 Add save/validate/build progress, readable errors and delivery history/contact-sheet links

## 4. Isolation and documentation

- [ ] 4.1 Keep Designer landing/starter catalogue untouched and add a regression census proving the
      Studio has no Designer integration path
- [ ] 4.2 Add the root start command and document port, workspace layout, operation and backup

## 5. Verification

- [ ] 5.1 Focused typecheck/lint/unit tests green
- [ ] 5.2 Real-browser Studio E2E covers create → edit → restart-visible → inspect → validate/build
      result and responsive RTL layout
- [ ] 5.3 Full local gate green
- [ ] 5.4 Push to `dev` and record completed green Linux CI including the E2E job
- [ ] 5.5 Request owner confirmation before archive
