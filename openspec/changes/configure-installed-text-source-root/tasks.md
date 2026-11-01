# Tasks — installed shared-text root

Lane: **FULL** — this changes CG Bridge's installed configuration and Windows setup behavior.

## 1. Contract and implementation

- [x] 1.1 Add `B-357` and the installed-delivery requirement.
- [x] 1.2 Add the optional Shared files folder field and native folder picker to CG Bridge Setup;
      load stored configuration and refuse a selected folder that is not currently reachable.
- [x] 1.3 Add `/TEXTSOURCEROOT=` to NSIS and persist it through the existing Bridge configuration
      writer without hardcoding any station path.
- [x] 1.4 Extend model/layout, silent installer and setup-window regression coverage.
- [x] 1.5 Grant the service inherited read/execute access to the effective local root on install and
      upgrade; warn instead of mutating permissions for a direct remote UNC root.
- [x] 1.6 Extend the Windows installer smoke to prove least-privilege local access and upgrade repair.
- [x] 1.7 Add station-wide shared-files get/set channels and a station-admin CG Control setting;
      validate with the Bridge service identity before persisting, and leave the current path intact
      on refusal.

## 2. Verification and delivery

- [x] 2.1 Strict-validate the OpenSpec change and run targeted setup/Bridge tests.
- [x] 2.2 Run the repository gate and required local/CI E2E lanes.
- [x] 2.3 Build and verify the next matching three-installer set.
- [ ] 2.4 Strict-validate the revised contract, run targeted checks and the repository gate, then
      deliver the corrected next-version installer set.
