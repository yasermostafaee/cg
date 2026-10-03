# console-polish — tasks

Lanes (CLAUDE.md "Cadence"): FAST — `B-302`, `R-080`, `R-082` (what the screen looks like). FULL — `B-305`
(the e2e harness), `B-303` (the naming helpers every surface calls, and the `Unavailable` decision on the
default), `R-081` + `B-304` (the check's lines and the sign-in gate), `B-301` (the Load path and a new stack
route), `B-300` (a new publish channel), `R-083` (a new IPC channel, a persisted file layout).

## 0. Establish and record

- [x] 0.1 §0 measured (design.md): the template lists, the badge, the picker, first-run, the sign-in screens,
      the audit, the 9250 collision; `first-run.spec.ts:129` reproduced on `acfce121`
- [x] 0.2 PRD: `B-300`…`B-305` filed in `bugs-runtime.md`, `R-080`…`R-083` in `runtime.md`, all `[~]`
- [x] 0.3 Before screenshots in `Claude outputs/` (`CONSOLE-POLISH-01-item<n>-before-*`)

## 1. `B-305` — the 9250 collision

- [ ] 1.1 `pgm-return.spec` on its own loopback address, the rule port kept
- [ ] 1.2 The three specs in one parallel batch, green; gate; pushed; CI read

## 2. FAST batch — `B-302`, `R-080`, `R-082`

- [ ] 2.1 `B-302`: the picker's tab strip takes the rows' inset; e2e measures it
- [ ] 2.2 `R-080`: the CG Bridge field's placeholder and hint
- [ ] 2.3 `R-082`: `PasswordInput`; `SignInCard`; the three screens; Enter from any field; no prose; dom +
      e2e
- [ ] 2.4 Batch gate; pushed; CI read; after screenshots

## 3. `B-303` — names in their own direction; the default's mark

- [ ] 3.1 The direction rule in the naming helpers; the choice label carries its name apart
- [ ] 3.2 The departed default reads `Unavailable`
- [ ] 3.3 dom + e2e (each surface's runs measured); gate; pushed; CI read; after screenshots

## 4. `R-081` + `B-304` — the check's groups

- [ ] 4.1 `CONNECTION_CHECK_GROUPS`; the bridge's new lines (CG Bridge's session, OSC, license, channels)
- [ ] 4.2 The console's lines (CG Bridge found at, versions, this console's sign-in); grouped rendering
- [ ] 4.3 The Sign in section's blocker only with a verdict; `first-run.spec` scoped
- [ ] 4.4 Station setup's check is the same list; tests; gate; pushed; CI read; after screenshots
- [ ] 4.5 `first-run.spec.ts` 3 of 3 locally

## 5. `B-301` — row errors

- [ ] 5.1 The Loads check before they create; a refused Load leaves nothing
- [ ] 5.2 Restored slotless error items dropped at start, logged
- [ ] 5.3 The badge counts row errors; its list; `stack.dismiss-error`
- [ ] 5.4 Tests (bridge integration, dom, e2e); gate; pushed; CI read

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

## 8. Close

- [ ] 8.1 `pnpm openspec validate --all --strict`; the report
      `Claude outputs/REPORT-CONSOLE-POLISH-01-v1-<date>.md`
