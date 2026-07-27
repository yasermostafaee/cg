# Platform / infra / tooling — backlog

Cross-cutting items: shared packages, build/hosting, tests. See `README.md`.

## [ ] P-001 — Bundle Vazirmatn offline ⟨priority: medium⟩

**What:** Ship the Vazirmatn font with the apps instead of loading it from the
jsdelivr CDN, and tighten the CSP accordingly.
**Why:** Broadcast machines are often air-gapped; a CDN `<link>` breaks Persian
rendering offline and forces a loose CSP.
**Acceptance:**

- WHEN an app loads with no network THEN Persian text still renders in Vazirmatn
- WHEN the app loads THEN the CSP no longer needs `cdn.jsdelivr.net`
  **Notes:** add `@fontsource/vazirmatn`, import it in each app entry, drop the
  `<link>` in `index.html`. Touches `@cg/ui` font stack + both apps.

## [ ] P-002 — Lightweight routing / app shell ⟨priority: low⟩

**What:** Introduce simple routing so each app can have more than one screen
(e.g. editor / library / settings).
**Why:** Both apps are single-screen; settings and library will need routes.
**Acceptance:**

- WHEN the operator navigates between views THEN the URL reflects the view and
  back/forward work
  **Notes:** keep it minimal; this is the seam the zip's TanStack Router pattern
  could fill if desired.

## [ ] P-003 — Hosting / packaging recipe ⟨priority: low⟩

**What:** Decide and document how operators get the apps — static hosting vs a
small local server that also embeds the CasparCG bridge.
**Why:** No distribution story yet now that there's no installer.
**Acceptance:**

- WHEN following the doc THEN a non-developer can serve Designer and Runtime
  (and, for Runtime, start the bridge) on an operator machine
  **Notes:** a single local binary serving the SPA + the bridge is the smoothest
  no-IT option; relates to C-001.

## [ ] P-004 — Deepen platform tests ⟨priority: low⟩

**What:** Add tests for the Designer `Exporter` (pack → download) and `Preview`
behind their DI seams, and re-add integration coverage once the bridge exists.
**Why:** The migration removed Electron-era tests; export/preview paths are
under-covered.
**Acceptance:**

- WHEN the test suite runs THEN Exporter produces a valid `.vcg` for a sample
  scene and Preview builds a document for a scene
  **Notes:** `Exporter`/`Preview` already take `cgJs`/`cgCss` via constructor, so
  they're testable without the `?raw` bundle.

## [x] P-005 — Designer E2E + UI test coverage (Playwright), built to scale ⟨priority: high⟩ — archived: `openspec/changes/archive/2026-06-15-add-designer-e2e-testing/`

**What:** A Playwright browser-E2E harness for the Designer SPA, built so FUTURE
features inherit coverage by default. Runs the SAME shipped build in a test mode
(`window.CG_E2E` → `MemoryWorkspace` + `MemoryKv`, no native dialogs), with reusable
page-object fixtures for common actions, an initial suite covering the critical
flows + recent bug regressions, a separate required CI job, and a CLAUDE.md rule
that maps each OpenSpec `#### Scenario` to Playwright steps.
**Why:** There was no E2E/UI coverage — only unit tests. Integrated flows (canvas →
inspector → preview → export) and cross-cutting regressions were unguarded, and new
features had no default path to E2E coverage.
**Acceptance:**

- WHEN `pnpm test:e2e` runs (locally or in CI) THEN the Designer boots against the
  built app in test mode with NO native file dialogs, and the suite runs headless
- WHEN a test is written THEN it composes reusable fixtures (newComposition,
  addTextElement, setDataKey, bindFromCanvas, openPreviewModal, play/stop/pause,
  addKeyframeViaDiamond, dragShape, nestCompositionInstance, setPlayoutTiming,
  exportHtml) instead of rewriting boilerplate
- WHEN the critical flow runs THEN create composition → add text with a data key →
  preview (edit field value live) → lifecycle play/hold/stop → export single-file
  HTML all pass
- WHEN the recent fixes are exercised THEN their regressions pass (diamond keyframe
  captures current value; colour edits sync display+shape; bind-once + disable;
  data-key resync on selection change; per-composition + nested namespaced field
  scope in the parent preview; nested-lifecycle cascade; per-scope preview timing)
- WHEN CI runs THEN a separate `e2e` job (Chromium cached) runs the suite and is
  required green, kept out of the fast unit gate
- WHEN a future change adds user-facing behavior THEN it MUST add an E2E test mapping
  its OpenSpec scenarios to Playwright steps (CLAUDE.md rule)
  **Notes:** test mode = `window.CG_E2E` set by Playwright `addInitScript` before app
  JS (test-only; a real user can't trigger it); built app via `vite preview`
  (matches turbo `test:e2e` dependsOn build); E2E lives in `apps/designer/tests/e2e`.
  Change: `openspec/changes/add-designer-e2e-testing/`.

## [!] P-006 — End-user product documentation site (Loopic-style) ⟨priority: low⟩ — blocked: post-feature-stabilization / GTM

**What:** A public, end-user-facing documentation site for the CG platform —
getting-started, building a lower-third/ticker/fullscreen, data fields & bindings,
preview/playout, export to `.vcg`, and a CasparCG operator guide — in the style of
Loopic's product docs. Audience is broadcast operators & template authors, NOT
contributors.
**Why:** Today's docs are engineer-facing (`CLAUDE.md`, `docs/engines/`, OpenSpec,
`docs/operator-guide/`). When the product stabilizes and we go to market, end users
will need approachable, task-oriented docs with screenshots/video — a different
artifact from the internal architecture docs.
**Acceptance:**

- WHEN a new operator follows "getting started" THEN they can build, preview, and
  export a working lower-third without reading any code or internal docs
- WHEN a feature ships THEN its user-facing behavior has a docs page (mirrors how
  OpenSpec scenarios + E2E grow with features)
  **Notes:** TRACKED, NOT BUILT NOW — explicitly deferred until feature set
  stabilizes and a GTM motion exists (hence `[!]` blocked). Likely a static docs
  site (e.g. Astro Starlight / VitePress) separate from the engineer docs; reuse
  `docs/operator-guide/` + `docs/designer-guide/` content as seeds. Internal
  architecture docs (`docs/engines/`, package READMEs) stay the source of truth for
  _how it's built_; this is the _how to use it_ layer.

## [ ] P-007 — Extract domain skills from scattered docs ⟨priority: low⟩

**What:** Package situational domain knowledge as Claude Code **skills** instead
of always-on CLAUDE.md rules: (a) **caspar-template** — the CG ADD+UPDATE
sequence, `file://`-safe/IIFE constraints, CSP, the CEF floor, the 403 readiness
trap, GDD rules; (b) **persian-rtl** — ZWNJ, per-item bidi isolation, crawl
direction, mixed-content test patterns; (c) **engine-extension** — a thin
wrapper over the existing engine READMEs' extension points.
**Why:** This expertise is scattered across docs and only matters situationally;
packaged as skills it loads on demand instead of bloating the always-on context.
**Acceptance:**

