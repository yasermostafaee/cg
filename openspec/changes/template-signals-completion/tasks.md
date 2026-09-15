# Tasks

Lane: **FULL LANE** throughout — path to air, a new HTTP route on the bridge, the page runtime.

Each numbered item is its own commit, its own full green gate, and its own step-level Linux
`e2e` discharge. **A ticked box with no run URL beside it is a claim, not a discharge.**

## 0. The record, before building

- [x] 0.1 This change created and validated `--strict`
- [x] 0.2 `C-013` → `[~]` with the change dir; `C-017` annotated with the date, not rewritten
- [x] 0.3 ADR 0009 gains a dated section for the owner's decision of 2026-09-15
- [x] 0.4 `C-035` filed — per-pass reporting, noted and not built
- [x] Docs-only commit `fcb50300` · no e2e owed (no source/test/build file changed)

## 1. The page emits

- [x] 1.1 `CgControl` gains `take`; `readCgControl` lifts it defensively, member by member
- [x] 1.2 `PlayoutControllerOptions` gains `onSelfEnd`, fired from the two self-end rows only
- [x] 1.3 The runtime emits `self-end` for the GLOBAL ROOT only, before the settle is announced
- [x] 1.4 The runtime lifts `control.take` on BOTH doors — `play(data)` and `update(data)`
- [x] 1.5 A completion-ping adapter posts same-origin, once per token, swallowing every failure
- [x] 1.6 The served page's CSP gains `connect-src 'self'`; the boot script installs the adapter
- [x] 1.7 RED FIRST: no emit on operator stop / manual / infinite, written before the emit existed
- [x] 1.8 `SECURITY.md` and `phase-4-export-architecture.md` corrected — the code made them false
- [x] Gate green (uncached, exit 0) · commit `f7fd432f`

  ⚠ **This commit's OWN run was RED, and it is discharged by a LATER `dev` HEAD instead.**
  [35007222705](https://github.com/yasermostafaee/cg/actions/runs/35007222705) failed with FOUR
  Playwright failures across THREE unrelated subsystems — the Runtime picker's slot geometry,
  the Designer's live-source ids and its `looks` stage render, and the Designer's
  premultiplied-alpha video import. None touches a CSP directive or a lifecycle event.

  The discharge is [35009537814](https://github.com/yasermostafaee/cg/actions/runs/35009537814)
  on `bf00530b`, whose `e2e` job **RAN** and passed. That commit's tree CONTAINS every line of
  this one plus a bridge-only diff, and the `e2e` job is whole-tree rather than diff-scoped — so
  a green run there verifies this code, which is exactly the "a later `dev` HEAD that contains
  the change is fine" case. The four failures were load flakes (the `B-098` class) on CI.

## 2. The bridge receives

- [x] 2.1 `TemplateHttpServer` accepts an injected completion handler
- [x] 2.2 `POST /complete` parses a bounded body and answers `404` on anything else
- [x] 2.3 A rejected report is logged and never acted on
- [x] 2.4 RED FIRST: GET, malformed body and unknown token each answer `404` with no side effect
- [x] Gate green (uncached, exit 0) · commit `bf00530b` · e2e run
      [35009537814](https://github.com/yasermostafaee/cg/actions/runs/35009537814) — `e2e` job
      RAN, `conclusion: success`

## 3. The bridge stops

- [x] 3.1 `TEMPLATE_ACTOR` beside `UNATTRIBUTED_ACTOR`; `normalizeActor` refuses it from the wire
- [x] 3.2 The bridge mints a token at `#sendAdd` and keeps the live-take map
- [x] 3.3 A valid report runs the SAME internal stop (`stopItem`), under the template actor
- [x] 3.4 Two conditions read once: the token names a live take AND the row is on air
      (`exiting` excluded — that exclusion IS the operator race)
- [x] 3.5 Matching spends the token, so primary + backup produce one stop
- [x] 3.6 RED FIRST: the wire shows exactly one `CG … STOP` for two reports of one take
- [x] 3.7 `escaping` and `serve-render` strip the control key as the PAGE does, and newly assert
      the token IS present — strengthened, not loosened
- [x] Gate green (uncached, exit 0) · commit `f46974a4` · e2e run
      [35012950757](https://github.com/yasermostafaee/cg/actions/runs/35012950757) — `e2e` job
      RAN, `conclusion: success`

## 4. The token rides and is refreshed

- [x] 4.1 The resident-producer take path tells the page its new token before the play
- [x] 4.2 The tell is unconditional — a look-less template needs the token too
- [x] 4.3 A failed tell does not refuse the take; the mint precedes the send, which is the safe
      order (minting on success would let the finished run's token stop the new one)
- [x] 4.4 RED FIRST: a report carrying the PREVIOUS take's token after a re-take is ignored —
      **it failed before this item, which is the proof the hole was real**
- [x] Gate green (uncached, exit 0) · commit `750b28ea` · e2e run
      [35015018201](https://github.com/yasermostafaee/cg/actions/runs/35015018201) — `e2e` job
      RAN, `conclusion: success`

## 5. Mock and e2e

- [x] 5.1 `MockRuntime` mints and rotates a token, and models the completion receipt
- [x] 5.2 A test-only hook simulates "the page finished" — never a timer in product code
- [x] 5.3 E2E: a self-ending row leaves ON AIR on the simulated signal, and rests READY
- [x] 5.4 E2E: a row nothing reports on stays ON AIR — the shared consequence of `manual`,
      infinite and a lost signal. The LIFECYCLE decision itself is pinned in the page, where it
      is made (`self-end-signal`, `self-end-event`); the mock is deliberately not taught it
- [x] 5.5 E2E: a stale token does nothing, with the fresh token as the positive control
- [x] 5.6 A pre-existing `MockRuntime` settle race fixed — found by 5.3, 3 failures in 30 runs
- [x] Gate green (uncached, exit 0) · Windows: full Runtime e2e 235 passed; the new spec 30/30
      under `--repeat-each=5` · commit `6353005d` · e2e run
      [35018788151](https://github.com/yasermostafaee/cg/actions/runs/35018788151) — **result
      not yet read at hand-over; it was still in progress.** Read it before treating item 5 as
      discharged.

## 6. The record, after building

- [x] 6.1 ADR 0009's plant walkthrough step 3 AMENDED — it expected the row to still claim ON
      AIR, citing `C-013`/`C-017` as open. This change closed that, so the string was false.
- [x] 6.2 The §3 plant checks written into ADR 0009 beside the decision
- [x] 6.3 This file carries every commit beside its run URL
- [ ] Gate green · commit `________` · e2e run `________`

## 7. Owed on the plant — NOT dischargeable here

The full list, with what to read and how to tell two failures apart, is in ADR 0009 under
**The plant checks this owes**. In brief:

- [ ] 7.0 RE-IMPORT EVERY TEMPLATE first — the page is baked at import (`C-034`)
- [ ] 7.1 A logo set to 2 passes stops reading ON AIR by itself within about a second; PLAY
      brings it back at once
- [ ] 7.2 A timed auto-out title: the same
- [ ] 7.3 A template whose authored run is finite: the same
- [ ] 7.4 An infinite loop and a `manual` graphic never stop themselves
- [ ] 7.5 A manual STOP pressed just before the end: one stop, no error
- [ ] 7.6 The bridge restarted mid-run: the row stays as it is today (the lost-signal case)
- [ ] 7.7 With the backup server connected: one stop, not two

⚠ **The one hop no test in this repo can reach** is `fetch` from a served page inside CasparCG's
CEF. Everything upstream of it is measured — the CSP in a real engine, the page's emitter and
reporter, the `CG … STOP` on the wire, the console's row. The hop itself is the `B-066` class:
verify, never assume.
