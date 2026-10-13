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
- [x] One focus ring on the gap field, not two — `d4ee57f2` ·
      [run 34989676332](https://github.com/yasermostafaee/cg/actions/runs/34989676332) ·
      `ci` and `e2e` both RAN green
- [x] R2 — the `cg/raw-control` ratchet — `980c42e5` · **no run of its own** (push burst).
      Covered by
      [run 34992963204](https://github.com/yasermostafaee/cg/actions/runs/34992963204) on its
      descendant `72dbd863`, whose `ci` and `e2e` both RAN green.
- [x] R1 — the pre-take count pinned on the `update(data)` delivery host — `72dbd863` ·
      [run 34992963204](https://github.com/yasermostafaee/cg/actions/runs/34992963204) ·
      `ci` and `e2e` both RAN green
- [x] R3 — a timing set is in the audit log, with the value asked for — `009a25da` ·
      [run 34994925132](https://github.com/yasermostafaee/cg/actions/runs/34994925132) ·
      `ci` and `e2e` both RAN green
- [ ] R4 + B7 — this change dir, `C-034`, and the links — `d30094aa` ·
      [run 34996551595](https://github.com/yasermostafaee/cg/actions/runs/34996551595) —
      IN PROGRESS at the time of writing. ⚠ Docs-only, so its `e2e` may legitimately be
      SKIPPED (`P-029`); read the job, and if it skipped, this row is discharged by the
      next code push's whole-tree run rather than by this one.

## 7. `PASSES-CYCLE-ONLY-26` Part A — the controls follow the STATED mode (`R-064`)

The owner, 2026-09-16, on the news ticker `نوار خبر (روی آنتن)`: the section reads
`Auto-out` / `Content-driven` and still shows `Until stop` / `Count`, a gap box and
`Default (∞)`. Changing them does nothing he can see.

- [x] 7.1 DIAGNOSIS re-verified at HEAD on the two stored ticker records. `c44d061f`: root
      `auto-out`/`content-driven`, crawl `repeat: 2`, and the ONLY `loop-cycle` scope is a nested
      «چشمک» — `holdMs: 0`, `repeat: 'infinite'`. `4ccad4c4` (older): root `manual`, same dot.
      `setRemainingPasses` returns early on a non-cyclic scope, so the count reached the DOT alone
- [x] 7.2 `templateAdmitsPassTiming` — ONE predicate in `@cg/shared-ipc`, three consumers
- [x] 7.3 The Inspector shows the controls on it, not on `loops`; both comments rewritten
- [x] 7.4 `timingToSend.ts` — the one place that decides what timing leaves the console, behind
      that gate. `timingPatchToSend` for a press, `effectiveTimingFor` for PVW (Part B)
- [x] 7.5 The bridge gates the WIRE, never the record: no stored count rides a take or a
      mid-air update for a template that does not admit it. No silent migration
- [x] 7.6 RED FIRST: the visibility matrix, and a stored count on the ticker row sending no
      `__cg.timing`
- [x] 7.7 Three fixtures corrected from "no `playout`" / "`manual` + `loops`" to a real
      `loop-cycle` template — they were exercising the refusal while claiming to exercise the road
- [x] Gate green (uncached, exit 0) · Runtime unit suite 1597 passed · commit `befda67d` ·
      e2e run [35106197970](https://github.com/yasermostafaee/cg/actions/runs/35106197970) —
      `e2e` job RAN, `conclusion: success`

### What §A0 established and did NOT change

- **The WRAPPER case reaches the Runtime** (§A0.2). Exporting at the default
  `entryCompositionId` scopes the ENTRY composition to the root and keeps its closure, so
  `logo-bug` @ `comp-logo-bug` publishes `manual` + a loop taken from `comp-logo-mark`. Under the
  owner's rule that template reads `Manual` with no pass controls. **No exception was built** —
  the owner decides. The other starters are unaffected (their loops are decorations or absent),
  and the plant's own logo is exported at `comp-logo-mark`, so it still reads `Loop cycle`.
- **No template has a loop INSIDE a looping root** (§A0.3) — not in the five bundled starters at
  any scope, not in the six stored records. So `applyPassTiming` was left alone and the latent
  concern is filed as `C-036`. **No re-import is owed by Part A.**
- **The Designer already gates its own `repeat` control on `mode === 'loop-cycle'`**
  (`PlayoutSection.tsx`), so it was already consistent with the rule; the console was the odd
  surface out.

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
- [x] `C-013` / `C-017` — the "row still claims ON AIR after the last pass" pair. This
      control makes that state routine rather than rare. ⚠ **AMENDED 2026-09-15 — the pair is
      no longer a latent defect this feature makes routine; it is BUILT.** `SELF-STOP-24`
      (`openspec/changes/template-signals-completion/`) added the completion channel out of
      CEF, so a re-imported template that finishes stops its own row. `C-013` is `[~]`;
      `C-017`'s same-origin ping half stands and its hard-CLEAR verb is superseded by STOP.
      Ticked here because the cross-reference is discharged, not because this change built it.
- [ ] `C-011` — persist the template registry. Its "keep the `.vcg` bytes" option and
      `C-034`'s "re-derive from what is kept" are opposite answers to one problem; only one
      should be built.

## 8. `PASSES-CYCLE-ONLY-26` Part B — PVW plays the operator's count (`R-065`)

The owner, 2026-09-16: in PVW the timing always runs the template's authored defaults, and
pressing `Update` changes nothing there either.

- [x] 8.1 CONFIRMED at HEAD: `RehearsalFrame`'s payload was `withCgControl(fields, {look})` —
      fields and look only — and `PreviewPanel` handed it no timing at all. `B-151`'s shape one
      member later: a third delivery door the timing work never knocked on
- [x] 8.2 The subject carries `effectiveTimingFor(info?.playout, item)` — the SAME builder
      `timingPatchToSend` sits beside, behind Part A's gate, so a hidden-control row gets none
- [x] 8.3 The timing rides `play()` ALWAYS (it seats a total) and `update()` only on the first
      boot and when the VALUE changes — its own effect, keyed on the value, never on `payload`
- [x] 8.4 RED FIRST in a real browser: PVW is told `Count 1`; a field edit reaches the frame and
      does NOT change the number of timing-bearing pushes; the take token is still absent
- [x] Gate green (uncached, exit 0) · full Runtime e2e on Windows 238 passed; the PVW spec
      12/12 under `--repeat-each=4` · commit `0464e0ac`
- [x] e2e run [35112170513](https://github.com/yasermostafaee/cg/actions/runs/35112170513) on
      `0464e0ac` — `e2e` job RAN, `conclusion: success`. **DISCHARGED on the SECOND ATTEMPT of
      the same run, and the first attempt is kept here rather than overwritten.**

      Attempt 1 was RED, on two specs that are NEITHER this change's nor new:
      `runtime/e2e/picker-manage-chrome.spec:213` (`P-048`'s **second** occurrence) and
      `designer/e2e/live-source.spec:511` (ADR 0009's knife-edge fixture, third). Part B touched
      `PreviewPanel` / `RehearsalFrame` / `RehearsalStage` / `rehearsalFrames` — the PVW preview
      — and goes nowhere near the template picker or the Designer's canvas; its own three PVW
      cases passed on that attempt too.

      ⚠ **A re-run is a legitimate discharge ONLY because the failures were diagnosed first.**
      "Re-run until green" is how a real regression gets buried; what makes this one honest is
      that both specs were identified, both were already-known flakes with their own record, and
      the second occurrence was FILED rather than spent. Attempt 2 ran the whole suite on the
      same tree and passed.

### The relative-count trap, and why it shaped the design

`__cg.timing.passes` on a RUNNING page means "passes REMAINING FROM NOW" (`DELTA A1`). The
frame's field-push effect re-fires on every draft change — that responsiveness is most of what
rehearse is for — so folding the timing into that payload would re-arm the count on every
keystroke in an unrelated text box: type four characters during a two-pass run and the graphic
has been told "two more" four times.

So the timing is NOT in `payload()`. It has its own effect keyed on the timing VALUE
(`JSON.stringify`, not the object — the object is fresh out of every panel render, which is the
same trap the placement effect already documents).

⚠ **Three locators had to be MEASURED rather than assumed, and each would have passed
vacuously.** The pass box's accessible name is air-state dependent (`Passes next take` off air);
a field input's accessible name is the field's ID (`anchor`), not its display label, which is a
sibling span; and clicking an already-selected row's body TOGGLES the Inspector shut, so the spec
does not re-select after rehearsing. The first draft of the field case found no input at all and
skipped its own typing — it was green and proved nothing, which is why it now asserts the field
pushes INCREASED as its positive control.
