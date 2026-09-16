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
  Playwright specs, **named here rather than summarised** (`REPLY 1` §R4):

  | spec                                        | case                                                          | seen before?                        |
  | ------------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
  | `runtime/e2e/picker-manage-chrome.spec:213` | §D1 — Import occupies the SAME slot in both views             | **NO** — first time ⇒ `P-048`       |
  | `designer/e2e/looks.spec:75`                | the 6-box debate … the selector switches the canvas           | **NO** — first time ⇒ `P-048`       |
  | `designer/e2e/live-source.spec:511`         | MULTIPLE independent Live Sources each get their own id       | yes — ADR 0009 (knife-edge fixture) |
  | `designer/e2e/video-import.spec:291`        | a premultiplied-alpha source imports WITHOUT the black fringe | yes — ADR 0009 (decode contention)  |

  None touches a CSP directive or a lifecycle event. The two first-time failures are filed as
  [`P-048`](../../../docs/prd/platform.md); the two already-assessed ones are NOT re-filed.

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
      [35018788151](https://github.com/yasermostafaee/cg/actions/runs/35018788151) — `e2e` job
      RAN, `conclusion: success`. ⚠ The line above this one said "still in progress, read it
      before treating item 5 as discharged"; it completed green and the claim is now the read
      one rather than the pending one.

## 6. The record, after building

- [x] 6.1 ADR 0009's plant walkthrough step 3 AMENDED — it expected the row to still claim ON
      AIR, citing `C-013`/`C-017` as open. This change closed that, so the string was false.
- [x] 6.2 The §3 plant checks written into ADR 0009 beside the decision
- [x] 6.3 This file carries every commit beside its run URL
- [x] Docs-only commit `d6d895a4` · its gate is `openspec validate --all --strict` (82
      passed) + `format:check` (clean), per the docs-only carve-out — no source, test or build
      file changed, so no Linux `e2e` is owed by it
- [x] 6.4 This file's own stale line about run `35018788151` corrected once the run landed

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

## 8. `REPLY 1` — two token holes checked, the CSP decision recorded

- [x] 8.1 R1 — the pre-PLAY tell carries ONLY `__cg` (no fields, so no last-sent values and no
      unsent draft). Measured on the wire, not on the builder
- [x] 8.2 R1 — on-air field values, the operator's COUNT, and a running content-driven hold all
      survive the tell; a tell mid-run does not restart it. **No hole found — no product change**
- [x] 8.3 R2 — host census: `withCgControl` has five call sites, four in the bridge and ONE
      outside it (`RehearsalFrame`). A `take` is composed in exactly two places, both bridge
- [x] 8.4 R2 — PVW is handed NO take token, proved in Chromium against the running app; and a
      `srcdoc` frame reports `about:srcdoc`, which the reporter's protocol guard already refuses.
      **No hole found — no product change**
- [x] 8.5 R3 — `connect-src 'self'` recorded as the OWNER'S DECISION of 2026-09-16 in
      `SECURITY.md` and ADR 0009
- [x] 8.6 R3 — the control WebSocket is a different origin: `DEFAULT_BRIDGE_PORT` (`ws-frame.ts`,
      bound at `bridge.ts`) vs the template server's ephemeral port (`deriveServeOptions`)
- [x] 8.7 R3 — the route set is now `TEMPLATE_SERVER_ROUTES`; the router consults it and nothing
      else, and `template-server-route-set.test.ts` pins it. Ablation: a planted `GET /identity`
      fails the pin
- [x] 8.8 R4 — the four flakes named above; `P-048` filed for the two that were first-time
- [x] 8.9 R5 — the LOG line MEASURED and quoted into ADR 0009's plant check 1
- [ ] Gate green · commit `________` · e2e run `________`
