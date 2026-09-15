# Tasks

🔴 **THE EVIDENCE LIVES HERE, NOT IN THE ADR.** ADR 0009 keeps the DECISIONS; every run URL
below was moved out of it so the discharge record sits beside the work it discharges. A
ticked box with no URL is a claim, not a discharge.

⚠ **How to read the Run column.** A run discharges only if it COMPLETED, is `success`, AND
its `e2e` job actually RAN. A green run whose `e2e` was SKIPPED (`P-029`) is a statement
about the diff, not evidence about the suite — one such row is marked below and it
discharges NOTHING.

⚠ **A commit with NO RUN OF ITS OWN is not automatically undischarged.** GitHub keeps one
pending run per concurrency group, so a burst of pushes leaves middle commits without one.
The `ci` and `e2e` jobs are WHOLE-TREE, not diff-scoped, so a later green run on a
DESCENDANT covers the tree at those commits too. Each such row names its covering
descendant and the ancestry was verified, not assumed.

## 1. `TIMING-BUILD-21` — the schema, the Designer, the console section

- [x] Schema: `delayMs`, `DEFAULT_REPEAT`, `DEFAULT_DELAY_MS`, `repeatOf`, `delayMsOf`, and
      the two silent-drop sites closed with a planted-red guard each — `a53b79ea` ·
      [run 34944866939](https://github.com/yasermostafaee/cg/actions/runs/34944866939) ·
      Designer 279 + 1 flaky, Runtime 224 passed
- [x] Doc-sync — `8d85bd0d` ·
      [run 34945956177](https://github.com/yasermostafaee/cg/actions/runs/34945956177) ·
      `ci` and `e2e` both ran
- [x] The Designer authors `repeat` and `delayMs`, marked with the ADR's ownership split —
      `4e8052b1` · [run 34903938272](https://github.com/yasermostafaee/cg/actions/runs/34903938272)
- [x] The Designer's read-only marking for `mode` / `holdSource` — `3ca52a93` ·
      [run 34905101660](https://github.com/yasermostafaee/cg/actions/runs/34905101660)

## 2. `TIMING-WIRE-22` — carrying it to air

- [x] (a) the `__cg` member + (b) the page update handler — `d440cd7f` ·
      [run 34948110281](https://github.com/yasermostafaee/cg/actions/runs/34948110281) ·
      Designer 279 + 1 flaky, Runtime 224 passed
      ⭐ This run CONTAINS `a53b79ea` and `8d85bd0d` (verified with
      `git merge-base --is-ancestor`), so it covers the tree at those commits too.
- [x] (c) the per-row IPC channel gated by `#ownsLiveSeats` + (d) restore re-apply +
      (e) the publisher fast-path — `bc4222bb` ·
      [run 34950915296](https://github.com/yasermostafaee/cg/actions/runs/34950915296) ·
      Designer 280 passed, Runtime 224 passed
- [x] §4 the console's Timing section — `d3ddfcb5` ·
      [run 34954955145](https://github.com/yasermostafaee/cg/actions/runs/34954955145) ·
      Designer 278 + 2 flaky, Runtime 224 passed
- [x] Docs only — `49216e18` ·
      [run 34955455633](https://github.com/yasermostafaee/cg/actions/runs/34955455633)
      🔴 **`e2e` SKIPPED — this row DISCHARGES NOTHING.** Correct CI behaviour for a
      docs-only diff (`P-029`); recorded so nobody later reads the green beside it as
      evidence about the suite.
- [x] The restore proof — `a4ec9401` ·
      [run 34956636122](https://github.com/yasermostafaee/cg/actions/runs/34956636122)

## 3. `DELTA A` — the post-report corrections

- [x] A1 — a restore never re-sends a relative count; the adopt tell deleted — `87cdbc04` ·
      [run 34960476329](https://github.com/yasermostafaee/cg/actions/runs/34960476329) ·
      `e2e` ran, success
- [x] A2 — on air, state what was SENT; no number the console cannot see — `53a26a20` ·
      [run 34960973690](https://github.com/yasermostafaee/cg/actions/runs/34960973690) ·
      `e2e` ran, success
- [x] A6 — an old import says why — `b8f5cdc2` ·
      [run 34962521234](https://github.com/yasermostafaee/cg/actions/runs/34962521234) ·
      `ci` and `e2e` both RAN, green.
      ⚠ ADR 0009 recorded this row as "read at hand-over" with no URL. The run was found
      and is cited here; the ADR's placeholder is superseded by this line.
- [x] A5 / A7 / A8 / A9 — the filings and the plant check — `3287420f` ·
      **no run of its own** (push burst). Covered by
      [run 34964982516](https://github.com/yasermostafaee/cg/actions/runs/34964982516) on
      its descendant `4d27d01c`, whose `ci` and `e2e` both RAN green.
- [x] `.prettierignore` for the owner's output directory — `4d27d01c` ·
      [run 34964982516](https://github.com/yasermostafaee/cg/actions/runs/34964982516) ·
      `ci` and `e2e` both RAN green

## 4. `DELTA B` — making it true and usable

- [x] B0 — a pass count set BEFORE the take is the count that airs — `03cb8e09` ·
      [run 34969115086](https://github.com/yasermostafaee/cg/actions/runs/34969115086) ·
      `ci` and `e2e` both RAN green
- [x] B1 — the console states the timing of the graphic that PLAYS; the derivation is
      versioned — `92711fcf` ·
      [run 34972171124](https://github.com/yasermostafaee/cg/actions/runs/34972171124) ·
      `ci` and `e2e` both RAN green
- [x] B2 + B3 — no explanatory prose; house primitives; `cg-fact` was a class nothing
      declared — `978ec318` · **no run of its own** (push burst). Covered by
      [run 34983485375](https://github.com/yasermostafaee/cg/actions/runs/34983485375) on
      its descendant `219a0c8f`.
- [x] B4 — a timing edit is a draft, spent by one press; `Until stop` / `Count` replaces
      the bare glyph — `8c368909` · **no run of its own**. Covered by the same
      [run 34983485375](https://github.com/yasermostafaee/cg/actions/runs/34983485375).
- [x] B5 — the owner's two rules in `CLAUDE.md` — `29f59f91` · **no run of its own**.
      Covered by the same
      [run 34983485375](https://github.com/yasermostafaee/cg/actions/runs/34983485375).
- [x] The owner's three look notes — short boxes, the gap says seconds, the count reads —
      `219a0c8f` ·
      [run 34983485375](https://github.com/yasermostafaee/cg/actions/runs/34983485375) ·
      `ci` and `e2e` both RAN green
- [x] 🔴 `play()` seats the operator's pass timing instead of dropping it — `0f54e00d` ·
      [run 34986964638](https://github.com/yasermostafaee/cg/actions/runs/34986964638) ·
      `ci` and `e2e` both RAN green
- [ ] One focus ring on the gap field, not two — `d4ee57f2` · run not yet read
- [ ] R2 — the `cg/raw-control` ratchet — `980c42e5` · run not yet read
- [ ] R1 — the pre-take count pinned on the `update(data)` host — `72dbd863` · run not yet
      read
- [ ] R3 — a timing set is in the audit log — `009a25da` · run not yet read

## 5. Still open

- [ ] 🔴 **THE PLANT WALKTHROUGH — A REAL SERVER IS STILL OWED.** Everything is proven
      either side of the CEF boundary: the bridge composes and sends the right mid-air
      update (asserted on the AMCP trace), and a real template runtime given that payload
      changes its loop without restarting. What no mock can prove is the JOIN — that those
      bytes survive CasparCG's own path into the page. ADR 0009 §"The plant walkthrough
      must add these five steps" holds the five steps. **P-014 class 2: an owed hardware
      run.**
- [ ] `B-248` — a timing set is in flight and the row says nothing. `R-063`'s doctrine
      (declared / applied / unconfirmed) is where it belongs.
- [ ] `B-249` — the per-composition export writes a dangling `entryCompositionId`.
- [ ] `B-250` — the stack row's dirty chip cannot see a staged POSITION, measured. It
      stopped being correct when the position was folded into the one commit.
- [ ] `C-034` — the re-import tax. Every page-runtime fix in this arc has cost a manual
      re-import of every template; this arc alone produced two.
- [ ] **The raw-control debt: 40 frozen sites** (32 raw `<input>` across 14 files, plus 8
      styled primitives across 5) in the Runtime renderer, frozen per file in
      `apps/runtime/eslint.config.mjs` by `cg/raw-control`. The ratchet refuses growth and
      refuses a stale allowance; migrating them is cleanup, one file at a time, lowering
      each number in the same commit. The Designer is redder — 37 across 20 — and is its
      own item.
- [ ] **A STATED LIMIT, not a bug: two looping scopes.** Where a template has more than one
      looping scope, the console names the ROOT's and applies the operator's count to every
      looping scope. Re-measured with the corrected resolver: still **zero** such templates
      in the corpus. What "2 passes" should mean there is the owner's call.
- [ ] **Crawl passes are NOT built** (`B6`, establish-only). Per-element content timing is
      operator-owned by ADR 0009 and by `C-003`, and the console offers none of it. The
      size-deciding question was measured and lands on the cheap side: both element drivers
      RE-READ their `repeat` at every boundary, so a live setter is a pure write rather
      than an engine refactor. Estimated **6–9 commits, 3–5 days**, of which the cost is
      plumbing — the `__cg` member, an elementId→driver registry (drivers are node-keyed
      today), `TemplateInfo` element metadata (which obliges another re-import), the
      persisted per-row map, and N console rows. ⚠ A per-element `repeat` counts UP against
      a total while the row's count counts DOWN, so the console's existing wording cannot
      be copied.
- [ ] **Two stale doc copies of a retired decision**: `template-runtime/src/types.ts` and
      `runtime.ts`'s `setPassTiming` both still say "ROOT SCOPE ONLY", which
      `applyPassTiming` overruled when it was made to walk every looping scope.

## 6. Linked PRD items

- [x] `C-003` (`docs/prd/caspar.md`) marked `[~]` with this change dir — **partially**
      delivered. C-003 asks for a live override keyed by NESTED-INSTANCE PATH; what shipped
      is a per-ROW override that fans out to every looping scope. The per-scope keying
      stays open and the item says so.
- [x] `R-063` (`docs/prd/runtime.md`) cross-referenced. ⚠ It stays `[x]` — it is a RECORDED
      DOCTRINE, not an implementation item, and flipping it to `[~]` would misrepresent it
      as unfinished.
- [ ] `C-013` / `C-017` — the "row still claims ON AIR after the last pass" pair. This
      control makes that state routine rather than rare.
- [ ] `C-011` — persist the template registry. Its "keep the `.vcg` bytes" option and
      `C-034`'s "re-derive from what is kept" are opposite answers to one problem; only one
      should be built.
