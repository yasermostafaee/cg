# Tasks — `check-rerun` (`CHECK-RERUN-01`)

Lane: **FULL** — the bridge's check (a predicate that decides what an operator sees) and a widened
IPC response enum (`skip`).

## 1. The contract

- [x] 1.1 `@cg/shared-ipc` — `ConnectionCheckLineSchema.status` gains `skip`;
      `connectionCheckSubject(id, host, port)`, the one spelling of each line's subject

## 2. The bridge — one fault is said once

- [x] 2.1 The API line carries its reading (`noSignIn`: `null`, or why no sign-in can work)
- [x] 2.2 AMCP is probed in parallel and worded once the API line is known
- [x] 2.3 `byTheApiLine` — the one dependency rule: CORS `skip` with the reason; AMCP's sign-in
      wait only while a sign-in can happen, else its own result said plainly
- [x] 2.4 C1's timings read after the wording, in the order the lines finished

## 3. The console — a re-check starts clean

- [x] 3.1 `checkingLines(address)` — every line's subject, `checking`, the moment Check is pressed
- [x] 3.2 `PlayoutConnection` — runs tagged; only the latest writes lines, busy and judging; a
      bridge error clears the lines
- [x] 3.3 `ConnectionCheckList` — `skip` (dashed ring) and `checking` (the moving loader, still
      under reduced motion) in the quiet inks; `aria-busy` while checking

## 4. Tests (each absence with its positive control)

- [x] 4.1 `tools/caspar-bridge/tests/connection-check.test.ts` — API down: CORS `skip`, the
      no-answer said once (control: API up, CORS fails on its own); no keys: the reason is the
      keys; AMCP before sign-in with the API down is its own result, refused / no answer / the
      bound (control: API up and refused waits for sign-in; an answer passes). Red-first: 5 of 22
      fail against the old source.
- [x] 4.2 `apps/runtime/tests/playoutConnectionRecheck.dom.test.ts` — the re-check shows no ✓/✗
      until its reply (control: the reply fills in); the stale reply in both orders (control: the
      current reply writes); a bridge error leaves no line checking; the inks (control: `fail` is
      the error ink). Red-first: 4 of 5 fail against the old `PlayoutConnection`.
- [x] 4.3 `apps/runtime/tests/e2e/first-run.spec.ts` — the Playout off against a silent fake: said
      once, CORS not checked, AMCP never waiting; a re-check turns every line to checking, then
      fills in. The AMCP control is the first test there (the Playout on, AMCP refused: waiting).

## 5. Docs

- [x] 5.1 The operator guide's first-run step; the Playout 2.8.54 facts note (C7)

## 6. Verify

- [ ] 6.1 Prettier; plain `pnpm gate`; `pnpm openspec validate --all --strict`
- [ ] 6.2 The Linux `e2e` on the pushed commit — a COMPLETED, GREEN run whose `e2e` job RAN
- [ ] 6.3 The installers on the pushed commit
