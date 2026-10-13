# Session BT — `B-155` §B/§C/§D: one live reconcile at a time per item, the owed measurements re-based on 2.5.0, and the plant walk

> 🔴 **RECONSTRUCTED AFTER THE FACT, by session BU on 2026-08-23, at the owner's instruction
> (`PATCH-BU-01` §4). BT wrote no handoff of its own.**
>
> **Everything below is drawn strictly from what the record says** — the three commits
> (`8e80fdf7`, `57e07795`, `4777b724`), `openspec/changes/multibox-layout-switch/tasks.md`, and
> `docs/recon/2026-08-22-b155-switch-flash-walk.md`. **Nothing is inferred and nothing is
> invented.** Where the record is silent, this page says it is silent rather than filling the gap
> — see §5, which is a list of silences, not a list of findings.
>
> **Letter:** `BT`. Its work sat between `BS` and `BU`; `BU`'s own handoff records how the letter
> was derived.

## 0. State, as the record shows it

| Fact           | Value                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Commits        | `8e80fdf7` (the lock), `57e07795` (§C re-base + §D walk), `4777b724` (the discharge record) — all 2026-08-22, 18:44–18:58 +0330 |
| Files touched  | 13 across the three commits; `caspar-bridge/src/caspar-runtime.ts` is the only product source                                   |
| **On air**     | 🔴 **YES — see §1.** This is the one session in the `BN`–`BU` run that changed on-air bridge behaviour                          |
| Owed e2e       | ✅ DISCHARGED for the case-4 fix by run URL (§4) — and that discharge covers the CLASSIFIER debt only                           |
| Owed on plant  | 🔴 **STILL OWED — `7.15` is unticked and only the plant walk can tick it** (§3)                                                 |
| Co-author line | `Claude Fable 5` on all three commits                                                                                           |

---

## 1. 🔴 THE ON-AIR FLAG — `#withLiveSeatLock` (`8e80fdf7`)

**What it changed.** `caspar-runtime.ts` gained `#withLiveSeatLock` (the record locates it at
`caspar-runtime.ts:4806`): **one live reconcile at a time, per item.** It gates three live doors —
`setActiveLook`, `swapLiveSource`, and `update`'s binding transaction — **each through its page
flip**.

**What it deliberately does NOT gate, and why.** `take` and `out` are **ungated on purpose**: in
the commit's own words, _"the repair verb must never queue behind what it repairs."_ That is a
decision recorded as a decision, not an omission.

**The defect it closes,** as `tasks.md` case 4 states it: `bridge.ts:594` dispatches requests
without awaiting (`void handleMessage`), and nothing serialized the live doors. A swap arriving
mid-switch planned against the **OUTGOING** look — `#activeLooks` is written only at the page flip
(7.9) — and against the **PRE-SWITCH** ledger, so its `PLAY` + `FILL` at the OLD geometry could
land between the switch's fills and its flip. The record also names a second fault in the same
path: both actions' `registerLiveLayers` writes came from the same `previous` snapshot — **golden
rule 7's two-reads-with-an-await-between, at the ledger.**

**The behavioural envelope, in the commit's own terms:** byte-identical sequentially, different
under concurrency. Stated there as a proven no-op on the common path — the golden-sequence test
(the full ordered wire line list of a plain switch) was **green before the lock and green after**,
while the serialization test was **red before and green after**, and asserts the queued swap
resolves the **ENTERED** look's geometry.

## 2. The measured pre-fix reading

> **the pre-fix run put the swap's `PLAY` at wire index 1, with the page flip at 21.**

Recorded identically in `8e80fdf7`'s message and in `tasks.md` case 4, and flagged there as
**measured, not inferred**. That is the whole quantitative basis for the fix: the swap's `PLAY`
landed twenty wire positions ahead of the flip it should have followed.

## 3. 🔴 What is still owed on the plant — and the exact tick condition

**`7.15` is `[ ]` and the lock did not tick it.** Both the commit and `tasks.md` say why, in the
same words: `@cg/amcp-mock` models `PLAY` on an occupied layer as an **instantaneous in-place
replace** and has no notion of producer acquisition time, so cases 2, 4-as-fixed and 5 are proven
**for ORDER only**. `tasks.md`: _"no test anywhere can see a frame. This block does not tick 7.15;
only the plant walk's frame counts can."_

