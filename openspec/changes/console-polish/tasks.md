# console-polish — tasks

Lanes (CLAUDE.md "Cadence"): FAST — `B-302`, `R-080`, `R-082` (what the screen looks like). FULL — `B-305`
(the e2e harness), `B-303` (the naming helpers every surface calls, and the `Unavailable` decision on the
default), `R-081` + `B-304` (the check's lines and the sign-in gate), `B-301` (the Load path and a new stack
route), `B-300` (a new publish channel), `R-083` (a new IPC channel, a persisted file layout).

Gates: each push ran `pnpm gate` (99/99, 0 cached) on the working tree; uncommitted work of the next item
was stashed before each push so the gate judged only what was pushed.

## 0. Establish and record

- [x] 0.1 §0 measured (design.md): the template lists, the badge, the picker, first-run, the sign-in screens,
      the audit, the 9250 collision; `first-run.spec.ts:129` reproduced on `acfce121`
- [x] 0.2 PRD: `B-300`…`B-305` filed in `bugs-runtime.md`, `R-080`…`R-083` in `runtime.md`, all `[~]`
- [x] 0.3 Before screenshots in `Claude outputs/` (`CONSOLE-POLISH-01-item<n>-before-*`)

## 1. `B-305` — the 9250 collision

- [x] 1.1 `pgm-return.spec` on its own loopback address, the rule port kept — positive control first: the
      OLD spec beside `channel-air.spec` and `pvw-from-bridge.spec`, three workers, failed (its hidden-boot
      test saw 1 connection); the new one passed the same batch twice (9/9, 9/9)
- [x] 1.2 Pushed `40a5e555` (with `0b77edad`); CI COMPLETED green, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37125562265> (`E2E (Playwright)` RAN: runtime 318
      passed, designer 293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/37125562199>
      (Installers, CG Bridge smoke, Installer smoke)

## 2. FAST batch — `B-302`, `R-080`, `R-082`

- [x] 2.1 `B-302`: the picker's tab strip takes the rows' inset; `playout-sources.spec` measures it
- [x] 2.2 `R-080`: the CG Bridge field's placeholder and hint (`playoutAddressGate.dom`,
      `playout-address-gate.spec`)
- [x] 2.3 `R-082`: `PasswordInput`; `SignInCard`; the three screens; Enter from any field; no prose; dom +
      e2e (the token fix `82e7b133` after the pre-push gate refused a raw `padding`)
- [x] 2.4 Pushed `82e7b133` (with `B-304`); CI COMPLETED green, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37128376100> (`E2E (Playwright)` RAN: runtime 319
      passed, designer 293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/37128376143>; after
      screenshots `CONSOLE-POLISH-01-item{3,5,7}-after-*`

## 3. `B-303` — names in their own direction; the default's mark

- [x] 3.1 The direction rule in the naming helpers; the choice label carries its name apart
- [x] 3.2 The departed default reads `Unavailable`
- [x] 3.3 dom + e2e (`source-names-bidi.spec` measures each surface's runs); pushed `62b7fe66`; CI COMPLETED
      green, jobs RUN — PR <https://github.com/yasermostafaee/cg/actions/runs/37129785632> (`E2E
  (Playwright)` RAN: runtime 322 passed, designer 293), Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/37129785734>; after screenshots
      `CONSOLE-POLISH-01-item4-after-*`; the tag's gap `17654bd4`

## 4. `R-081` + `B-304` — the check's groups

- [x] 4.1 `CONNECTION_CHECK_GROUPS`; the bridge's new lines (CG Bridge's session, OSC, license, channels)
- [x] 4.2 The console's lines (CG Bridge found at, versions, this console's sign-in); grouped rendering
- [x] 4.3 The Sign in section's blocker only with a verdict; `first-run.spec` scoped (`B-304`, `82e7b133`)
- [x] 4.4 Station setup runs the same list for an admin; tests; pushed `c1c985aa` (with `17654bd4`); CI
      read: see 4.6
- [x] 4.5 `first-run.spec.ts:129` 3 of 3 locally (it had never passed on this host). Its serial sibling
      `FIELD-FIXES-01 I` fails on THIS host only: the owner's installed `CGBridge` service holds UDP
      `127.0.0.1:6251`, the OSC port first-run writes — CI is its evidence
- [x] 4.6 CI COMPLETED green for `17654bd4`, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37131599133> (`E2E (Playwright)` RAN: runtime 322
      passed, designer 293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/37131599096>
      (Installers, Installer smoke, CG Bridge smoke); after screenshots `CONSOLE-POLISH-01-item6-after-*`

## 5. `B-301` — row errors

- [x] 5.1 The Loads check before they create; a refused Load leaves nothing
- [x] 5.2 Restored slotless error items dropped at start, logged
- [x] 5.3 The badge counts row errors (`isRowError`); its list; `stack.dismiss-error`
- [ ] 5.4 Tests (bridge integration, reconciler, dom, e2e `row-errors.spec`); gate; pushed; CI read

## 6. `B-300` — the open picker follows the bridge

- [ ] 6.1 `templates.acted`; the bridge publishes it; scope classified
- [ ] 6.2 The picker listens; the removed-on-another-console line; the Load refusal's wording
- [ ] 6.3 Two consoles on one bridge e2e; gate; pushed; CI read

## 7. `R-083` — the paged audit

- [ ] 7.1 `@cg/audit`: rotation, retention, the backwards page reader, `auditMatches`
- [ ] 7.2 `audit.page`, `audit.appended`; scoped; mock parity
- [ ] 7.3 The LOG dialog: paged, virtualised, bridge-side filters and search, live rows
- [ ] 7.4 `logs.zip` carries the audit files
- [ ] 7.5 Tests (50,000 rows < 1 s, ≤ 100 rendered; paging; a filter; live); gate; pushed; CI read
- [ ] 7.6 `playout-auth-reload.spec.ts:170` polls the audit file (it read once; red once under four local
      workers, green alone 2/2)

## 8. Close

- [ ] 8.1 `pnpm openspec validate --all --strict`; the report
      `Claude outputs/REPORT-CONSOLE-POLISH-01-v1-<date>.md`
