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
      green, jobs RUN — PR <https://github.com/yasermostafaee/cg/actions/runs/37129785632> (its e2e job
      RAN: runtime 322 passed, designer 293), Desktop
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
- [x] 5.4 Tests (bridge integration, reconciler, dom, e2e `row-errors.spec`); gate; pushed `e88240ad` +
      `45ec300b`. CI RED — PR <https://github.com/yasermostafaee/cg/actions/runs/37134392265>: its
      `E2E (Playwright)` RAN (runtime 319 passed, 1 failed; designer 293) and `retention-honesty.spec.ts:252`
      (B-107) failed, because its errored row was a refused Load's leftover, which B-301 removed (the
      sweep missed this spec). Desktop <https://github.com/yasermostafaee/cg/actions/runs/37134392283>
      green. Fixed `bd072187` (the errored row is a refused take on its layer; 5/5 locally); CI: see 6.3

## 6. `B-300` — the open picker follows the bridge

- [x] 6.1 `templates.acted`; the bridge publishes it; scope classified (`STATION_WIDE`, as
      `templates.changed`); the mock publishes it too
- [x] 6.2 The picker listens while open (`templates.changed` re-reads its channel; `templateActs.ts`
      decides "another console" from this console's own marked removals); the removed-on-another-console
      line; a Load refused `unknown-template` within 10 s of such a removal reads it
- [x] 6.3 Tests: bridge (`template-persistence`), WebSocket round-trip, dom (`templatePicker.followsBridge`,
      `layerRow.loadRemovedElsewhere`; both ablations go red), e2e `two-consoles.spec` §1 (2/2 locally);
      gate 99/99 uncached; pushed `4ed7e807` (with `bd072187`); CI COMPLETED green, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37136440487> (`E2E (Playwright)` RAN: runtime
      325 passed — `retention-honesty.spec.ts:252` and `two-consoles.spec.ts:287` among them — designer
      293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/37136440473> (Installers,
      Installer smoke, CG Bridge smoke)

## 7. `R-083` — the paged audit

- [x] 7.1 `@cg/audit`: rotation (local midnight, 20 MB, named by the first row), retention (90 days,
      200 MB), the backwards page reader (one handle per file; a rotation mid-read re-reads the list);
      `auditMatches` in `@cg/shared-ipc` with the row naming moved there (design decision 6)
- [x] 7.2 `audit.page` (the grant applied before the page is cut), `audit.appended` (scoped per row);
      `channel-scope` census fixtures; mock parity. `auth.sign-out` now clears its session BEFORE its row
      is recorded: the row's push asked the leaving socket's auth state, which re-noted the bearer the
      route had just released (`station-channels-discovery` caught a Playout read on behalf of nobody;
      the push ablated, it passed)
- [x] 7.3 The LOG dialog: paged, virtualised (`useVirtualWindow`), bridge-side filters (Channel added)
      and search, live rows; the count is the rows held
- [x] 7.4 `logs.zip` carries every kept audit file under `audit/`; a file renamed by a rotation between
      listing and reading is listed and read again (found when the pre-push gate of `2381c1f8` reddened
      `http-tickets` — its seeded row was from an earlier day, so a sign-in rotated the file mid-download).
      Pushed `d73205c2` (with `2381c1f8`); CI COMPLETED green, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37143906005> (`E2E (Playwright)` RAN: runtime
      326 passed, designer 293), Desktop <https://github.com/yasermostafaee/cg/actions/runs/37143906006>
- [x] 7.5 Tests: `@cg/audit` `page.test` (50,000 rows: first page < 250 ms; paging; a filter; a rotation
      between pages; rotation and retention), bridge `audit-page.integration` (a scoped console's full
      page; the search by a row's alias; the push scoped), `http-tickets` (the zip), dom
      `auditPanel.paging` + the seven `auditPanel.*` specs moved to pages, e2e `audit-paging.spec`
      (50,000 rows: first rows 158 ms after the press, 18 rows in the document; the next page at the
      end; a filter; a live row at the top — 12/12 with the audit and row-error specs). The first push
      (`d67cd310`) was refused by the gate's coverage floor (`@cg/audit` branches, `@cg/shared-ipc`
      functions): tests added where the code lives (`ba818c37`), no threshold touched. Gate 99/99
      uncached; pushed `ba818c37`; CI COMPLETED green, jobs RUN — PR
      <https://github.com/yasermostafaee/cg/actions/runs/37140336493>: attempt 1's `E2E (Playwright)`
      RAN (runtime 326 passed, `audit-paging.spec.ts` among them; designer 293); its unit job went red
      on `plate-band.integration.test.ts:174` (`Unterminated string in JSON` — the test's boot poll read
      a half-written line of the mock's wire trace; this change sends no AMCP; unfiled), and attempt 2
      of that job RAN green with it passing. Desktop
      <https://github.com/yasermostafaee/cg/actions/runs/37140336485> (Installers, Installer smoke, CG
      Bridge smoke)
- [x] 7.6 `playout-auth-reload.spec.ts:170` polls the record, and reads every file of it (it read once;
      red once under four local workers, green alone 2/2)

## 8. Close

- [x] 8.1 `pnpm openspec validate --all --strict` (92 passed); the report
      `Claude outputs/REPORT-CONSOLE-POLISH-01-v1-2026-10-03.md`
- [ ] 8.2 The owner's own-PC check of each item; then archive (on the owner's word)
