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

## [ ] P-012 — the pre-push hook should honor the docs-only carve-out via the shared classifier ⟨priority: low⟩

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