**The rule being measured** (recorded as decided, so it is not re-litigated): the new look's hole
must **NEVER** show the previous source; if the incoming producer is not ready, **BLACK is
acceptable and the previous guest is not.**

⭐ **THE TICK CONDITION, verbatim in substance from the walk's step 3 of "after the walk":** only
**ZERO wrong-source counts on BOTH runs of EVERY step, with steps 2 and 9 both reading EMPTY**, is
the measurement that lets `B-155` close and `7.15` tick. **Black-only counts do not block it.** If
any wrong-source count is non-zero, the walk says: do not diagnose at the box — bring the slow-mo
video and the filled tables back.

**How it is measured:** the phone's slow-motion camera pointed at the PGM monitor, with
`frames at 25 fps = slow-mo frames × 25 ÷ slow-mo rate`, each reading reproduced twice, EYE vs
INSTRUMENT named per step.

## 4. Verification, as recorded

- ✅ **Linux `gate:e2e` DISCHARGED for the case-4 fix** —
  <https://github.com/yasermostafaee/cg/actions/runs/32581287096> — head `57e07795`, `completed` +
  `success`, **`E2E (Playwright)` job RAN** (15:18:27Z → 15:27:16Z), not skipped. Classifier scored
  the diff `kind=code needsE2e=true` (`tools/caspar-bridge/**` is not on the known-non-render list
  — the safe direction).
- ⚠ **That discharge covers the classifier debt ONLY.** `4777b724`'s own message says it:
  _"Discharges the lock commit's classifier debt only; 7.15 still owes the plant measurement and
  stays unticked."_ `tasks.md` repeats the warning beside the URL.

## 4b. §C — the re-base, and §D — the walk (`57e07795`)

**§C.** Every OWED-measurement instruction still named _"the plant's 2.3.2"_ — the **retired**
install at `D:\programs\CasparCG` that `assertProductionBuild` refuses and the probe README says
must never be probed. **21 sites corrected**: tasks/design in both changes, the `R-048` / `R-021` /
`C-013` / `C-016` / PAUSE recons in the PRD, the runbook's §C2, three test headers, and
`swapLiveSource`'s doc in the prior commit. **Historical records, handoffs and `"Original:"` blocks
were deliberately left untouched** — they record what was true at the time.

**§D.** `docs/recon/2026-08-22-b155-switch-flash-walk.md` — the owner's numbered walk: production
asserted as **2.5.0 (`69e8ad5`)** at step 1, channel read **EMPTY before and after**, the original
report verbatim, every §A residual case, PowerShell-safe throughout. Linked from `7.15` and `6.9a`.
It also carries two standing preconditions: the channel must carry **no air**, and the retired
2.3.2 must never be probed.

## 5. Where the record is SILENT — stated, not filled

- **No `pnpm gate` result is recorded** in any of the three commit messages. This page does not
  claim one was run, or that it was green.
- **No handoff, and no stated reason for its absence.** Nothing in the record says whether it was
  an oversight or a deliberate omission.
- **No "flags for the owner" list, no out-of-scope list, and no "what a future session should pick
  up".** The equivalents above are reconstructed from `tasks.md` and the walk, not from anything BT
  wrote as a handoff.
- **`8e80fdf7`'s message does not name its own e2e debt**; the discharge arrives separately in
  `4777b724`, against head `57e07795`.
- **No hardware run is recorded as having been performed** — only owed. Nothing here should be read
  as a plant reading.

## 6. What a future session should pick up

1. 🔴 **Run the plant walk.** It is the only thing that can tick `7.15` / close `B-155`, and §3
   states the pass condition exactly. It needs an off-air channel and a slow-mo phone.
2. **`6.9a` remains unverified for timing** — the re-take-of-a-still-on-air-row replace, which
   `tasks.md` case 5 says no code can improve without a forbidden CLEAR-then-PLAY window. Walk step
   5 measures it; walk step 8 confirms case 4's serialization by eye.
3. **The confidence-grab measurement rides the same visit** —
   `docs/recon/2026-08-22-confidence-grab-measurement.md` §C, whose C1/C2/C3 are raw-AMCP siblings
   of walk steps 5–6, and whose C4 is the same frame count.