- To be detailed when the item is scheduled.
  **Notes:** Boundary rule — always-on behavioral rules STAY in CLAUDE.md;
  skills are for situational expertise. Sequenced post-feature-wave; see
  `docs/ROADMAP.md` ("Then — infra/quality").

## [x] P-008 — Skip heavy CI for docs-only PRs ⟨priority: medium⟩ — implemented; change `openspec/changes/skip-ci-for-docs-only/`

**What:** وقتی یک PR **فقط** فایل‌های docs/markdown را عوض کرده
(`openspec/**`, `docs/**`, `**/*.md`)، jobهای سنگینِ CI (`pr.yml` —
typecheck/lint/test/build/e2e) skip شوند و فقط یک چکِ سبکِ docs (مثلاً
`openspec validate --all --strict` + `format:check`) بدود. PRهای کد دقیقاً مثلِ
امروز کلِ gate را می‌دوند.
**Why:** archiveها و ویرایش‌های docs کد را لمس نمی‌کنند، ولی الان کلِ تست/بیلد/e2e
را تریگر می‌کنند و merge را معطل می‌گذارند. این بزرگ‌ترین معطلیِ غیرضروری در گردشِ
کار است.
**Acceptance:**

- WHEN یک PR فقط `openspec/**` / `docs/**` / `**/*.md` را تغییر داده THEN jobهای
  سنگین (typecheck/lint/test/build/e2e) skip می‌شوند و فقط چکِ سبکِ docs می‌دود و
  required سبز می‌شود
- WHEN یک PR حتی یک فایلِ کد/تست/بیلد را تغییر داده THEN کلِ green gate ِ امروز
  (typecheck/lint/test/build + e2e) می‌دود — هیچ کدی بی‌تست merge نشود
- WHEN branch protection چکِ required دارد THEN چکِ docs-only همان نقش را بازی کند
  (PR ِ docs بدونِ green gate ِ کامل هم mergeable شود)

**Notes:** با `paths`/`paths-ignore` یا یک path-filter در `pr.yml` (یا یک job ِ
شرطیِ جدا). **ریسکِ ظریف:** filter باید دقیق باشد — اگر کد اشتباهاً در یک PR ِ
«docs» قاطی شود نباید بی‌تست بگذرد؛ پس شرطِ «هیچ فایلِ غیرdocs تغییر نکرده» را
محکم بگذار (نه صرفاً «شاملِ docs هست»). به branch protection / required checks ِ
گیتهاب وابسته است — ممکن است تنظیمِ required check هم لازم باشد تا PR ِ docs بدونِ
آن jobهای skip‌شده mergeable بماند (این لبهٔ معروفِ «required check که skip شده،
PR را بلاک می‌کند» را موقعِ پیاده‌سازی بررسی کن). infra/CI — یک‌بار کار.

## [x] P-009 — Self-enforcing local gate for Claude Code sessions (Stop hook) ⟨priority: medium⟩ — merged (#363) + archived: `openspec/changes/archive/2026-07-19-platform-gate-stop-hook/`

**Archived with 5 tasks still unchecked** (3.2 seven manual hook invocations with recorded exit
codes, 3.3 the caspar-bridge suite green isolated AND under full parallel `pnpm test`, and the
5.x gate/validate/PR trio). The hook is merged and demonstrably live — it has blocked turns and
printed its repair rules repeatedly since. But the archiver had no evidence for those manual
legs and deliberately did not tick boxes it could not stand behind: a false tick destroys the
record's value, which is the whole point of ticking. Re-run them if the record matters.

**What:** A committed Claude Code Stop hook that refuses to let a session's turn end
with a red local gate: it classifies the turn's changed files (working tree ∪ branch
commits vs the `origin/main` merge-base), runs the matching gate — the docs-only
carve-out (`openspec validate --all --strict` + `format:check`), the full `pnpm gate`,
plus `pnpm gate:e2e` when UI/render paths changed — and on failure feeds the tail of
the failing output back to the session with non-cheating repair rules, at most twice,
before escalating to the human.
**Why:** CI is billing-blocked (~Aug 1), so the local gate is the only merge gate — but
it currently relies on the session REMEMBERING to run it. Turns have ended red; the
E2E gate especially is skipped because it is slow and manual. Enforcement must not
depend on model discipline.
**Acceptance:**

- WHEN a turn ends with no changed files (or the session is in plan mode, or the hook
  re-fires after its own block) THEN the hook exits 0 without running anything
- WHEN the changed set is docs-only (every path under `openspec/**`, `docs/**`, or
  `**/*.md`) THEN only the docs-only carve-out runs (openspec validate strict +
  format:check), mirroring CLAUDE.md — never the full gate
- WHEN any non-docs path changed THEN `pnpm gate` runs; and WHEN any changed path is
  in the UI/render set (renderer sources, template-runtime, ui, single-file-export,
  lottie-bridge, `*.css.ts`, e2e specs, playwright configs) THEN `pnpm gate:e2e` runs
  too
- WHEN a gate is red THEN the turn is blocked (exit 2) with the failing tail + repair
  rules that forbid deleting/skipping/loosening tests; after two consecutive red
  attempts in one session THEN the hook stops blocking and surfaces a message telling
  the human the gate needs eyes
- WHEN `gate:e2e` passes on `win32` THEN the green message states the run is
  NON-AUTHORITATIVE for pixel geometry and a Linux/WSL run is still owed
- WHEN the hook's pure decision logic changes THEN unit tests in `tools/gate-hook`
  cover path classification, docs-only detection, UI/render matching, and attempt
  counting

## [x] P-010 — the pre-push gate runs in full on ref DELETIONS, where it proves nothing ⟨priority: medium⟩

**What:** `.husky/pre-push` reads git's stdin and skips `pnpm gate` when EVERY ref in
the push is a deletion. Any other push — including a MIXED one — gates exactly as
before.
**Why:** `.husky/pre-push` was an unconditional `pnpm gate`; it never read stdin at
all, so it could not tell a content push from a deletion. Observed 2026-07-21:

```
git push origin --delete docs/file-linkdown-predicate-bug
```

ran the complete gate — 82 turbo tasks, `format:check`, and `openspec validate --all
--strict`, ~1m53s — and only then performed the deletion. Three costs, in priority
order:

1. **It gates the WORKING TREE, not the pushed content.** On a deletion there is no
   pushed content, so the green result is an assertion about an unrelated thing.
2. **It silently consumes this host's exclusive gate slot.** The standing rule is
   never two gates concurrently on this host; a ref deletion must not take that slot.
   Same contention class as [[B-098]]'s hypothesis A.
3. **A pending refs sweep will delete dozens of branches.** At full-gate cost each,
   that is hours of wall-clock and dozens of contention windows.

**Acceptance:**

- WHEN every ref line on the hook's stdin is a deletion (literal `(delete)` local ref
  - all-zero local oid) THEN the gate is SKIPPED and the hook prints one line saying
    so, so a skip is never silent
- WHEN any ref in the push is a real update — including a MIXED push that also deletes
  — THEN the full gate runs
- WHEN stdin is empty, malformed, or unrecognized, or `node` is missing/failing THEN
  the full gate runs (fail-closed: unknown means gate it)
