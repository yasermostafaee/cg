# Tasks — installed shared-text root

Lane: **FULL** — this changes CG Bridge's installed configuration and Windows setup behavior.

## 1. Contract and implementation

- [x] 1.1 Add `B-357` and the installed-delivery requirement.
- [x] 1.2 Add the optional Shared text folder field and native folder picker to CG Bridge Setup;
      load stored configuration and refuse a selected folder that is not currently reachable.
- [x] 1.3 Add `/TEXTSOURCEROOT=` to NSIS and persist it through the existing Bridge configuration
      writer without hardcoding any station path.
- [x] 1.4 Extend model/layout, silent installer and setup-window regression coverage.

## 2. Verification and delivery

- [ ] 2.1 Strict-validate the OpenSpec change and run targeted setup/Bridge tests.
- [ ] 2.2 Run the repository gate and required local/CI E2E lanes.
- [ ] 2.3 Build and verify the next matching three-installer set.