- WHEN the decision logic changes THEN unit tests in `tools/gate-hook` cover
  all-deletions, single update, mixed, empty, and malformed stdin

**Notes:** The fix NARROWS **when** the gate runs — it never changes **what** the gate
checks. There is deliberately no env-var bypass and no `--no-verify` convenience
wrapper: while Actions billing is out this hook is the only enforcement mechanism, and
nothing here may weaken it. Decision logic is pure (stdin text in, boolean out, no git
calls) in `tools/gate-hook/src/pre-push-decision.mjs` — the sibling of P-009's
`gate-decision.mjs` — with `pre-push-cli.mjs` as the thin stdin plumbing the shell
calls. Tooling only — no OpenSpec change, no source/runtime/export/schema change, so
this closes on a green gate like [[B-071]] rather than via an archive. Verified
end-to-end on a throwaway ref: creating `tmp/hook-check` ran the full gate, deleting it
skipped and said so.

## [x] P-011 — `gh pr merge --delete-branch` can never work in this worktree layout, so merged branches accumulate silently ⟨priority: medium⟩

**What:** CLAUDE.md now prescribes an explicit three-step ship sequence —
`gh pr merge <n> --admin --squash` (NO `--delete-branch`), then
`git push origin --delete <branch>`, then `git branch -D <branch>` — with the reason
stated inline so it does not get "simplified" back later.
**Why:** Observed 2026-07-21 merging [[P-010]] (#382) from `cg-runtime`: the merge
SUCCEEDED, then gh's post-merge `git checkout main` failed with
`'main' is already used by worktree at .../cg`, so the remote branch was NOT deleted.

This is structural, not a one-off. Read from gh v2.71.0's
`pkg/cmd/pr/merge/merge.go`, `deleteLocalBranch()` runs BEFORE `deleteRemoteBranch()`
and any error aborts the remote half. In this layout the local half always fails, in
**both** worktree states and for two different reasons:

- **On the branch** (the normal case): `currentBranch == pr.HeadRefName`, so gh checks
  out the PR's base `main` — which `cg` holds by the READ-ONLY worktree rule, and git
  forbids one branch in two worktrees.
- **Detached** (the resting state): `opts.Branch()` cannot resolve a current branch and
  returns an error even earlier, before the checkout is ever attempted.

Why it matters more than the inconvenience:

1. **The failure is at the END.** The merge lands, the PR closes, the branch survives,
   and nothing announces it. Silent accumulation.
2. **It is a likely major contributor to the ref count** (88 local / 11 remote at the
   [[P-010]] audit) — the very surface the B-number ritual must sweep every time.
3. **Deleting a merged branch is now CHEAP** ([[P-010]]: an all-deletions push skips
   the gate, ~3 s), so the corrected sequence costs almost nothing.

**Acceptance:**

- WHEN a PR is merged from a track worktree THEN the prescribed sequence deletes the
  branch on BOTH sides, and the operator verifies both rather than trusting gh
- WHEN the local branch is deleted THEN `-D` is used, never `-d` — this repo
  squash-merges, so a merged branch's commits never enter `main`'s history and `-d`
  refuses
- WHEN CLAUDE.md states the sequence THEN the structural reason is inline, so the rule
  is not re-simplified into the broken form

**Notes:** `--repo` WAS investigated as option (b): gh sets
`CanDeleteLocalBranch = !cmd.Flags().Changed("repo")`, so it genuinely skips the local
half and the API deletes the remote branch. **Rejected** — it then leaks the LOCAL
branch instead, which is precisely the stale-merged-branch hazard CLAUDE.md already
documents at length (`fix/runtime-ux-batch-2`, #317, cost a full session), and it
depends on undocumented flag coupling that `gh pr merge --help` never mentions. The
explicit sequence works from both worktree states, deletes both sides verifiably, and
survives a gh upgrade. Investigated by reading gh's source at the installed version
tag, not by merging a real PR. Rides along: the `pnpm gate --force` correction (that
flag lands on `openspec validate` and produces a bogus red — plain `pnpm gate` is
already the uncached run), which the #382 session recorded only in a user-level memory
file where the Designer session could never see it; it is now in CLAUDE.md. Docs and
process only — no source, no spec, no behaviour change, so this closes on a green gate
like [[P-010]] and [[B-071]] rather than via an archive.

## [ ] P-012 — the pre-push hook should honor the docs-only carve-out via the shared classifier ⟨priority: medium⟩

**What:** The husky pre-push hook runs the FULL turbo gate on every content push, including
docs-only pushes — observed on PR #388's push (the first attempt died to a 3-minute tool
timeout mid-gate; the docs-only carve-out was then run by hand). The Stop hook already
classifies via the tested `classifyChangedSet` (`tools/gate-hook/src/gate-decision.mjs`:
docs-only → `openspec validate --all --strict` + `format:check`). The pre-push hook should
reuse THAT classifier on the outgoing range, so docs-only pushes pay docs-only cost.
**Why:** A docs-only push proves nothing extra by running 82 turbo tasks, and while the
pre-push gate is the sole enforcement mechanism it also consumes this host's exclusive gate
slot for minutes ([[P-010]]'s cost analysis, one notch milder — content exists, but it is
markdown).

**Second occurrence, 2026-07-26 — and the cost has grown since filing.** PR #409 was a pure
docs-only PRD change (one file, `docs/prd/platform.md`) and its push still ran the FULL `pnpm
gate`, holding this host's exclusive gate slot for the whole run. That is the #388 class
recurring, so this is a pattern rather than a one-off. It also demonstrably consumes the
[[P-013]] host lock — which matters more now than when this item was filed at low priority,
because [[P-015]] (a queued gate killed at the tool cap reads as a gate FAILURE) and [[P-016]]
(the lock does not cross the OS boundary) both raise the price of holding that slot
unnecessarily. Hence medium.
**Acceptance:**

- WHEN the pre-push hook runs on a content push THEN it classifies the outgoing range with the
  SAME shared classifier as the Stop hook — no second implementation (the B-100 lesson: a
  second local copy is how a name comes to lie)
- WHEN the outgoing range is docs-only THEN the hook runs `openspec validate --all --strict` +
  `format:check` instead of the full gate
- WHEN the range is anything else THEN the full gate runs exactly as today

**Notes:** misclassification risk noted and contained: the classifier is the single shared
definition and already unit-tested (`tools/gate-hook`). While GitHub Actions billing is
exhausted the pre-push gate is the sole authoritative proof — the carve-out must therefore be
provably equivalent to the Stop hook's, never a THIRD rule set. Sits beside [[P-010]]'s
all-deletions skip in the same hook (`pre-push-decision.mjs` is the natural home for the range
classification plumbing); [[P-009]] is the Stop-hook sibling whose classifier this reuses.

## [x] P-013 — enforce "one gate per host" with a lock, not discipline ⟨priority: medium⟩ — merged (#395, `72487af`) + archived: `openspec/changes/archive/2026-07-23-platform-host-gate-lock/`; owner-confirmed in real use 2026-07-23 (cross-worktree serialization: a gate in one worktree made a gate started in another WAIT for the host slot instead of racing it)

**What:** A host-wide advisory lock (`tools/gate-hook/src/gate-lock.mjs` +
`gate-lock-cli.mjs`, backed by `proper-lockfile`) wraps gate execution: `pnpm gate` and
`pnpm gate:e2e` acquire this host's exclusive slot at a stable path under `os.tmpdir()`
before running and hold it for the whole gate. A concurrent gate WAITS for the slot
("waiting for host gate slot…") instead of racing it. The lock lives at the single
`gate`/`gate:e2e` script chokepoint every entry point (direct, `.husky/pre-push`, the
[[P-009]] Stop hook) funnels through — one implementation, not a copy per caller.
**Why:** [[P-010]] already names "this host's exclusive gate slot" but nothing enforced
it. Two failure modes ran on discipline alone: (1) the **pre-push / Stop-hook double-fire**
— a push fires `.husky/pre-push` → `pnpm gate` at the same moment a turn end fires the Stop
hook → `pnpm gate`, two gates land in one worktree and race on vitest's shared coverage
`.tmp/` (the bare `ENOENT` of [[B-097]]); and (2) **cross-worktree contention** — two of the
three worktrees gating at once, the same CPU starvation [[B-098]] bounded WITHIN a gate, now
BETWEEN gates where its cap cannot see it. The lock is the OUTER layer over [[B-098]]'s
`bounded-turbo-cli`, never a replacement.
**Acceptance:**

- WHEN a gate is invoked while another holds the slot THEN it announces the wait, blocks
  until release, and only then runs — never concurrently
- WHEN a gate that holds the slot exits (pass, fail, or throw) THEN the slot is released
- WHEN the holder crashes without releasing THEN the slot is reclaimable after a staleness
  window shorter than the wait timeout, so no deadlock
- WHEN a gate waits the full timeout without acquiring THEN it errors clearly rather than
  hanging forever
- WHEN the lock mechanism is unavailable or errors on acquisition THEN the gate still runs
  WITHOUT serialization (it is the sole landing gate) and says so
- WHEN the pre-push or Stop hook runs the gate THEN it takes the SAME host slot as a direct
  `pnpm gate`, because the lock is at the shared script boundary, not duplicated per hook

**Notes:** change `openspec/changes/platform-host-gate-lock/` (spec `platform-local-gate`,
one ADDED requirement). Evidence: 31 unit tests (acquire / wait-when-held / timeout /
release / fail-open) + one real-`proper-lockfile` on-disk round-trip, plus
`scripts/two-process-lock-check.mjs` (**PASS**: worker B started while A held, printed the
wait, and acquired 77 ms AFTER A released). Real-use evidence (2026-07-23, R-018 session): a
pre-push gate was KILLED mid-run (10-minute tool cap, SIGTERM) and the next gate acquired the
slot cleanly with no manual cleanup — release-on-exit / stale-reclaim behaved correctly under
an abnormal termination. Only the DECISION modules stay zero-dependency
(they run pre-install); this one runs the gate itself, which needs `node_modules` anyway, so
it may use `proper-lockfile` (loaded via dynamic import so a bad install degrades, not
crashes). **Owner confirmation DISCHARGED (2026-07-23):** cross-worktree serialization
confirmed in real use — with a gate running in one worktree, a gate started in another
worktree printed "waiting for host gate slot…" and proceeded only after the first released
(the archived change's task 7.1 records the evidence). No hardware / Linux-e2e owed — no
path matches `UI_RENDER_PATTERNS`.

## [x] P-014 — PR/merge policy: CC opens, owner merges ⟨priority: medium⟩

**What:** A CLAUDE.md rule (under Branching → "PR & merge policy") codifying that every task
ends with `gh pr create`, that CC does NOT merge by default (opens the PR and stops), that
CC merges ONLY on explicit owner authorization for that task via [[P-011]]'s ship sequence
(verifying BOTH deletions), and that CC NEVER auto-merges — pausing and flagging even if
told — when the change touches on-air/export/product source, owes a hardware or Linux
`gate:e2e`, or is shared config another worktree must rebase onto. Docs-only PRs are not
auto-merge-eligible either.
**Why:** While GitHub Actions billing is out (~Aug) the local gate is the ONLY landing gate,
and it has known gaps — the [[B-098]] load-flake class, a non-authoritative Windows
`gate:e2e` for pixel/a11y geometry, and reliance on owner-eyes. One local-gate pass is not an
INDEPENDENT check; a second human read at merge is the only independent gate there is. The
structural [[P-011]] reason `--delete-branch` cannot be used here is stated inline so the
sequence is not re-simplified into the broken form.
**Acceptance:**

- WHEN a task completes THEN CC opens a PR and STOPS; it does not merge unless the owner
  authorizes that specific task
- WHEN the owner authorizes a merge THEN CC uses [[P-011]]'s sequence exactly and verifies
  both the remote and local branch deletions plus the `cg` fast-forward
- WHEN a change touches on-air/export/product source, owes hardware/Linux e2e, or is shared
  config THEN CC never auto-merges even if told — it pauses and flags for owner sequencing
- WHEN remote CI returns (~Aug) THEN the auto-merge-eligible class is revisited (an
  independent check will exist)

**Notes:** docs/process only — no source, spec, or behavior change — so this closes on a
green gate like [[P-010]] and [[P-011]] rather than via an archive. Rides in the same PR as
[[P-013]] (the mechanism the "owner merges shared config" clause protects: this very PR
touches root `package.json` + `pnpm-lock.yaml` + CLAUDE.md, so the owner sequences its
merge and tells the other worktrees to pull).

## [ ] P-015 — the gate lock's silent wait outlives a Claude Code tool call and reads as a gate FAILURE ⟨priority: medium⟩

**What:** [[P-013]]'s host gate lock waits up to ~15 min for the host slot, announcing itself
ONCE ("waiting for host gate slot…"). A Claude Code tool call is capped at 10 min, so a gate
queued behind another worktree's gate can be KILLED mid-wait (or mid-run after a long wait):
the log then ends with a bare `[ELIFECYCLE] Command failed with exit code 1` and NO
turbo/vitest summary — output indistinguishable from a real gate failure even though ZERO
tests ran and nothing was actually red. Fix direction: (1) a periodic HEARTBEAT while waiting
(elapsed time, re-emitted — not announce-once) so a killed log shows it died QUEUED, not
failed; (2) a distinct terminal message on acquisition and on wait-timeout so "queued behind
the host slot" can never be misread as "the gate failed"; (3) consider whether the lock's wait
timeout should sit BELOW the CC tool cap (fail fast with a legible "host slot busy — re-run
when quiet" instead of being killed silently mid-wait).
**Why:** Observed TWICE on 2026-07-23 while cg-designer gated concurrently: two pushes from
cg-runtime were killed at the 10-min tool cap and the session's Stop-hook log showed exactly
the misleading signature — a full sweep of PASSING tests, then bare double `ELIFECYCLE exit 1`
with no failing test and no summary. Triage burned real time proving no test had failed; the
gate-red hook feedback demanded repair rules for a "failure" that was a queue kill. A gate
that was never allowed to finish must not be able to masquerade as a gate that ran red.
**Acceptance:**

- WHEN a gate waits for the host slot THEN the wait emits a periodic heartbeat with elapsed
  time, so a log killed mid-wait shows QUEUED as its last state
- WHEN the wait ends THEN a distinct message says which way — acquired (gate starting) or
  timed out (gate NOT run; re-run when the slot is quiet) — never a bare exit
- WHEN the process is killed mid-wait THEN the last log line is the heartbeat, so the kill is
  never mistaken for a red gate
- WHEN the wait-timeout policy is set THEN its relation to the CC tool cap is a recorded
  decision (below the cap, or explicitly accepted above it with the heartbeat as mitigation)

**Notes:** Cross-ref [[P-013]] (the lock this instruments; its fail-open degradation is
untouched). The kill-mid-wait evidence also validated P-013's stale-reclaim: the next gate
acquired the orphaned slot cleanly. Scope is the lock CLI's logging/timeout surface
(`tools/gate-hook/src/gate-lock-cli.mjs` + `gate-lock.mjs`) — no gate semantics change.

## [ ] P-016 — the host gate lock does not cross an OS boundary (Windows `tmpdir` ≠ Linux/WSL `tmpdir`) ⟨priority: medium⟩

**What:** [[P-013]]'s "one gate per host" lock is a host-wide advisory lock held at a stable
path under `os.tmpdir()` (`tools/gate-hook/src/gate-lock-cli.mjs` → `proper-lockfile`). But
`os.tmpdir()` resolves to DIFFERENT paths per OS on the SAME physical machine — a Windows
process sees `%TEMP%` (e.g. `C:\Users\…\AppData\Local\Temp`), a Linux/WSL process sees `/tmp`.
A Windows gate and a Linux/WSL gate on one machine therefore lock two different files, never
see each other's slot, and run CONCURRENTLY — the exact contention P-013 exists to serialize,
and the exact CPU starvation the [[B-098]] load-flake class feeds on.
**Why:** This stops being theoretical the moment the Linux `gate:e2e` backlog is worked off,
because the ONLY way to discharge that backlog is to run Linux gates on the SAME machine that
keeps running Windows ones. The outstanding Linux `gate:e2e` debts number NINE today: on the
runtime track [[R-018]], [[R-020]] and [[R-021]] (stage 2b, #405); on the designer track
[[B-089]] (#369) and [[B-090]] (#370); plus the four earlier UI merges [[B-090]]/#370's own
note explicitly groups as owing "on the same terms" (`docs/prd/bugs-designer.md`) — #330
([[B-085]]), #334 (the runtime inspector toast-only feedback migration), #336 ([[B-086]]) and
#337 (a [[D-125]] Lottie canvas follow-up). There is NO consolidated tally file — the same
`bugs-designer.md` note states this outright — so this is a compiled enumeration, not a
maintained counter, and it is honest only because none of the nine records a DISCHARGED Linux
run anywhere in `docs/prd/`: every discharge on record is a real-CasparCG hardware / on-air
owner check, which is a DIFFERENT gate (a Windows `gate:e2e` pass is likewise non-authoritative
for Linux render geometry, ~19px class). #405/stage 2b is the most recent addition. So a
Windows gate racing a WSL gate is a near-term reality, not a hypothetical. And the trigger is
not manual: [[P-009]]'s Stop hook fires a gate automatically at every turn end, so "just don't
start two" is not a control anyone can exercise.
**Acceptance:**

- WHEN a gate runs under Windows and another under Linux/WSL on the SAME physical host THEN both
  take the SAME exclusive slot — one waits for the other, never races it
- WHEN the two OSes resolve different `os.tmpdir()` paths THEN the lock path is derived from a
  host identity STABLE across the OS boundary (not `os.tmpdir()` alone), so the slot is shared
- WHEN the cross-OS lock mechanism is unavailable or errors THEN the gate still runs WITHOUT
  serialization and says so — [[P-013]]'s fail-open degradation is preserved, never a deadlock

**Notes:** extends [[P-013]] (the lock this widens) — a DISTINCT gap from [[P-015]], which is
the lock's logging/timeout legibility; do NOT fold the two together. The hard part is choosing a
lock path both OSes agree on when their temp roots differ: a WSL `/tmp` is not the Windows
`%TEMP%`, and even a shared filesystem path must round-trip through `\\wsl$\…` vs `/mnt/…`
translation. Scope is the lock-path derivation in `gate-lock-cli.mjs` / `gate-lock.mjs`; the
[[B-098]] `bounded-turbo-cli` inner cap is untouched — this is the OUTER host-serialization
layer, one level up.

## [ ] P-017 — merged remote branches survive the ship sequence, and nothing detects the leak ⟨priority: high⟩

**What:** [[P-011]]'s four-step ship sequence ends with `git push origin --delete <branch>` then
`git branch -D <branch>`, but NOTHING verifies either ran. A merged branch that survives on
`origin` is then indistinguishable from in-flight work — the hazard CLAUDE.md's "Merge status"
section already documents. This has now happened THREE times — a pattern, not an accident: (1)
`fix/runtime-ux-batch-2` (merged #317, 2026-07-14), the case CLAUDE.md already records, which
cost a full session's planning for a rebase of already-shipped code; (2)
`feat/runtime-fixed-layers-wire` (merged #404), which survived on `origin` until the owner
deleted it by hand; (3) `wip/openspec-archive-2026-07-19`, a stale wip branch likewise deleted
by hand.

**Verified 2026-07-25** — `gh api repos/yasermostafaee/cg --jq '.delete_branch_on_merge'`
returns **`false`**: GitHub's "Automatically delete head branches" is DISABLED on this repo.
So the remote-leak class is live and structurally UNMITIGATED — nothing server-side deletes a
merged head ref, and [[P-011]] step 2 (`git push origin --delete <branch>`) is the only thing
that ever does. All three leaks above are therefore explained by the SETTING, not by a
discipline lapse: the sequence has no net behind it, so a single skipped step leaks silently.

The same check also RELOCATED the live leak — **stated below as it was OBSERVED on 2026-07-25;
all seven refs were cleaned up the same day and `git for-each-ref refs/heads` shows ZERO `[gone]`
branches on re-check (2026-07-26).** A later reader finding zero is seeing the cleanup, not a
false claim: the count is the item's JUSTIFICATION, not a live backlog. As observed,
`git ls-remote --heads origin` showed `origin`
holding only `main` — clean, because the owner hand-deleted (2) and (3) — but SEVEN LOCAL refs
were merged-but-still-present: `docs/P-016-P-017-gate-and-branch-hygiene` (#406),
`docs/file-stack-status-honesty-bugs` (#407), `docs/file-client-batch` (#390),
`docs/file-d140-plate-source-selector` (#389), `docs/file-plates-and-file-feed` (#388),
`docs/close-reachability-hardware-session` (#386) and `feat/d128-p2-video-schema-ingest`
(#393). Every one read `[gone]` upstream — i.e. step 2 happened and step 3 (`git branch -D`)
never did. `wip/openspec-archive-2026-07-19` was an eighth of a DIFFERENT kind: its PR (#374)
was CLOSED, never merged, so no merged-PR intersection will ever surface it. The filed class is
real; the half actually leaking on that date was the local one, and it is the half that costs
nothing to check.

**A THIRD leak class — the never-pushed local branch (observed 2026-07-26).** A local branch with
NO upstream is invisible to both audits described so far: it can never read `[gone]`, and it has
no PR to intersect with. On a nine-branch local set, `backup/ux-batch-with-modal` (5 commits) and
`backup/pre-autosquash` (10 commits), both last touched 2026-07-14, carry unique work reachable
from NO remote and NO PR — `git rev-list --count <branch> --not --remotes` is non-zero for each.
They overlap the deliberate-park list below, which is exactly why this class needs its own
judgement rather than folding into the leak report: parked-on-purpose and forgotten-and-unique
look identical from outside.

**The trap in detecting it: an EMPTY `%(upstream:track)` is AMBIGUOUS.** git prints an empty
track field for BOTH "in sync with upstream" and "no upstream configured", so a track-based test
silently mixes the two. On the same nine-branch set (2026-07-26) SIX branches printed an empty
track while only FIVE genuinely lacked an upstream — `main` printed empty because it was IN SYNC
with `origin/main`. An audit must therefore test **`%(upstream)`** for emptiness, never the track
field. (The counts move with the branch set; the ambiguity does not.)
**Why:** CC cannot self-heal this — the permission classifier denies the deletion push, so any
leak CC spots must be handed to the owner as a manual command ([[P-014]]: the owner completes
the deletion), a hand-off easily lost. Detection closes the gap between "leaked" and "someone
happened to notice". The live REMOTE audit run at filing (2026-07-25) came back EMPTY — `gh pr list
--state merged` intersected with `git ls-remote --heads origin` shows `origin` holding only
`main`, because the owner has already cleaned leaks (2) and (3). That empty result is the POINT,
not a reason to skip filing: the pattern is historical and real, and detection is what catches
the NEXT leak without depending on the owner's eye.
**Acceptance:**

- WHEN a merge completes THEN an audit intersects merged PR head refs with live `origin` heads
  and REPORTS any branch that is merged-but-still-live
- WHEN a PR merges THEN the audit ALSO reports a LOCAL ref that is merged-but-still-present —
  the half with no network cost and, per the 2026-07-25 count above, the half actually leaking
- WHEN a branch's PR was CLOSED without merging, or it never had a PR at all (`wip/*`) THEN it
  is still surfaced — a merged-PR intersection alone never sees it (leak (3) is exactly this)
- WHEN a local branch has NO upstream and NO worktree holding it THEN the audit reports it as a
  candidate, in a SECTION SEPARATE from the merged-and-leaked class — the two need different
  judgement, because never-pushed work may be unique and unrecoverable, so the audit must NEVER
  imply it is safe to delete. Emptiness is tested on `%(upstream)`, never on `%(upstream:track)`
- WHEN the audit determines which branches are held THEN it ENUMERATES worktrees via
  `git worktree list --porcelain` and never assumes the three named worktrees — a hard-coded
  three would mis-classify a branch held by a fourth as unheld and offer it for deletion
- WHEN a merged branch is currently CHECKED OUT in any worktree THEN the audit does NOT report
  it — a track worktree legitimately sits on its merged branch until the next task branches off
  `main`, so the audit must exclude every branch listed by `git worktree list --porcelain` or
  it fires on nearly every turn and gets ignored
- WHEN the audit finds a leak THEN it prints the exact human deletion command (the push CC may
  not run) so the owner can complete [[P-011]]'s sequence
- WHEN the audit finds nothing THEN it is silent (or says "clean") — no false alarm on the
  common case, which is the norm
- WHEN the audit runs THEN it is DETECTION only — it NEVER deletes a branch itself; deletion
  stays a deliberate human act

**Notes:** DETECTION only — deliberately not deletion. Filed on the historical three-leak
pattern above even though the REMOTE audit is currently clean: the whole value is catching the
next leak automatically, not the present backlog.

**Host split — the two halves belong in different places, not either/or.** The LOCAL half needs
NO network (`git for-each-ref` + `git worktree list`), so it can live in the [[P-009]] Stop hook,
which already runs at turn end and already prints repair guidance. The REMOTE half needs
`gh`/network, so it belongs in an owner-run `pnpm` script: no turn end should pay a network
round-trip, and the remote check must degrade SILENTLY when `gh` is missing, unauthenticated or
offline rather than reddening a turn. The local half also needs a deliberate-park exclusion
beyond the checked-out guard above — `backup/pre-autosquash`, `backup/ux-batch-with-modal`,
`chore/runtime-park` and `chore/designer-idle` have no PR and are kept ON PURPOSE, so the audit
must key on "merged PR head" / upstream-`[gone]`, never on "any branch that isn't `main`".

**Decision for the OWNER (recorded, NOT applied — CC has not changed the setting).** Enabling
"Automatically delete head branches" closes the REMOTE half with no code at all: GitHub deletes
the head ref server-side on every PR merge, regardless of which `gh pr merge` flags were used.
The command is:

```bash
gh api -X PATCH repos/yasermostafaee/cg -f delete_branch_on_merge=true
```

Two things must land WITH it, or it makes things worse:

1. **[[P-011]] step 2 must treat an already-absent remote ref as SUCCESS.** With auto-delete on,
   `git push origin --delete <branch>` fails every time with "remote ref does not exist", and
   CLAUDE.md's "verifying BOTH deletions" rule reads that expected no-op as a FAILURE — so every
   ship sequence would produce a false red. The correct semantics are "remote ref already absent
   == deletion satisfied". (CLAUDE.md is deliberately left untouched by this item while the
   setting is off; that edit belongs to the flip, not before it.)
2. **The audit keeps a cheap remote cross-check anyway.** A repo setting is not a guarantee — it
   can be flipped back by anyone with admin, silently.

And it does NOT retire this item: the LOCAL ref class (seven live examples above) and the
non-PR / closed-PR class (`wip/*`, which auto-delete never touches) both survive it. P-017
NARROWS; it does not disappear.

**OBSERVED 2026-07-26 while shipping PR #409 — the already-absent case is NOT hypothetical and
NOT conditional on the setting.** `git push origin --delete docs/p-017-scope-refinement` failed
with "remote ref does not exist" even though `delete_branch_on_merge` is FALSE on this repo: the
remote ref had already been removed by another path — GitHub's merge-page delete button, or an
earlier manual delete. Confirmed after the fact: `git ls-remote origin
refs/heads/docs/p-017-scope-refinement` returns nothing, and a `--prune` fetch found no such
tracking ref to remove. So the "already-absent remote ref == deletion SATISFIED" semantics
recorded above are required TODAY, with the setting off — they are not something the flip would
introduce. That also LOWERS the future cost of the flip, since its stated prerequisite lands
here instead of alongside it.

**A SECOND door to the same [[P-011]] failure (2026-07-26).** `gh pr merge` reaches the
identical worktree failure WITHOUT the flag CLAUDE.md bans: given no `--delete-branch`, gh still
PROMPTS "Delete the branch locally?" interactively, and answering Yes fails with `fatal: 'main'
is already used by worktree at .../cg` — gh checks out the PR's base before deleting, which this
layout can never allow. CLAUDE.md forbade only the FLAG, so the interactive prompt walked
straight through the ban. Answer **No**, or pass `--delete-branch=false` to suppress the prompt;
the local ref is deleted by hand at step 3, after the worktree has moved on.

**There are not always THREE worktrees (observed 2026-07-26).** `git worktree list --porcelain`
reported a FOURTH, tooling-created worktree at `cg/.claude/worktrees/test-d0107d` holding branch
`claude/test-d0107d` — nested INSIDE the read-only `cg` worktree. It did not dirty `cg`'s status
(the `.claude/*` ignore rule covers it), so nothing announced it. Any audit hard-coded to the
three named worktrees would have read `claude/test-d0107d` as unheld and offered it for deletion
— which is why enumeration, not assumption, is now an Acceptance bullet above. A second such
worktree (`claude/brave-pike-9e0d85`) was present at the same check, so this is the tooling's
normal behavior rather than a one-off. Side effect worth flagging: CLAUDE.md's "one CC session
per worktree" invariant has an unaccounted slot, so a CLAUDE.md clause is OWED — deliberately
NOT written here, since that edit is not this item's scope.

**Priority raised medium → high (2026-07-26).** "DELETE the local ref once its PR merges" is
ALREADY written in CLAUDE.md and was still missed seven times — so more prose is not the remedy,
and the automated detection this item describes is.

**DEFERRING the `delete_branch_on_merge` flip — reasoning recorded 2026-07-26.** The flip was
initially recommended and then REVERSED on evidence. The remote half is already clean (every
leaked ref observed was `[gone]` upstream, so [[P-011]] step 2 IS being executed), and the flip
does nothing for the two classes that actually leak: the local ref, and branches whose PR was
closed-not-merged or never opened. It also cannot land alone, since with auto-delete on, step 2
fails on every ship until the already-absent-ref clause exists. **DECISION: hold the flip and land
it in the same PR that implements this item's audit**, where the clause and the audit semantics
settle together and the shared-config cost is paid once. (The clause itself already landed in
#411, so the flip's prerequisite is satisfied and the remaining reason to wait is bundling, not
blocking.)

**A FOURTH occurrence of the LOCAL class, immediately after #413 merged (2026-07-26).**
`origin/chore/remove-stray-tmp-avi` was pruned but `chore/remove-stray-tmp-avi` survived locally
AND stayed CHECKED OUT in `cg-runtime`. That shows the leak is not merely an unnoticed ref: the
worktree is still sitting on it, so any audit that proposes deletion without first moving the
worktree off the branch will FAIL. The audit must report the HOLDING WORKTREE, not just the
branch.

Cross-refs [[P-011]] (the sequence this audits), [[P-009]] (host for the local half),
[[P-014]] (the owner merges, so the deletion step is theirs to complete).

## [ ] P-018 — a stray 26.9 MB `.avi` is committed on `main`, beside application source ⟨priority: medium⟩

**What:** `apps/designer/tmp-282-long.avi` — 26,898,154 bytes (~26.9 MB) — is tracked on `main`.
Three things mark it as an accident rather than a fixture: it sits beside application source
instead of under `apps/designer/tests/e2e/fixtures/`, where every legitimate video fixture
lives; it carries a `tmp-` prefix; and its name matches no test that reads it. It entered in
`7379dad` — `feat(designer): D-128 P4 — VideoDriver + lifecycle + shared element-outro seam`
(PR #401, 2026-07-25) — i.e. it is spillover from the [[D-128]] video-import work. Nothing in
`.gitignore` would have caught it: the only `tmp` rule is `tmp/` (line 2), a DIRECTORY pattern
that cannot match a `tmp-` filename, and `git check-ignore -v apps/designer/tmp-282-long.avi`
confirmed the path matched no rule at all (observed 2026-07-26, before the guard below landed).
**Why:** Every fresh clone and every checkout pays for it, permanently — and removing it from
HEAD does NOT reclaim that cost, because the blob stays reachable through history. The removal
commit is still worth doing on its own terms (it stops the file being mistaken for a fixture,
and stops a second one landing beside it), but it must not be mis-sold as a size fix: only a
history rewrite would be one, and that carries its own price, below. For scale, this single
blob is ~17× the entire legitimate video-fixture set.

Recorded here as a SEPARATE, LOWER-priority observation — deliberately NOT filed as its own
item: the three real `.avi` fixtures under `apps/designer/tests/e2e/fixtures/` are duplicated
byte-for-byte under `tools/spikes/video-convert/fixtures/` — `box-64x64-bgra.avi` (662,082 B),
`gradient-64x64-premult-bgra.avi` (415,886 B) and `motion-64x64-premult-bgra.avi` (497,926 B),
1,575,894 B (~1.5 MB) per side. Each pair resolves to ONE blob OID, so git already stores the
bytes once and the repo does not actually pay twice; the real cost is maintenance drift — two
paths to keep in sync, with nothing stating which is canonical. That is precisely why it ranks
below the stray file and does not justify its own item.
**Acceptance:**

- [x] WHEN the stray file is identified THEN it is removed from HEAD in a DEDICATED commit that
      touches nothing else
- [x] WHEN the removal lands THEN `.gitignore` gains a rule that would have PREVENTED it (e.g. a
      `tmp-*` pattern scoped to `apps/`), so the class cannot recur
- [ ] WHEN a history rewrite is considered THEN the decision is RECORDED either way — with three
      active worktrees a rewrite forces every worktree to re-clone or hard-reset, so "accept the
      history cost, clean HEAD only" is a legitimate recorded OUTCOME, not a deferral
- [ ] WHEN a large binary is added in future THEN a size guard flags it — **OPTIONAL / follow-up,
      explicitly NOT required to close this item**

**Notes:** the fix is a deletion plus a `.gitignore` line; the judgment call is the rewrite
question, which is why Acceptance forces it to be answered rather than left open. If the
optional size guard is ever built, its natural home is the existing hook plumbing rather than a
new mechanism — [[P-009]]'s Stop hook already runs at turn end and already prints repair
guidance. Introduced by [[D-128]] Phase 4; that item is unrelated in substance and does not
need reopening for this.

**The removal does NOT reclaim the ~26 MB (2026-07-26).** The blob stays reachable from
`7379dad`, so every clone still pays for it — HEAD is clean, the repository is not smaller. The
standing decision is therefore **"clean HEAD only, accept the history cost"**: a rewrite would
force all worktrees to re-clone or hard-reset, and that price is not worth 26 MB. That is a
RECORDED outcome, not a deferral — the third Acceptance bullet ticks on it and the item closes,
once the owner ratifies it.

## [ ] P-019 — CLAUDE.md's worktree model is missing two facts, each of which has already caused a wrong action ⟨priority: medium⟩

**What:** two verified facts about this multi-worktree layout that CLAUDE.md does not state.

**(1) TOOLING-CREATED WORKTREES ARE NOT RARE AND ARE NESTED INSIDE THE READ-ONLY WORKTREE.**
Verified 2026-07-26 by `git worktree list --porcelain`: the repo held FIVE worktrees, not three —
the three owned ones plus TWO created by Claude Code, both nested inside `cg`:

- `cg/.claude/worktrees/brave-pike-9e0d85` on `claude/brave-pike-9e0d85` at `0436cd1`
- `cg/.claude/worktrees/test-d0107d` on `claude/test-d0107d` at `cb5a3ad`

A THIRD of the same class, `claude/project-worktrees-c253bc`, had been removed by hand earlier the
same day — three in one day. Neither surviving one dirtied `cg`'s status, because the `.claude/*`
ignore rule covers them, which is exactly why they are easy to miss. Both point at commits already
on `main` (the #411 and #410 squash commits), so both hold zero unique work — but that had to be
checked, not assumed. Note the shape of the miss: an audit that looks at SIBLING directories of
`cg` finds none of these, because they live UNDER the worktree that is supposed to be read-only.

**(2) SHARED STASH STACK.** `refs/stash` lives in the shared git directory, not per-worktree, so
`git stash list` shows the SAME stack from every worktree. Observed 2026-07-26: a stash labelled
`WIP feat/runtime-modal-and-context-menu` (created on the runtime side) was visible from
`cg-designer` and read as "misplaced work in the wrong worktree" — it was not misplaced.

**Why:** (1) any inventory or audit hard-coded to three worktrees, or scanning only siblings of
`cg`, mis-classifies a tooling worktree's branch as unheld and offers it for deletion — and
`git branch -D` on a branch held by a live worktree fails, so the audit's own output becomes
untrustworthy; (2) a `stash pop`/`apply` run from the wrong worktree applies another track's diff
onto this checkout, which is silent corruption, not an error.

**Acceptance:**

- WHEN any tool or audit needs the worktree set THEN it enumerates
  `git worktree list --porcelain` and never assumes a fixed count or a fixed location
- WHEN a branch under `claude/*` is found THEN it is treated as possibly tooling-held and checked
  against the enumerated worktree set before any deletion is proposed
- WHEN a worktree is enumerated THEN paths nested under `cg/.claude/worktrees/` are included; a
  sibling-directory scan is NOT sufficient
- WHEN a stash entry is encountered THEN it is NOT applied from a worktree other than the one that
  created it; rescue is by tag (`git tag <name> refs/stash`), which needs no checkout
- WHEN CLAUDE.md is read by a session THEN both facts are stated there (satisfied by commit 2 of
  this PR)

**Notes:** cross-ref [[P-017]], whose audit Acceptance already requires worktree enumeration —
this item is the general rule behind that one bullet.

## [ ] P-020 — rescue tags exist only on this disk and a re-clone would destroy them ⟨priority: medium⟩

**What:** the "tag before deleting" pattern this repo now uses produced two LOCAL-ONLY tags:
`parked/openspec-archive-2026-07-19` (the parked archive WIP whose PR #374 was closed, never
merged) and `stash-rescue/2026-07-26-runtime-modal` (the shared-stash entry above; as of filing
this second tag has not actually been created yet). Neither is pushed. A worktree restructure, a
fresh clone, or deleting the repo directory destroys both, and the whole point of the pattern is
reversibility.
**Why:** the pattern is only as durable as its weakest ref. An unpushed tag is a promise that
survives exactly one disk.
**Acceptance:**

- WHEN a rescue tag is created THEN it is pushed, or its non-durability is recorded as a
  deliberate choice at creation time — never left implicit
- WHEN a worktree restructure is planned THEN pushing all local-only tags is a named prerequisite
  step, executed BEFORE any directory moves
- WHEN tags are pushed THEN note that a tag push is NOT a deletion, so the pre-push hook runs the
  full gate and takes the host lock for minutes ([[P-010]]'s skip does not apply) — so it must not
  be run between a Phase-6 build and its smoke

**Notes — the `../cg` review is DONE (2026-07-27), audit result recorded here.** A sweep of
`CLAUDE.md`, `docs/`, `tools/`, `.husky/`, `.claude/hooks/` and `.github/` found exactly **two**
executable relative paths, both step 4 of the ship sequence: `CLAUDE.md:273` and `CLAUDE.md:331`
(`git -C ../cg pull --ff-only`). **No hits in `tools/`, `.husky/`, `.claude/hooks/` or `.github/`** —
no hook or script hardcodes it. The further `.../cg` matches (`CLAUDE.md:285`, `CLAUDE.md:299`, and
two in this file under P-011/P-017) are NOT relative paths: they are an elided ABSOLUTE path inside
quoted git error text (`'main' is already used by worktree at .../cg`). They need no change.

**The fix ships as dynamic resolution inside `/ship`, NOT as an edit to those two lines — this is
deliberate, not a half-done audit.** `.claude/commands/ship.md` resolves the `main` worktree by
parsing `git worktree list --porcelain` for `refs/heads/main`, so the automated path is correct
from any worktree, including one nested under `.claude/worktrees/` where `../cg` resolves to
nothing. `CLAUDE.md:273` and `:331` stay as written on purpose: they document the HUMAN procedure,
which is run from a sibling worktree where `../cg` is correct. A later reader should not "finish"
this audit by editing them. If the restructure moves `cg` out of the sibling layout, THAT is when
those two lines change — together with the rules below.

The pending worktree restructure still requires reviewing the CLAUDE.md rules that exist only
because `cg` permanently occupies `main`
(no worktree can `git checkout main`) — if `cg` stops holding `main`, that rule must be DELETED,
not left to mislead. [[P-013]]/[[P-015]]/[[P-016]] are unaffected: the gate lock is host-wide, so
worktree count changes collision RATE, not correctness.

## [ ] P-021 — the `cg:state` change was announced but its specification does not exist ⟨priority: low⟩

**What:** on 2026-07-26 a change was announced as in preparation on branch
`chore/session-state-file` in the `cg-designer` worktree, comprising husky `post-commit` /
`post-checkout` / `post-merge` / `post-rewrite` hooks, a root `cg:state` script,
`tools/session-state.mjs`, and a CLAUDE.md subsection. An exhaustive search found: no such branch
locally or on `origin`, `tools/session-state.mjs` on no ref and in no worktree and not untracked,
and no transcript on the machine containing the work. Only the announcement itself survives — a
four-line file list with no design.
**Why:** the file list names WHAT without saying what the state file records, where it lives, who
reads it, or what the hooks and the script do. Reconstructing that from the summary would put
invented policy into shared config (the hook set, root `package.json`, CLAUDE.md).
**Acceptance:**

- WHEN this change is resumed THEN the original specification is recovered first, or the design is
  redone explicitly and from scratch with the owner — never inferred from the announcement
- WHEN the four-line summary is all that is available THEN no implementation is written

**Notes:** the correct behaviour on encountering this gap was to STOP and report, and that is what
happened. Do not treat the announcement as a spec. A throwaway PowerShell dump the owner runs to a
scratch path OUTSIDE every worktree is not this change and does not unblock it — it commits
nothing and touches no shared config.
