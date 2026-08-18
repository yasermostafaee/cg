# Platform / infra / tooling — backlog

Cross-cutting items: shared packages, build/hosting, tests. See `README.md`.

## [ ] P-001 — Bundle Vazirmatn offline ⟨priority: high⟩

**What:** Ship the Vazirmatn font with the apps instead of loading it from the
jsdelivr CDN, and tighten the CSP accordingly.
**Why:** Broadcast machines are often air-gapped; a CDN `<link>` breaks Persian
rendering offline and forces a loose CSP.
**Acceptance:**

- WHEN an app loads with no network THEN Persian text still renders in Vazirmatn
- WHEN the app loads THEN the CSP no longer needs `cdn.jsdelivr.net`
  **Notes:** add `@fontsource/vazirmatn`, import it in each app entry, drop the
  `<link>` in `index.html`. Touches `@cg/ui` font stack + both apps.

**Priority RAISED medium → high (2026-08-02) — the raise came from a FIELD REPORT, not from
re-reading this item.** The defect was reported independently during the `DEBT.md` sweep as the
app's UI font loading from a CDN, and on a LAN-only or air-gapped machine **that request never
returns** — the observed symptom is a hang, not a fallback to a system face. That is stronger than
the `medium` recorded here: this item was written as a portability and CSP improvement, and the
report shows the target deployment is the one that breaks. The `What`, `Why` and `Acceptance`
above already describe the fix correctly and are unchanged; only the severity moved.

### ⭐ FOLDED IN 2026-08-11 — `runtime-splash-screen` task 8.4, and it makes the Runtime half CHEAPER than this item assumes

R-035's deferral list carried "the Runtime's UI font still comes off a CDN" as an item of its own.
It is **not** a separate item — it is exactly this one, so it is folded in here rather than filed
as a duplicate (source:
`openspec/changes/archive/2026-08-11-runtime-splash-screen/DEBT.md` §4). Two facts come with it,
and the first changes the shape of the work:

1. 🔴 **The Runtime ALREADY SHIPS the Vazirmatn faces** — `apps/runtime/src/renderer/fonts.css`
   carries them — **but that file is imported only as `?inline`, for template delivery.** So the
   app UI reads Persian off the network while the same faces sit unused in the bundle. For the
   Runtime the fix may therefore be pointing the app UI at faces that are already there and
   dropping the `<link>`, rather than adding `@fontsource/vazirmatn` as the Notes above assume.
   **Check which is true per app before adding a dependency** — the Designer already self-hosts.
2. **A partial mitigation is already in place on the Runtime, and it is NOT the fix.** R-035 made
   the jsdelivr `<link>` non-render-blocking (`media="print"` until `onload`), because in its
   previous form it blocked the FIRST PAINT until the CDN answered or the socket timed out — on a
   LAN-only machine, never. That removed the hang from the boot path and **nothing more**: the UI
   still falls back to a system face offline, which is a Persian/RTL shaping regression, not a
   cosmetic one. Do not read the splash's green acceptance as evidence this item is smaller than
   it was.

The verification this needs is a font-loading change with Persian/RTL consequences — mixed
RTL/LTR shaping checked with the network cut, per CLAUDE.md golden rule 4 — which is why R-035
declined to smuggle it into a boot screen.

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
provably equivalent to the Stop hook's, never a THIRD rule set.

**CORRECTION 2026-08-08:** the "sole authoritative proof" clause has lapsed — CI is back and runs
on every push to `dev`, so the pre-push gate is fast local feedback, not the only proof. The
DESIGN constraint it was arguing for is UNCHANGED and still the point of this item: one shared
classifier, never a third rule set. If anything the case is stronger, since a divergent local
carve-out would now also disagree with CI. Sits beside [[P-010]]'s
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

**PARTLY SUPERSEDED 2026-08-08 — the PR half is gone, the RISK half is not.** The per-change
branch + PR model was retired ([[P-026]]): CC now commits and pushes to `dev`, and the owner
merges `dev` → `main` by hand, so "CC opens a PR and stops" no longer describes anything. What
SURVIVES verbatim, and is still carried in CLAUDE.md under this item's number, is the reason the
policy existed and its three pause-and-flag classes — on-air/export/product source, an owed
hardware or Linux `gate:e2e` run, and shared config the next session must pick up. Those are
about RISK, not about PRs; CC still names them out loud when a commit falls in one. Read the
body below as the record of the PR-era wording.

**And the SECOND premise has lapsed too (2026-08-08).** The **Why** below reasons from "while
GitHub Actions billing is out (~Aug) the local gate is the ONLY landing gate", and the Acceptance
bullet "WHEN remote CI returns (~Aug) THEN the auto-merge-eligible class is revisited" is the
condition that has now fired. CI is restored and `pr.yml` runs on every push to `dev`, so the
independent check the policy was missing EXISTS: CC pushes to `dev`, CI verifies it, the owner
merges to `main`. CLAUDE.md carries the current wording.

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

## [!] P-017 — merged remote branches survive the ship sequence, and nothing detects the leak ⟨priority: high⟩ — obsolete: the per-change branch + PR model was retired 2026-08-08; there are no per-change remote branches left to leak

**OBSOLETE 2026-08-08 — the model this item audited no longer exists.** All work now lands on `dev`
in one folder; there are no per-change feature branches, no PRs, and no [[P-011]] ship sequence, so
there is nothing left to leak and nothing for the audit to intersect. `main` moves only on the
owner's hand-merge of `dev`. Everything below is kept as the RECORD of why the audit was wanted —
it is evidence, not a live backlog. If a per-branch model ever returns, re-open rather than re-file.
See [[P-026]] for the change that retired it.

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

**`/ship` now implements the detach-before-delete step this item identified as necessary
(2026-07-27).** "The local ref is deleted by hand at step 3, after the worktree has moved on"
(above) is a PRECONDITION, not a description: `git branch -D` fails outright while a worktree
holds the branch — observed literally as `error: cannot delete branch 'tmp/ship-detach-test'
used by worktree at 'D:/wt-t'`. Since the tooling creates a worktree per session, the branch
being shipped is almost always still held by the worktree that produced it, so an audit or a
ship run that deletes without first moving the holder off the branch fails on essentially every
real invocation. `.claude/commands/ship.md` resolves the holding worktree from the same
`git worktree list --porcelain` enumeration this item's Acceptance already requires, detaches it
at the merge commit, then deletes. Three constraints, all verified on a scratch worktree:

- **A DIRTY holder STOPS the run.** `git checkout --detach` does NOT refuse on a dirty worktree —
  it exits 0 and carries the uncommitted changes across silently. So the guard is load-bearing,
  not belt-and-braces; git will not protect the work here.
- **Detach, never `git worktree remove`.** Detaching frees the branch; removal is a much larger
  mutation and stays the owner's call.
- **Self-holding works.** A worktree can detach ITSELF and then delete its own former branch —
  confirmed from inside the holder, since that is the common case (the session worktree ships its
  own branch).

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

## [!] P-019 — CLAUDE.md's worktree model is missing two facts, each of which has already caused a wrong action ⟨priority: medium⟩ — obsolete: the worktree model itself was retired 2026-08-08

**OBSOLETE 2026-08-08 — the model these two facts were missing FROM has been retired.** There is one
repo folder on `dev`; the `cg` / `cg-designer` / `cg-runtime` scheme is gone, and CLAUDE.md now states
the new model instead. One half survives and was CARRIED FORWARD rather than dropped: tooling still
creates worktrees under `.claude/worktrees/*`, so CLAUDE.md keeps the rule that worktrees are
ENUMERATED via `git worktree list --porcelain`, never counted or assumed. The shared-stash half lapses
with the two-track split that made it dangerous. Kept as the record. See [[P-026]].

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

## [x] P-020 — rescue tags exist only on this disk and a re-clone would destroy them ⟨priority: medium⟩ — CLOSED 2026-08-03, measured: zero local-only tags remain; see the closing note

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

### CLOSING NOTE — 2026-08-03. Measured, not assumed.

**Both tags this item names are now on `origin`, and there are no local-only tags at all.**
Measured by comparing `git tag -l` against `git ls-remote --tags origin`:

```
local tags: 16      origin tags: 22
local-only tags (present locally, absent on origin):  NONE
```

`origin` is a strict SUPERSET — it additionally carries five `snapshot/2026-07-20-*` tags and
`stash-rescue/2026-07-26-runtime-modal` that a plain `git fetch` does not pull into a checkout,
because they point at commits outside `dev`'s history. That is the safe direction: the backup holds
more than the disk.

Both named tags are covered. `parked/openspec-archive-2026-07-19` is pushed, and
`stash-rescue/2026-07-26-runtime-modal` — which this item recorded as _"as of filing this second
tag has not actually been created yet"_ — exists on `origin`. The concrete debt is discharged in
full, not partly.

**What remains is a standing rule, and a standing rule does not belong in a permanently-open
item.** It moves to two places that are actually read: `CLAUDE.md`'s worktree section, and
[[P-025]]'s acceptance — **a rescue tag is pushed at creation; a tag that exists only on one disk
is not a rescue.** Closing this item is therefore a relocation of the rule, not an abandonment of
it.

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

## [ ] P-022 — an item-number claim derives from the headings across EVERY ref, for all five prefixes, immediately before commit ⟨priority: medium⟩

**What:** make the claiming procedure a numbered rule. A `B-`/`C-`/`D-`/`P-`/`R-` number is claimed
by DERIVING it — the highest heading that exists, swept across every ref, immediately before the
commit that writes the heading — never by reading a recorded value.

**Why:** the rule exists because the failure is recorded three times. A "next free" value is a
snapshot with a shelf life, never an allocation: it misled twice as a stale value someone READ, and
once as a stale value someone WROTE that reached `main` and told the next session to take a number
that was already gone. The `R-031` double-claim is the same failure in a prefix nobody was
watching — a splash filed as `R-031` on one branch while `R-031` (the operator surface) already
existed on another.

**This is the DURABLE rule, not the fast-mode one — deliberately re-scoped.** `DEBT.md:180` words
it as "a claim must check **both** branches", which was correct while `dev` held unmerged
`docs/prd/*` edits. That framing is already obsolete: `main` is frozen, and
[b-number-registry.md](b-number-registry.md) now carries an all-ref derivation that is a strict
superset of "both branches". Filing the two-branch wording would date the rule on the day it
landed.

**Acceptance:**

- The procedure is stated once, for all five prefixes, in
  [b-number-registry.md](b-number-registry.md) — done, as of the 2026-08-02 audit entry.
- A claim is derived immediately before the commit that writes the heading, not when the session
  starts.
- The sweep covers every ref (`git for-each-ref` over remotes and heads), not the current checkout.
- A claim is never one number wide by assumption — a sibling session may claim a RANGE.

**Why it is NOT [[B-075]], and the distinction is the whole reason this needs its own number.**
`B-075` (`[x]`, [bugs.md](bugs.md)) built the CI guard that stops a duplicate `B-` number from being
**MERGED**. That is ENFORCEMENT, and it covers **`B-` only, over the three bug files**. `P-022` is
the **claiming PROCEDURE**, across all five prefixes. The procedure is documented but **not
enforced** for `C-`, `D-`, `P-` and `R-` — which is precisely the gap `R-031` fell through: had the
`B-` guard's equivalent existed for `R-`, the double-claim could not have merged.

**Notes:** extending the audit guard to the other four prefixes is the obvious follow-up and is
deliberately NOT folded in here — it is a code change to
`tools/soak-runner/tests/bug-number-audit.test.ts` and wants its own item. Source: `DEBT.md:180`.

## [ ] P-023 — a control test that reaches a different implementation than the one under test is not a control test ⟨priority: medium⟩

**What:** record, as a rule with a worked example, that a control test only controls for something
if it exercises the SAME implementation as the test it is validating.

**Why — the incident, because the rule is only convincing with it.** A CasparCG 2.5.0 probe
concluded that `CG ADD` could not take an http URL. The one result that looked like it exonerated
the environment was a bare `PLAY "<url>"` returning `202 OK` while both `[HTML]` forms returned
`404`. That reading was almost certainly the **ffmpeg** producer answering, because ffmpeg accepts
http URLs too. So the "control" reached a different producer than the one under test, and it turned
"the HTML producer is broken" into "CG ADD cannot take a URL". The invented mechanism then sounded
plausible enough to write up **with a recommendation attached** — run 2.3.2 instead of 2.5.0.

The real cause was that CEF was dead in that instance (`cef_executor Could not post task`), fixed by
adding an `<html>` block with a writable `cache-path` to `casparcg.config`. 2.5.0 works.

**The lesson, stated so it transfers:** the probe needed to establish **WHICH implementation
answered** before drawing any conclusion from the fact that one form succeeded. **Confidence came
from the crispness of the table, not from its validity** — a tidy result matrix reads as rigour and
is not.

**Acceptance:**

- A recon or probe that compares two forms records which implementation served each one, or states
  that it could not tell.
- A conclusion drawn from a control that cannot be attributed is labelled as unattributed rather
  than reported as a measurement.

**Notes:** the void notice for the original entry is preserved in `DEBT.md` rather than deleted,
because the mistake is more instructive than the conclusion was. [[B-126]] is the one finding from
that session that SURVIVED the void — the event was real even though the diagnosis was not.
Source: `DEBT.md:1456`.

## [ ] P-024 — PATTERN (twice): an observer effect silently no-ops when its target is absent on the first render ⟨priority: medium⟩

**What:** record as a **shape**, not an instance: a `ResizeObserver` (or similar) effect keyed on
values that are ready before its target element is, so on the first pass the ref is `null`, the
effect returns early, and **no observer is ever attached**. Nothing errors. The value it should
have computed keeps its initial default forever.

**Two occurrences, which is why it is a pattern:**

1. **PVW's white page** (`RehearsalStage`) — the effect was keyed on
   `[raster.width, raster.height]`, but the fit box only renders once `html` has arrived. On the
   first pass `fitRef.current` was `null`, so `fit` stayed at its initial `1` and the rehearsal
   rendered unscaled, filling the panel.
2. **The b2 density bug** — an effect keyed on `[ref]` never re-ran because `bank` was `null` on
   the first render.

**Why:** both were **invisible in code review and obvious on screen**, and both were found by
LOOKING rather than by a test. That combination is what makes it worth a numbered pattern: the
class is not reachable by the review or the test discipline this repo already has.

**Acceptance:**

- An effect that attaches an observer keys on the presence of its TARGET, not only on the values it
  will observe — or it re-runs when the target appears.
- Where that shape is unavoidable, the effect fails loudly rather than returning early in silence.

**Notes:** the general form is that an early `return` on a missing ref is indistinguishable, at
runtime, from an effect that ran and found nothing to do. Source: `DEBT.md:1732`.

## [ ] P-025 — PowerShell silently ALTERS arguments and file content, and does not necessarily error ⟨priority: medium⟩

**What:** record the class, with its measured instances, and the rule that avoids it. On this
Windows box PowerShell will change what a command receives or what a file contains, **without
failing**, so the damage is discovered later by someone reading a wrong number or a corrupted file.

**Four measured instances, one class:**

1. **`Measure-Object -Line` silently under-counts.** It reported **2203** lines for `DEBT.md`
   against a true **2707** — blank lines are not counted. A session sized its work from the wrong
   number. (Verified here with git plumbing: `git grep -c "" HEAD -- DEBT.md` → `2707`,
   `git cat-file -s HEAD:DEBT.md` → `179522` bytes.)
2. **`Get-Content -Raw` / `Set-Content` corrupt non-ASCII text.** One rewrite turned **35
   em-dashes into mojibake** and injected a BOM.
3. **The BOM is still in the tree, so this is not a historical note.** Two files carry a UTF-8 BOM
   (`EF BB BF`) today: **`docs/prd/bugs-runtime.md`** and **`docs/prd/runtime.md`** — both heavily
   edited files. Prettier does not strip it and no gate step fails on it.
4. **An unquoted `stash@{n}` is mangled before git sees it.** PowerShell parses `@{` as the start
   of a hashtable literal, so the argument git receives is not the one that was typed.

**Why:** the common property is that **PowerShell does not error**. A wrong line count looks like a
line count; a mojibake em-dash looks like text; a mangled stash ref produces a git error that
appears to be git's fault. Every one of these is discovered downstream, by which point a decision
has already been made on the bad value.

**THE RULE:** count and read with **git's own plumbing** (`git cat-file -s`, `git grep -c ""`,
`git grep`) or with proper edit tooling. Do not use `Measure-Object -Line` to size a file, do not
round-trip text through `Get-Content -Raw` / `Set-Content`, and always quote a `stash@{n}` argument.

**Acceptance:**

- File sizes and line counts quoted in any report come from git plumbing, not from
  `Measure-Object`.
- Text files are edited with tooling that preserves encoding; no rewrite introduces a BOM or
  changes a non-ASCII character.
- `stash@{n}` and any other `@{`-bearing argument is quoted.
- **A rescue tag is PUSHED at creation.** A tag that exists only on one disk is not a rescue — it
  is a promise that survives exactly one disk. Where non-durability is deliberate, it is recorded
  as a choice at creation time, never left implicit. _(Relocated here from [[P-020]] when that item
  closed on 2026-08-03; it is the standing half of a debt whose concrete half is discharged.)_

**UPDATED 2026-08-03 — the sweep found SEVEN BOMs, not two.** The "two files" above was a
measurement of two files, not of the repo. All 2180 tracked files were scanned; seven carried a
BOM. `docs/prd/bugs-runtime.md` and `docs/prd/runtime.md` were stripped (three bytes each, nothing
else touched). **Five remain**, left alone because that session shipped zero product code and did
not edit archives:

- `apps/designer/src/renderer/features/shell/Modal.css.ts` — **the one worth a second look**: a
  BOM in a TypeScript source file is carried into the build rather than sitting in a doc.
- four `openspec/changes/archive/2026-07-1*/tasks.md` files — historical records.

**Notes:** the BOMs above are recorded as EVIDENCE, not fixed here — this item only files the
class. Removing them is a separate, trivial change that should be verified not to disturb the
diffs. This item applies to commands the OWNER runs by hand; CLAUDE.md already carries the
shell-compatibility rule for that audience, and this is the content-corruption half of it, which
that rule does not currently cover. Source: measured across the `DEBT.md` sweep sessions
(2026-08-01 … 2026-08-03).

## [x] P-026 — the Stop hook measured every turn against `origin/main`, so a dev-only model killed the docs-only carve-out ⟨priority: medium⟩ — done: no change dir; filed and fixed in one commit under CLAUDE.md's Spec discipline path, with the living spec `openspec/specs/platform-local-gate/spec.md` updated in the same change

**What:** the [[P-009]] Stop hook computed the turn's changed set as the working tree UNION
`git merge-base HEAD origin/main`..`HEAD`. That was correct while every task lived on its own
short branch off `main`. It stopped being correct on 2026-08-08, when the repo moved to ONE folder
with all work on `dev` and `main` advanced only by the owner's hand-merge at the end of a day.

**Symptom:** `origin/main` became a high-water mark of finished DAYS, not of the turn. The
merge-base therefore spanned every commit since the last hand-merge, and the turn's "changed set"
became the entire unmerged backlog. A one-line PRD edit on a `dev` twenty commits ahead classified
as `code` instead of `docs-only`, so the docs-only carve-out effectively DIED: every turn paid a
full `pnpm gate` — and, as soon as any unmerged commit had touched a renderer path or a `*.css.ts`,
`pnpm gate:e2e` as well — over files the turn never touched. Nothing failed and nothing warned; the
gate simply ran long, on the wrong evidence, forever. The failure direction is over-gating, which is
why it could have survived indefinitely unnoticed.

**Fix:** the diff base is now the first ref that RESOLVES among `origin/dev`, then `origin/main`,
and when neither resolves the changed set is the working tree alone (a fresh clone with no remote is
a real state and must never throw). The ref order and the whole changed-set assembly moved OUT of
the hook and into `tools/gate-hook/src/gate-decision.mjs` — `DIFF_BASE_REFS`, `pickDiffBaseRef()`
and `collectChangedPaths(git)` — so the unit tests reach the SAME implementation the hook executes
rather than a re-derivation of it ([[P-023]]). The hook now supplies only the git runner. Both
`.claude/hooks/gate-stop.mjs` and the living spec `openspec/specs/platform-local-gate/spec.md` were
updated in the same change, as was the README's description of the hook.

**Test:** `tools/gate-hook/tests/gate-decision.test.ts` — "THE REGRESSION: a docs-only turn on a dev
far ahead of main stays docs-only" drives `collectChangedPaths` with a fake `spawnSync`-shaped git
and asserts (a) the set is the single docs path, (b) it classifies `docs-only` and yields exactly
the carve-out commands, and (c) `merge-base` was invoked against `origin/dev` and NEVER against
`origin/main`. Its twin, "the SAME turn measured against origin/main would have been a full code
gate", pins the bug itself so nobody reinstates the old base. Alongside them: base-ref priority,
the `origin/main` fallback, the no-ref case, a THROWING probe (a ref probe must never be able to
fail a turn), probe ordering, and fail-soft degradation when `merge-base` or `diff` fails.

**Why this is filed rather than left in the commit message:** the reason the base is `origin/dev`
is a property of the WORKING MODEL, not of the code. A later session that finds `origin/dev` odd —
or that restores per-change branches — needs to find the symptom and the test in one place, or it
will "fix" the base back to `origin/main` and silently reinstate a gate that proves the wrong thing.
Cross-refs [[P-009]] (the hook), [[P-012]] (the pre-push half, still open — `tools/gate-hook/src/pre-push-decision.mjs`
is branch-agnostic by construction and needed NO change here), [[P-017]] and [[P-019]] (both marked
obsolete by the same model change).

## [x] P-027 — CI's paths-filter diffed against `main`, so P-008's docs-only skip was dead on every `dev` push ⟨priority: medium⟩ — done: `.github/workflows/pr.yml`; no change dir (filed and fixed in one commit under CLAUDE.md's Spec discipline path)

**What:** `.github/workflows/pr.yml`'s `changes` job uses `dorny/paths-filter`, which — given no
explicit `base` — diffs a push against the **merge-base with the DEFAULT BRANCH**. Its own log says
so: `Searching for merge-base main...dev`. On the dev-only model that base spans every commit since
the last `dev` → `main` merge, so the "changed files" set is the entire unmerged backlog and `code`
is `true` forever once ANY code commit is unmerged.

**Symptom:** [[P-008]]'s docs-only skip was effectively DEAD on `dev` pushes. Measured 2026-08-08:
push `4bd0a0a` changed only `openspec/**` and `docs/prd/runtime.md`, and still ran `ci` AND the full
Playwright `e2e` job — ~9 minutes of runner time to prove nothing about a markdown edit. Nothing
failed and nothing warned; the skip silently stopped skipping.

**This is [[P-026]]'s failure in a SECOND TOOL, which is why it earns its own number.** P-026 was
the Stop hook measuring the turn against `origin/main`; this is CI measuring the push against
`main`. Same root cause — a base that measures the unmerged BACKLOG rather than the event — in two
independently written tools that share no code. The lesson generalises: **on a dev-only model, any
tool that defaults its diff base to the default branch is wrong by construction, and the failure is
silent because it over-reports rather than under-reports.** A third instance should be looked for,
not waited for.

**Why the OBVIOUS fix was wrong on its own.** `base: ${{ github.event.before }}` alone opens a hole,
because `concurrency` had `cancel-in-progress: true`. Once the filter looks only at what a push
changed, a code push whose run is CANCELLED by a newer push — followed by a docs-only push, which
now correctly skips the heavy jobs — leaves that code commit with **NO completed run at all**. The
old always-run behaviour hid this, because the next push re-proved the same files anyway. Since
CLAUDE.md discharges Linux `e2e` debts from exactly these runs, that hole would have manufactured
false discharges. **Both halves therefore changed in ONE commit**, and the second is not garnish:

1. **Base** — on `push`, the previous tip of the ref, so "changed files" means changed BY THIS PUSH.
2. **Concurrency** — `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`: cancel PR
   runs, never push runs, so every push gets its own completed run.

**Fail-safe, one-directional.** Over-running costs minutes; under-running lets an unproven commit
through. Every case where the previous tip cannot be trusted therefore falls back to the OLD
always-run behaviour: an all-zero `before` (new branch), a `before` absent from the fetched history
(shallow clone, expired object), and a `before` that is **not an ancestor of HEAD** (a force-push or
history rewrite, where a diff against an abandoned line of history is meaningless rather than merely
wide). An empty filter output is likewise unknown ⇒ run everything. All of it funnels through ONE
`decide` step, so the fail-safe is a single rule rather than a condition copied onto each heavy job
([[B-100]] / [[P-012]]: a second copy is how a rule drifts). `pull_request` events are untouched —
paths-filter uses the GitHub API there, not a git base.

**RESIDUAL, recorded rather than glossed:** with `cancel-in-progress: false` the IN-PROGRESS run
always completes, but GitHub keeps only ONE pending run per concurrency group, so a burst of three
pushes still supersedes the middle one while it is PENDING. "Every push gets a completed run" holds
for the normal one-at-a-time cadence, not for a burst. The lever if that ever matters is a per-SHA
concurrency group — deliberately NOT taken, because it removes the serialization that keeps
runner-minute spend bounded.

**A SECOND, INDEPENDENT CAUSE — found by the acceptance test, which is the entire reason the fix is
verified end to end rather than reasoned about.** With the base fixed, a docs-only push STILL ran
`ci` and `e2e` (run 31257557820, whose only changed file was `docs/prd/bugs.md`). The filter's own
log named the culprit: `Detected 1 changed files` … `Filter code = true` … `docs/prd/bugs.md
[modified]`. The base was right — `Push base trusted: 0d438c3…` — and the filter matched the doc
anyway.

The filter's pattern list was documented in `pr.yml` as "last-match-wins picomatch":

```yaml
code:
  - '**'
  - '!openspec/**'
  - '!docs/**'
  - '!**/*.md'
```

**It is not last-match-wins. dorny/paths-filter ORs its patterns**, so `'**'` alone makes every file
match and `code` could never be `false`. Confirmed against the repo's own pinned picomatch 2.3.2:
that list returns `true` for `docs/prd/bugs.md`, `openspec/**`, `README.md` and source alike. **So
P-008's docs-only skip had never worked at all** — the `main` merge-base masked it completely, since
a base that always reported code changes meant a filter that always said `true` was never the
visible cause. Two independent defects, one symptom; fixing only the base would have looked like a
failed fix.

`predicate-quantifier: every` (paths-filter v3) fixes the ORing and was REJECTED: `**` does not
match dot-prefixed paths, so under `every` a change to `.github/**` or `.claude/**` classifies as
docs-only and SKIPS the gate. That trades an over-run for an UNDER-run — the one direction this item
exists to prevent — and it rests on an unverifiable assumption about the action's internal `dot`
option.

**The fix: on `push`, classify with the repo's OWN predicate.** `classifyChangedSet` from
`tools/gate-hook/src/gate-decision.mjs` — the same unit-tested function the [[P-009]] Stop hook and
CLAUDE.md's carve-out use — is fed the diff against the trusted base. It is zero-dependency plain
ESM, so the runner's preinstalled node runs it straight off the checkout. This is CLAUDE.md golden
rule 6 applied to CI: reuse the ONE canonical predicate, never re-derive it — and it means CI and the
local gate cannot drift, which a second glob copy guarantees eventually ([[B-100]], [[P-012]]).
`pull_request` keeps paths-filter unchanged: there is no local base for a PR, so the action's
API-based diff is still the right tool, and that path was deliberately left alone.

Verified locally against the exact script the workflow runs, before pushing it: `docs/prd/bugs.md`
alone ⇒ `code=false`; that file PLUS `packages/ui/src/tokens.ts` ⇒ `code=true` (the STRICT condition
survives — code bundled into a docs change is never skipped); `.github/workflows/pr.yml` alone ⇒
`code=true` (the dotfile hole is closed); an empty diff ⇒ `code=false`.

**How it is verified — end to end, not by reasoning.** The fix landed, then a docs-only commit was
pushed and the resulting run was read: `ci` and `e2e` **skipped**, `docs-check` and `required`
**green**. That is the whole point of the item, so it is the acceptance test, and anyone can re-run
it: push a `docs/**`-only commit to `dev` and read the run. It is also what caught the second cause
above — the first "fix" passed review and failed the test.

**Acceptance:**

- WHEN a push to `dev` changes only `openspec/**`, `docs/**` or `*.md` THEN `ci` and `e2e` are
  SKIPPED and `docs-check` + `required` pass
- WHEN a push changes a dot-prefixed path (`.github/**`, `.claude/**`, `.husky/**`) THEN it counts
  as CODE and the heavy gate runs — a glob-based filter gets this wrong by default
- WHEN a push changes any non-docs file THEN `ci` and `e2e` run, exactly as before
- WHEN a push's previous tip is all-zero, absent from history, or not an ancestor of HEAD THEN the
  workflow FAILS SAFE and runs everything
- WHEN the event is a `pull_request` THEN the filter's API-based behaviour is unchanged
- WHEN a push run is in progress and another push arrives THEN the first run is NOT cancelled

**Notes:** cross-refs [[P-008]] (the docs-only skip this restores), [[P-026]] (the same failure one
layer in, in the Stop hook), [[P-028]] (the sibling change that made CI the only place the Linux E2E
runs — which is what raised the stakes on a push getting a completed run).

## [x] P-028 — the Stop hook's local `gate:e2e` cost ~224 s per UI turn for a signal that could never discharge the debt ⟨priority: medium⟩ — done: `.claude/hooks/gate-stop.mjs` + `tools/gate-hook/`; living spec `openspec/specs/platform-local-gate/spec.md` updated in the same change

**What:** the [[P-009]] Stop hook ran `pnpm gate:e2e` on any UI/render diff. It no longer does. The
UI/render CLASSIFICATION stays, and the hook prints a NON-BLOCKING reminder that a Linux `gate:e2e`
is owed; the suite itself runs on CI, on Linux, on every push to `dev`.

**Why:** measured 2026-08-08 on this host — the local Windows `gate:e2e` takes **224 s**
(`0 cached, 22 total`; designer 237 specs in 2.7 m), on top of **~140 s** for `pnpm gate`. That is
~6 minutes per UI turn, paid on EVERY turn of a multi-turn UI task, not once. What it bought was a
signal that **could never discharge anything**: CLAUDE.md's discharge rule makes a Windows pass
non-authoritative, so the run that just cost six minutes left the debt exactly where it was. Since
[[P-027]], CI runs the authoritative Linux suite on every push to `dev`, so a hard break is caught
minutes later by a runner whose verdict actually counts.

**What was deliberately NOT done, because each is a worse trade:**

- **NOT replaced with the changed-app-only suite.** Half the cost for a signal that still cannot
  discharge anything is the same bad trade at a discount.
- **The hook does NOT force a push.** Pushing work-in-progress to `dev` to obtain a CI run is worse
  than a late E2E signal: the owner merges `dev` into `main` at the end of a day and expects what is
  there to be final.
- **The OBLIGATION is untouched.** `classifyChangedSet` still reports `needsE2e`, the reminder still
  states the debt and its discharge conditions, and CLAUDE.md's rule is unchanged. Only WHO runs the
  suite moved. A future reader must not read "the hook stopped running E2E" as "the E2E stopped
  being owed" — that inference is the one thing this item exists to prevent.

**Kept:** `pnpm gate:e2e` as a manual command, and an opt-in — `CG_GATE_HOOK_E2E=1` — that puts the
local run back inside the hook for a turn, for anyone who wants the fast local signal on a given
change. Documented in CLAUDE.md and README beside the hook's behaviour.

**Acceptance:**

- WHEN a turn's changed set falls in the UI/render set THEN the hook runs `pnpm gate` and NOT
  `pnpm gate:e2e`
- WHEN it does THEN the hook emits a non-blocking reminder naming the owed Linux run, that CI on
  push is the authoritative source, and that the debt is unpaid until a completed green run URL is
  recorded beside the change's ticked task
- WHEN `CG_GATE_HOOK_E2E` is truthy and the set is UI/render THEN `pnpm gate:e2e` runs after
  `pnpm gate`
- WHEN the set is NOT UI/render THEN the opt-in adds no E2E run
- WHEN the reminder is emitted THEN the hook's exit status is unaffected by it

**Tests:** `tools/gate-hook/tests/gate-decision.test.ts` — the UI/render case yields `['pnpm gate']`
while the classification is still pinned as `{ kind: 'code', needsE2e: true }` (pinned SEPARATELY,
so a future edit cannot quietly drop the detection while the command list still looks right); the
opt-in restores `gate:e2e`; the opt-in never invents one for a non-UI set; the reminder is emitted
only for UI/render and names its discharge conditions; and the opt-in parser treats unset, empty and
garbage as OFF.

**Notes:** cross-refs [[P-009]] (the hook), [[P-027]] (which made CI the authoritative Linux run on
every push, and is what makes this safe), [[B-078]] (the local-gate flake this measurement sat
beside — unaffected, since `pnpm gate:e2e` still exists and is still what reproduces it).

## [x] P-029 — `needsE2e` was promoted from a local hint to the sole decision of whether the authoritative suite runs, so it had to be widened and inverted first ⟨priority: medium⟩ — done: `tools/gate-hook/` + `.github/workflows/pr.yml`; living spec `openspec/specs/platform-ci/spec.md` updated in the same change

**What:** the `e2e` job now runs only when the change can affect what the apps render
(`needs.changes.outputs.needs_e2e`), instead of on any non-docs change. `ci` is untouched and still
gates on `code` alone.

**Why the ORDER mattered, and why this is not a one-line change.** `needsE2e` already existed, but
it decided whether to ALSO run a local Windows suite that could never discharge anything
([[P-028]]). A hint that is merely useful is not good enough to decide whether the AUTHORITATIVE run
happens at all. Two defects had to be fixed before it could carry that weight:

**1. The render set was too narrow.** It listed five workspaces. The two apps' real runtime
`dependencies` closure — read out of the package manifests, not from memory — is TWELVE:

```
@cg/caspar-client · @cg/lottie-bridge · @cg/shared-ipc · @cg/shared-schema
@cg/single-file-export · @cg/splash-kit · @cg/starter-templates · @cg/storage
@cg/template-runtime · @cg/text-shaping · @cg/ui · @cg/vcg-format
```

Two of those were NOT on the list I was given, and both matter:

- **`@cg/splash-kit` lives under `tools/`.** Any "tools/\*\* is not render" shortcut drops the package
  that draws the splash screen. It is a runtime dependency of BOTH apps.
- **`@cg/caspar-client`** is a runtime dependency of the Runtime app — the thing that decides what
  reaches air.

Also added beyond the named list: ALL of `apps/[*]/src/` rather than only `renderer/` (`platform/` is
the browser implementation behind the bridge, `shared/` is the bridge contract itself), plus each
app's `index.html`, `public/` and Vite config.

**2. The default for an unrecognised path was BACKWARDS — a defect in its own right.**
`needsE2e` was `paths.some(isUiRenderPath)`, an allowlist test, so anything it did not recognise
answered "no E2E owed". A new workspace, a renamed directory or a root config file therefore
silently opted OUT. Tolerable while the answer only chose whether to run a redundant local suite;
not tolerable when it decides whether the authoritative run happens. Now `affectsRender(path)` =
`isUiRenderPath(path) || !isKnownNonRenderPath(path)` — **unknown fails TOWARD running the suite**.

The known-safe list is deliberately SHORT, because it is the only list whose membership can cause
the authoritative suite to be skipped: `docs/**`, `openspec/**`, `**/*.md`, `.github/**`,
`.husky/**`, `.claude/**`, `tools/gate-hook/**`. Root config is deliberately NOT on it — [[B-066]]
is an `es2022` setting in a root tsconfig that `SyntaxError`d on CEF 71 — and neither is the rest of
`tools/`, because `@cg/splash-kit` proves that directory is not uniformly harmless.

**A necessary ripple, stated because it was not in the brief:** `required` had to learn the
difference between a DELIBERATE skip and a missing run. A skipped `e2e` passes only when
`needs_e2e` is `false`; a skipped `e2e` that was OWED still fails the aggregator, so a job that
fails to start can never be mistaken for a deliberate skip. Without that, every skipping run would
have gone red.

**Acceptance:**

- WHEN a push changes a workspace in the apps' runtime dependency closure THEN `needs_e2e` is true
  and the `e2e` job runs
- WHEN a push changes a path in NEITHER list — a new workspace, a rename, a root config file — THEN
  `needs_e2e` is true
- WHEN a push changes only paths known to be unable to affect the built apps THEN `e2e` is SKIPPED
  and `required` still passes
- WHEN `e2e` is skipped while `needs_e2e` is true THEN `required` FAILS
- WHEN the event is a `pull_request` THEN `needs_e2e` is true, so PRs are unaffected
- WHEN the `ci` job's condition is read THEN it is unchanged — gated on `code` alone

**Tests:** `tools/gate-hook/tests/gate-decision.test.ts`, +30 (160 → 190): every one of the twelve
workspaces asserted individually by name; app `src/`, `index.html`, `public/` and Vite config; the
unknown-path default across new workspaces, unknown files and root config; that ONE render path
among safe ones still owes the suite; and that only the short known-safe list can skip it. **Five
pre-existing tests changed their expected verdict** — they asserted the OLD narrow behaviour
(`packages/shared-schema` and `apps/*/src/platform/` as NOT render). They were rewritten rather than
deleted, with the two moved paths re-asserted as render paths, so the change of verdict is visible
in the diff instead of silent.

**Notes:** cross-refs [[P-028]] (which made CI the only place the suite runs, and so created the
stakes), [[P-027]] (the push classifier this rides on), [[P-008]] (the docs/code split `ci` still
uses), and the completeness backstop now recorded in CLAUDE.md and
`openspec/specs/platform-ci/spec.md` — the daily `dev` → `main` merge classifies the whole span, so
anything an individual push skipped is still caught there.

## [x] P-030 — the `dev` → `main` merge re-runs a full gate against a SHA that already has a green one ⟨priority: medium⟩ — SHIPPED: `.github/workflows/pr.yml` (the `reuse` step) + `tools/gate-hook/src/reuse-decision.mjs` (the pure rule). The `event === 'push'` match condition is archived at `openspec/changes/archive/2026-08-11-platform-reuse-guard-push-only/` (living spec `platform-ci`), verified by CI run <https://github.com/yasermostafaee/cg/actions/runs/31475639919> on commit `d693fa35` — `conclusion: success`, `Lint • Typecheck • Test • Build` ✓. ⚠ That run's `e2e` job was **skipped** (classifier: `{kind: 'code', needsE2e: false}`), which is correct for this diff and discharges NO e2e debt — this change alters no UI, layout, or rendering path

**The symptom.** `dev` → `main` is a **`--ff-only`** merge, so `main`'s new HEAD is the **SAME
COMMIT** as `dev`'s tip — **same SHA, same tree**. The push to `main` fires a full run against a tree
that already has a completed green run.

**The measured cost.** Roughly **15 runner-minutes** a time, **once a day**. On a private repo those
minutes are metered, so this is a recurring bill for re-proving a tree nothing changed.

⚠ **`[skip ci]` cannot help**, and this is why the fix has to be a workflow-level guard rather than a
commit-message convention: **a fast-forward creates no commit** whose message could carry it.

### The four-part match condition — and the third is the one a naive version gets wrong

The guard asks the Actions API whether **this workflow** already has a run for the same `head_sha`,
and may skip the heavy jobs **only** on a positive, complete match. ⭐ **A FOURTH condition was added
2026-08-11 — the run must be a `push` run** (`openspec/changes/platform-reuse-guard-push-only/`); see
the qualification section below for why it is not optional:

1. **The run is for the same `head_sha`**, and is not this run (a run can never verify itself — on a
   re-run it would otherwise find its own record and skip the work it was re-run to do).
2. **`status: completed` AND `conclusion: success`.** A **cancelled** or in-progress run is **not a
   result**: `concurrency` cancels PR runs and a burst can supersede a queued one, so the conclusion
   is read explicitly rather than inferred from a run merely existing.
3. 🔴 **The prior run must have actually EXECUTED what this run would need.** `e2e` is gated on
   `needsE2e` ([[P-029]]), so **a `dev` run can be green having SKIPPED it** — a docs-only push
   produces exactly that. And **the merge run is the completeness backstop** that would otherwise
   catch the day's render changes. So: skip only when the prior run's **`ci` AND `e2e` both RAN and
   succeeded**; if either was **skipped** there, do **not** skip here. **Fail toward running.**
4. ⭐ **`event === 'push'`.** Only a `push` run tests the tree of that exact commit; a
   `pull_request` run tests the merge ref. POSITIVE check — a missing, empty, or unrecognised
   `event` is an uncertainty, never a permission.

**Every uncertainty runs everything.** An API error, a missing permission, unreadable jobs, an
ambiguous or empty result, a job renamed in the workflow without mirroring it in the guard — all
resolve to `reuse=false`. The guard may only ever skip on a **positive, complete match**, never on
the absence of a negative.

**Scope: `push` to `main` only.** Not `dev`, not `pull_request`. Every `dev` push has its own SHA so
it would never match anyway, but restricting it **states the intent** and keeps re-run requests
predictable.

### 🔴 WHY reusing a green SHA is safe at all — classification gates WHETHER; the jobs are WHOLE-TREE

**This is recorded because the alarm it dissolves is a GOOD one, it was raised in review, and the
reasoning that answers it lived nowhere.** The next reader will raise it again — and might "fix" a
guard that is already correct.

**The alarm.** The guard skips the `main` run when the same SHA already has a green run that executed
`ci` and `e2e`. But that run classified only **its own push's diff**, while the merge run's job is the
whole **`main..head` span** — so (the argument goes) an earlier commit in the span could be uncovered,
and the guard would skip the very run that covers it.

**Why it is wrong: neither heavy job is diff-scoped.** Checked in `.github/workflows/pr.yml` rather
than assumed. The steps are bare workspace-wide scripts — no `--filter`, no changed-file input, no
path argument:

| Job                               | Its steps, verbatim                                                               | What they cover                                                     |
| --------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `Lint • Typecheck • Test • Build` | `pnpm format:check` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` | the whole workspace — each is `turbo run <task>` over every package |
| `E2E (Playwright)`                | `pnpm build` · `pnpm test:e2e`                                                    | the **entire** Playwright suite (`turbo run test:e2e`)              |

The changed-path classification ([[P-027]] / [[P-029]]) feeds only the jobs' `if:` conditions —
`needs.changes.outputs.code` and `needs.changes.outputs.needs_e2e`. It never reaches a step.

> **Classification gates WHETHER the jobs run; the jobs themselves are whole-tree.**

So a green run in which both **EXECUTED** verifies the whole **TREE** at that SHA — and that tree
contains the code of every earlier commit in the span. Reusing it does not narrow coverage; it
declines to compute the same whole-tree answer twice.

#### The corollary — the match condition is exactly right, not accidentally right

🔴 Whole-tree coverage is a property of jobs that **RAN**. That is the entire reason constraint 3
above is not belt-and-braces: **skipping is safe ONLY because the guard requires the prior run to have
EXECUTED both jobs.** A run that was green having **SKIPPED** `e2e` proves nothing whatsoever about
the tree's render behaviour — which is precisely why that case must not be reused.

⚠ **The condition is LOAD-BEARING. Do not let a later reader relax it to "a green run exists for this
SHA".** That reads as a harmless simplification of a fiddly rule, and it silently deletes the
completeness backstop.

✅ **"Same SHA ⇒ same tree" is no longer an assumption — candidates are `push` runs ONLY**
(`openspec/changes/platform-reuse-guard-push-only/`, 2026-08-11). A **`push`** run tests the tree of
that exact commit, so the whole-tree argument above applies to it directly. A **`pull_request`** run
does not: it checks out the **merge ref** (`refs/pull/N/merge`), so `head_sha` names the commit while
the tree tested is `merge(head, base)` — the same tree only while base is already an ancestor of head.
`decideReuse` now requires `event === 'push'` as a fourth match condition, which **ELIMINATES** the
base-dependency rather than documenting it. The check is POSITIVE (only the exact string `push`
qualifies; a missing, empty, or unrecognised `event` is an uncertainty and runs everything), it lives
in the **pure function** so it is unit-tested, and `pr.yml`'s API query additionally passes
`event=push` as defence in depth — the query is not the guard.

**This mattered in practice, in both directions.** The first live reuse consumed a **`pull_request`**
run (`31469356886`); it was correct only because the ancestry invariant happened to hold that day
(`caf94f0`, the previous `main` tip, is an ancestor of `a9ecfaa`). And the divergent state is real:
PR #439 was squash-merged on GitHub, `main` diverged from `dev`, and PR #440 sat open with a conflict.
Cost of the restriction is zero in the current model — there are no PRs; `dev` is pushed directly and
the owner merges by hand — so every candidate the guard should ever see is already a `push` run.

**SUPERSEDED text:** this paragraph previously read _"the guard does not filter candidates by
`event` … if that invariant ever stops holding … this is the assumption to re-check"_. It is not an
assumption any more, and there is nothing left to re-check.

### Acceptance

- WHEN a `--ff-only` merge pushes to `main` a SHA whose `dev`-tip run **executed both** `ci` and
  `e2e` green THEN the merge run **skips both heavy jobs** and `required` passes.
- WHEN the prior run for that SHA was green but **SKIPPED `e2e`** THEN the merge run **does not
  skip** — it runs the full gate, because it is that commit's backstop.
- WHEN the API errors, the permission is missing, or the result is ambiguous or empty THEN
  **everything runs**.
- WHEN the guard skips THEN the run **says why, with the prior run's URL**, in **both** its log and
  its **job summary**. 🔴 A requirement, not a nicety: **a merge run that is green because it did
  nothing must never be indistinguishable from one that is green because it passed.**
- The guard reuses the existing notion of a DELIBERATE skip in the `required` job (built for
  [[P-029]]'s `needs_e2e`) rather than inventing a second "not run but fine" — extended, not
  duplicated.
- `actions: read` is added to the permissions block, which previously granted only `contents` and
  `pull-requests`.

### How it is verified

The decision is a **pure module** (`tools/gate-hook/src/reuse-decision.mjs`), unit-tested against
**REAL Actions API responses captured from this repository's own runs** — not invented shapes:

- **both ran** — `c16d25f`, run `31408479929`: `ci` and `e2e` both executed, both green ⇒ **reuse**.
- **e2e skipped** — `7237b70`, run `31411394748`: green, both heavy jobs `skipped` ([[P-029]]
  classified the diff as unable to affect rendering) ⇒ **do NOT reuse**. This is the backstop case,
  and it needed no construction: an ordinary docs-only push produces it.
- **e2e failed** — `ab7d12e`, run `31406199136`: `ci` green, `e2e` `failure` ⇒ **do NOT reuse**.

⭐ **The `event` condition is tested off the SAME real fixture, changing only the event**, so nothing
but the event can explain the different verdict: `both-ran` re-labelled `pull_request` ⇒ **do NOT
reuse**, with a reason naming the non-push rejection and the counts; `event` absent / empty /
`merge_group` / `PUSH` ⇒ **do NOT reuse** (each of those would be an automatic pass under a
`!== 'pull_request'` phrasing, which is why the check is positive); and a mixed list with a
`pull_request` run FIRST still reuses the `push` run behind it, proving the event check filters the
candidate set rather than aborting on it. All six were confirmed RED against the pre-fix
implementation before the fix was restored.

Plus a test that reads `pr.yml` itself and asserts the job names the guard matches on still exist
there, so a rename fails loudly instead of silently turning the guard into a permanent
"run everything".

### ✅ DISCHARGED — the live end-to-end run on `main`, observed 2026-08-11

**Both directions were verified against real API data, but NEITHER had been observed on a real `push`
to `main`, and CC could not produce one** — CLAUDE.md is explicit that **CC never commits to, or
merges into, `main`**, and the guard fires on no other event by design (constraint 1). The owner's
merge on **2026-08-11** supplied the live firing, and it behaved exactly as specified.

**The merge run — https://github.com/yasermostafaee/cg/actions/runs/31470347819** (`push` to `main`,
`a9ecfaa`, `conclusion: success`). From its log:

```
classification: kind=code needsE2e=true files=31 => code=true
P-030: reuse=true — prior run 31469356886 is completed+successful and RAN both Lint • Typecheck • Test • Build and E2E (Playwright)
code=true | needs_e2e=true | reuse=true | ci=skipped | e2e=skipped | docs-check=success
Already verified by a completed, successful run of this workflow for this SHA
```

**Every clause of the acceptance is visible in that one run**, and the first line is the important
one: the merge run classified the **WHOLE span** — 31 files ⇒ `kind=code needsE2e=true` — so this was
**not** a docs-only or not-owed skip. It was a span that genuinely owed both jobs, and the guard
skipped them **only** because a prior run had actually RUN both. `required` then passed **citing the
prior run's URL**, so "green because it did nothing" stays distinguishable from "green because it
passed". The `gh api` invocation and the `actions: read` grant are now exercised on a runner.

**The prior run reused — https://github.com/yasermostafaee/cg/actions/runs/31469356886** (`a9ecfaa`,
`success`; `Lint • Typecheck • Test • Build = success`, `E2E (Playwright) = success`).

🔴 **This run is also the concrete instance of the section above.** The reused run's own push
classified a different, smaller diff than the merge run's 31-file span — the exact shape the alarm
warns about — and the outcome is correct anyway, because both jobs are whole-tree. The theory and its
first live case are the same story.

⚠ **Also discharged by it: [[B-132]]'s open code debt.** `d32fa13`'s files
(`.github/workflows/pr.yml`, `tools/gate-hook/src/reuse-decision.mjs`, its fixtures/tests/types,
`openspec/specs/platform-ci/spec.md`) are all inside that 31-file span, and run `31469356886` ran both
heavy jobs green on a tree containing them. **This item's own commit is now CI-verified.**

⚠ **AND THIS ITEM'S OWN COMMIT HAS NO CI RUN — see [[B-132]].** The push of `d32fa13`, which carries
this guard, produced **no GitHub Actions run at all** (no run object, no check suite; the workflow
validates clean and Actions reports operational), and the NEXT push's run **skipped both heavy jobs**
because [[P-027]] classifies each push against the previous tip and that one was docs-only. So this
guard landed on a full green LOCAL gate with **no CI verification of its own.**

✅ **RESOLVED 2026-08-11 — and how it resolved is the point.** Run `31469356886` ran both heavy jobs
green on `a9ecfaa`, a tree that contains `d32fa13`'s files, so the code is verified; the `main` merge
run then classified the whole 31-file span and reused it. Note that the earlier claim here — that _"no
later `dev` push will supply one"_ — was **too strong**, and it is the same error [[B-132]] has now
been re-scored for: no later push gives that commit **its own** run, but any later run that EXECUTES
the heavy jobs verifies the **tree** containing it. What a dropped event costs is the per-commit
signal, not the eventual verification.

---

## [~] P-031 — the schema-migration registry is DEAD CODE that advertises itself as the migration path ⟨priority: medium⟩ — DECIDED (owner, 2026-08-11) and implemented: **DELETE**, and with it every other legacy compatibility path, under the compatibility-floor policy recorded below. `openspec/changes/schema-compatibility-floor/`

**What:** `packages/shared-schema/src/migrations/index.ts` exports a `SchemaMigration` registry and a
`migrate()` walker that **nothing in production calls**. Either wire it to a real load path or delete
it — but it must stop presenting itself as the place a schema conversion goes, because a migration
registered there is a conversion that never runs.

**Why:** The trap is not the dead code; it is the **docstring**, which tells the next author exactly
the wrong thing:

> _"The loader in `@cg/vcg-format` walks the registry from the loaded version to current."_

It does not. **Measured 2026-08-11** (`git grep`, whole repo):

| Claim                                                      | Reality                                                                                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cg/vcg-format` walks the registry                        | `packages/vcg-format/` contains **no reference to `migrations` at all** — not an import, not a call                                                                                    |
| something outside `@cg/shared-schema` imports `migrations` | **nothing does.** The only importers are `packages/shared-schema/tests/migrations.test.ts` and `tests/zones.test.ts` — its own tests                                                   |
| `schemaVersion` is read to select a migration              | it is **WRITTEN** by `apps/designer/src/platform/ProjectStore.ts:72` and `packages/vcg-format/src/pack.ts:94`, and read back only as `z.literal(1)` (`scene.ts:339`, `manifest.ts:54`) |

So `schemaVersion` is **ASSERTED, never converted**: a document carrying `schemaVersion: 2` does not
enter a migration, it **fails to parse** — `packages/vcg-format/tests/pack.test.ts:84` pins exactly
that behaviour with a `schemaVersion: 99` fixture that is expected to `reject`. The walker's own
`while (version < CURRENT_SCHEMA_VERSION)` loop can therefore never execute a step: the only version
the schema admits IS the current one.

**The two live consequences** — this is why the item exists rather than being a tidy-up:

1. 🔴 **Any migration registered there is a conversion that never runs — and it LOOKS like the fix.**
   The author writes an `up()`, ticks the task, and ships a silent no-op. Old documents then break
   quietly at parse time, at the exact moment the registry was supposed to save them. Two changes have
   now had to stop and re-derive this fact under time pressure ([[B-129]], and the project-package
   work that closes [[B-104]]).
2. **The codebase's WORKING precedent is parse-time normalization, and it is unwritten anywhere the
   registry's reader would see it.** `PlayoutSchema`'s legacy `mode` key and [[B-129]]'s
   `background` → `editorBackdrop` both normalize in a `z.preprocess` on the schema itself. That runs
   on **every** load path for free, because every load path parses — which is precisely the property
   the registry claims and does not have.

**Acceptance:**

- WHEN a developer opens `packages/shared-schema/src/migrations/index.ts` THEN its docstring states
  what is TRUE of the registry today — no claim that any loader walks it — and points at parse-time
  normalization (`z.preprocess`, per `PlayoutSchema`) as the mechanism that actually runs.
- WHEN the decision is DELETE THEN `migrations/index.ts`, its export from `src/index.ts`, and
  `tests/migrations.test.ts` are removed together, and `zones.test.ts`'s "registry is still empty"
  assertion is removed or re-pointed, so no dangling reference survives.
- WHEN the decision is WIRE IT UP THEN a real load path (`unpack`, `ProjectStore.load`) calls
  `migrate()` BEFORE parsing, `SceneSchema.schemaVersion` stops being a `z.literal` that rejects every
  older version, and a test proves a `schemaVersion: N-1` document loads through a registered step.
- WHEN either decision lands THEN a test fails if a future `SchemaMigration` is registered without the
  chosen mechanism being in force — the registry may never again be a plausible-looking dead end.

**Notes:** The lying docstring was corrected in the same commit that filed this item (2026-08-11) —
that part is a one-line removal of a trap, not the fix. The fix is the decision above, and it is
deliberately NOT made here: it is a real fork (delete vs. wire) that wants the owner's call on whether
this product ever ships a schema-version bump. Related: [[B-129]] recorded the measurement first, on
its `editorBackdrop` preprocess (`packages/shared-schema/src/scene.ts:163`).

---

### ⭐ THE OWNER'S DECISION (2026-08-11) — DELETE, and the COMPATIBILITY FLOOR that governs it

**The fork above is answered: DELETE.** The registry is gone
(`packages/shared-schema/src/migrations/` and its `export * as migrations`), and
`SceneSchema.schemaVersion` stays `z.literal(1)` — which is now the WHOLE mechanism, not a
leftover beside one. A document from any other schema version fails to parse, loudly, at the
door. That is the intended behaviour and it must not be softened.

**The decision is bigger than the registry, because the context is:** _the product has not
been delivered to a client yet, and no project file in the world has to keep opening._ Every
backward-compatibility path is therefore DEBT that READS AS SAFETY — code the next author
must reason about, and a second document shape every downstream consumer branches on, bought
for nobody. This is the cheapest moment it will ever be to shed it, so it was shed.

**Removed in the same change (each one a legacy shim, and nothing else):**

| Removed                                                                                    | It existed to…                                                                | Replaced by                                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/shared-schema/src/migrations/` + its export                                      | walk a registry to convert older documents (it never ran — that is this item) | nothing. `z.literal(1)` is the mechanism                                               |
| `readProjectDocument`'s bare-`.cg.json` arm (`@cg/vcg-format`)                             | open pre-D-150 projects, which were a scene JSON with no assets               | ONE readable throw: _"Pre-package projects (a bare .cg.json) … re-create the project"_ |
| `AssetStore.collectLegacyAssets` + the legacy `adoptDocument` arm                          | scrape whatever asset bytes a converted project still had in the workspace    | nothing — there is no conversion to feed it                                            |
| `ProjectDocumentForm` / `ProjectDocument.form` / nullable `manifest`                       | let callers branch on package-vs-legacy                                       | one form, so no branch and no nullable                                                 |
| `SceneSchema`/`CompositionSchema`'s `background` → `editorBackdrop` `z.preprocess` (B-129) | accept the pre-B-129 spelling of the editor backdrop                          | a required-key parse failure naming `editorBackdrop`                                   |
| the forced-Save-As rule for converted projects (`convertedProjects`)                       | stop a converted package overwriting the `.cg.json` it came from              | nothing — see the judgment below                                                       |

**LEFT IN PLACE, deliberately, and why:**

- **The parse-time normalization MECHANISM itself.** `z.preprocess` is how this codebase
  reshapes input at the door, and it is the mechanism this item's own acceptance points at.
  Only the LEGACY USES of it were removed.
- **`PlayoutSchema`'s legacy `mode` key.** It is the same class as the `background` shim and
  the policy below covers it, but it was NOT in the owner's enumerated list and removing it
  is a separate ripple (`docs/prd/designer.md`'s D-020 surface). Flagged here rather than
  taken: **it is the one remaining legacy shim, and it is now the owner's call.**
- **`z.literal(1)` on `schemaVersion`.** Load-bearing, and more so than before: it is the
  only thing left that turns a stale document into a loud failure instead of a silent
  mis-parse.

**The forced-Save-As rule — judged on its own merits, not dropped by association.** D-150
forced a converted project's first Save through the file picker so a `.cgproj` was never
written over the `.cg.json` it came from. Re-judged: the ONLY thing that rule protected
against was opening a document in a format DIFFERENT from the one Save writes. With the
`.cg.json` read path gone, that mismatch is unreachable — every document the app can open is
already the format it saves. Keeping the `Set` would have left a mechanism nothing can ever
add to, which is precisely the dead-code-that-advertises-a-safeguard defect this item exists
to end. So it went, and a real Save As (`askPath`) still forces the picker.

### 🔴 THE POLICY, AND ITS REVERSAL — write this into any argument about compatibility

**Until the first client delivery, NO backward compatibility is owed.** A shim that lets an
older file open is optional, and where it costs a branch, a second document shape or a second
derivation, the default is to DELETE it and fail loudly instead.

**⭐ THE FIRST SHIPPED RELEASE BECOMES THE COMPATIBILITY FLOOR, AND THIS POLICY REVERSES AT
THAT MOMENT.** From the first release a client actually holds, a file that release could open
must keep opening — shims stop being optional, they become a requirement with a test, and
removing one becomes a breaking change that needs its own decision and a migration story.

**Both halves are written down on purpose.** The reversal is the half that will be forgotten:
without it, someone reads "no backward compatibility is owed" a year from now, cites this
item, and deletes a path a real station's files depend on. **Today's decision is scoped to
today's fact — nothing has shipped — and it expires the moment that fact does.** If you are
reading this after a release has gone out, this section is HISTORY, not licence.

## [ ] P-032 — `PlayoutSchema`'s legacy `mode: 'content-driven'` shim is the LAST surviving legacy compatibility path ⟨priority: medium⟩ — the owner's call; **do NOT remove it without one**

**What:** `PlayoutSchema` still carries a `z.preprocess` that rewrites the pre-D-028 spelling
`mode: 'content-driven'` into `{ mode: 'loop-cycle', holdSource: 'content-driven' }`
(`packages/shared-schema/src/scene.ts:77`–`85`). [[P-031]] deleted every other legacy
compatibility path in the codebase under the compatibility-floor policy recorded above; this one
was left in place because it was NOT in the owner's enumerated list and because removing it ripples
into the D-020 playout surface. **It is the same class as everything P-031 removed**, so it is
filed here rather than left as a bullet inside a decision section, where the next reader will not
find it.

**Why:** it is a second document shape that every consumer of `Playout` must tolerate, bought for
no file that exists — the exact debt-that-reads-as-safety P-031 was about. Two facts sharpen it:

1. 🔴 **The shim has TWO independent copies, not one.** Besides the `z.preprocess` at
   `scene.ts:77`, `playoutOf()` re-derives the same normalization by hand at `scene.ts:436`–`443`
   ("defensively normalizes the legacy `mode: 'content-driven'` for scene objects handed straight
   to `createRuntime` without re-parsing"). That is the second-local-copy pattern golden rule 6
   names: one legacy spelling, two places that must agree about it forever. Deleting the shim means
   deleting BOTH, and any half-removal leaves a path that silently accepts what the other rejects.
2. **The schema's own docstring is now stale.** `scene.ts:74`–`75` says "A registry migration is
   deferred until a schema-version bump is unavoidable" — pointing at the migration registry that
   P-031 **deleted**. The comment defers to a mechanism that no longer exists, which is precisely
   the lying-docstring defect P-031 exists to end, surviving one file over.

**Acceptance** (whichever way the owner decides):

- WHEN the owner decides REMOVE THEN both the `z.preprocess` at `scene.ts:77` and the hand-rolled
  arm in `playoutOf()` at `scene.ts:441` go together, a document carrying `mode: 'content-driven'`
  fails to parse LOUDLY naming the field, and `packages/shared-schema/tests/scene.test.ts:297`
  (which pins the normalization today) is replaced by a test pinning the refusal
- WHEN the owner decides KEEP THEN `scene.ts:74`–`75`'s docstring stops citing the deleted
  migration registry and states what is actually true — that parse-time normalization IS the
  mechanism — and a test asserts the two copies agree, so they cannot drift apart
- WHEN either decision lands THEN `apps/designer/tests/e2e/fixtures/designer.ts:828`, which still
  types `'content-driven'` as an authorable `mode`, is updated to match

**Notes:** **NOT removed by this filing, deliberately.** P-031 recorded it as "the one remaining
legacy shim, and it is now the owner's call", and this item does not take that call — it only gives
it a number so it stops living inside another item's decision section. The compatibility-floor
policy above governs it: while nothing has shipped, removal is cheap and the default; from the
first client delivery it becomes a breaking change with its own migration story. **The cost of
deferring is that the window closes**, which is the whole argument for deciding now rather than
later. Related: [[P-031]] (the policy and the enumerated removals).

## [ ] P-033 — `typecheck` covers `src/**` only, so 557 test files are OUTSIDE the compile guarantee ⟨priority: medium⟩

**What:** no workspace typechecks its tests. Every app's `tsconfig.json` includes `src/**/*` only,
and every package's explicitly EXCLUDES its tests. So a test can call a function with the wrong
arguments and nothing objects until it happens to throw at runtime — or never, if the wrong argument
is only dereferenced on some paths.

**Why this is worth a number rather than a shrug:** it **narrows a guarantee this repo has just
relied on**. [[B-139]]'s fix was chosen precisely because a **required parameter is a type error** —
an API that cannot be called wrong, rather than a corrected call site one edit away from regressing.
That argument is sound for `src`, and **not true of tests**. When B-139 made `isItemDirty`'s plate
baseline required, three test call sites kept passing two arguments:

- they did not fail `typecheck`, because tests are not in it;
- they did not fail at runtime either, because `appliedPlates` is only dereferenced when the item has
  staged plates and those cases stage fields only.

They were fixed by hand, having been found by reading. **The next one will not be**, and the reasoning
that justified the API shape will still be quoted in the docstring. That is the exact shape of _a
warning that outlives its truth_.

**Measured, at `1577c4b9`:**

| scope                 | `tsconfig` says                                                           | tests typechecked?        |
| --------------------- | ------------------------------------------------------------------------- | ------------------------- |
| `apps/runtime`        | `include: ["src/**/*", "vite.config.ts"]`                                 | **no**                    |
| `apps/designer`       | `include: ["src/**/*", "vite.config.ts"]`                                 | **no**                    |
| `packages/*`          | e.g. `include: ["src/**/*"], exclude: ["src/**/*.test.ts", "tests/**/*"]` | **no** — excluded by name |
| `tools/caspar-bridge` | same exclusion                                                            | **no**                    |

**557 test/spec files** are outside it: 113 in `apps/runtime`, 203 in `apps/designer`, 241 across
`packages/` and `tools/`. ⚠ **The Designer does NOT differ** — it was checked specifically, and its
only extra exclusion is `src/generated`, unrelated.

**Acceptance:**

- WHEN a test calls a typed function with arguments its signature forbids THEN the gate fails, rather
  than the mistake surviving to a runtime that may never exercise it
- WHEN the coverage is deliberately left as it is THEN the claims that depend on it say so, so that
  "a required parameter is a compile error" is not quoted more widely than it is true

**Notes:**

- **Nothing is changed by this filing** — no `tsconfig` is touched. The item records the gap and asks
  the question.
- 🔴 **Owner question, with the cost of each:**
  1. **Extend coverage to tests.** Honest, and it makes the B-139 argument true everywhere. Costs:
     typecheck time across 557 more files on every gate run; and an unknown number of EXISTING type
     errors in tests would surface at once — tests legitimately use loose stubs and `as never` casts,
     so this is very unlikely to be a clean flip. It would want its own change and probably a
     per-workspace rollout rather than a big-bang.
  2. **Narrow the claims instead.** Cheaper and immediately honest: where a docstring justifies an API
     shape by "this is a compile error", say _in `src`_. Costs: the guarantee stays half-true, and the
     next person to rely on it has to read the caveat.
  3. **A middle path** — typecheck tests in the workspaces where the argument is actually load-bearing
     (`apps/runtime` first, since B-139 lives there), and leave the rest. Costs: the rule then differs
     per workspace, which is its own kind of thing nobody can see from either side.
- **Cross-refs:** [[B-139]] (whose fix rests on the guarantee), [[B-142]] (the same shape one level
  out — a rule the Designer enforces and the Runtime does not).

## [x] P-034 — `pnpm test:e2e` starved its own suites: B-098's concurrency bound was applied to `test` and its sibling `test:e2e` escaped it ⟨priority: high — RE-SCORED 2026-08-18 from `low`⟩ — fixed in `openspec/changes/platform-e2e-fan-out-bound/`

**What:** the root `pnpm test:e2e` was a **bare `turbo run`**, so it started BOTH apps' Playwright
tasks at once and each opened its own default pool — **6 + 6 = 12 Chromium workers on a 12-core
host**, the whole machine claimed by browsers before the two `vite preview` servers, the two node
parents and turbo itself. Timing-sensitive tests then missed their deadlines and failed.

```
"test":     "node tools/gate-hook/src/bounded-turbo-cli.mjs run test --continue=…"
"test:e2e": "turbo run test:e2e --continue=…"          ← a BARE turbo run
```

🔴 **One rule, two spellings** — this repo's most frequent failure shape, on the one gate script
B-098's bound was never applied to. `CLAUDE.md` states the rule and names three scripts (`gate`,
`test`, `test:integration`); `test:e2e` was not one of them.

**Fix:** `test:e2e` and `gate:e2e:run` route through `bounded-turbo-cli.mjs` like their siblings,
and the pure bound gained its Playwright half (`resolveE2eWorkers`) **in the same module** as the
vitest half. See the change for the full shape.

**Proof, before → after, same host, same command, rebuilt between runs:**

|          | before                     | after          |
| -------- | -------------------------- | -------------- |
| workers  | 6 + 6 = **12** on 12 cores | **2 + 2 = 4**  |
| designer | **264 passed, 4 failed**   | **268 passed** |
| runtime  | **80 passed, 1 failed**    | **81 passed**  |

🔴 **What made starvation the hypothesis, and it is the durable lesson here: ALL of the failures,
across every occurrence, are TIMING assertions — not one is a logic assertion.** A clock that has
not rendered, a crawl whose transform has not started, an opacity transition that has not finished,
a page that never reached `toBeVisible`. And **the set of victims MOVES between runs** — the four
named below are not the five that failed on the fix's base commit; one spec overlaps. A brittle test
fails repeatably; a starved host fails whoever was unlucky. **The suite was never flaky about WHAT
it checks, only about WHEN.**

⚠ **The three occurrences below are kept as the evidence trail**, in the order they were found,
including the CI half that was written and then withdrawn. They are not tidied into hindsight: the
first two are still unexplained, and the record says so.

**Original filing (2026-08-17), kept verbatim:** on 2026-08-17 the Designer Playwright suite failed
one test out of 268, in the middle of three consecutive runs that otherwise passed, with **zero
Designer source changed** in the session. It did not reproduce.

**Repro:** none. That is the point of the item.

**Expected:** 268 passed.
**Actual:** run 1 — 268 passed. Run 2 — **267 passed, 1 failed**. Run 3 (isolated re-run of the
Designer suite alone) — 268 passed.

**Env:** Windows, local `pnpm gate:e2e` and `pnpm --filter @cg/designer test:e2e`, 2026-08-17, on a
machine that had just run a full `pnpm gate` and the Runtime E2E suite back to back — i.e. **under
load**. Session A's changes were confined to `apps/runtime` and `docs/`; the Designer's source was
untouched, which is why the failure is not attributed to them.

**Why file something that is not actionable:** because **one unreproducible flake is not actionable
and a second one is** — and without a written first, nobody can tell that the next failure is a
pattern. A suite that fails occasionally and is always re-run quietly stops meaning anything, and
the day it fails for a real reason it gets re-run too. The record is the instrument that makes the
second occurrence legible.

**What was captured, and what was NOT:**

- **Captured:** the assertion form — `expect(locator).not.toHaveText(expected) failed` — the counts,
  the date, and the load conditions.
- 🔴 **NOT captured: the spec file and test name.** The console filter used at the time dropped the
  failing test's title, and the run is gone. **Naming a specific test here would be a guess**, and a
  flake record naming the wrong test is worse than none — it sends the next reader to the wrong
  place and makes a real pattern invisible.
- **Narrowed, without asserting:** exactly TWO Designer E2E assertions use that form.
  `tests/e2e/clock.spec.ts:35` — `await expect(time).not.toHaveText(before, { timeout: 3000 }); // ticked within ~1.5s`
  — is **time-dependent with a 3 s budget**, which is the shape that fails under load; and
  `tests/e2e/fit-on-open.spec.ts:26` — `await expect(readout).not.toHaveText('100%')` — is
  deterministic. The first is the plausible candidate on its shape alone. **It is recorded as a
  candidate, not as the cause.**

**Acceptance:**

- WHEN a Designer E2E fails again with `not.toHaveText` THEN this item is the prior occurrence to
  attach it to, and the pair is a pattern rather than two separate shrugs
- WHEN a second occurrence IS recorded THEN the failing test is captured by NAME, with the run's
  output retained, so the third conversation is about a fix and not about what failed

## 🔴 SECOND OCCURRENCE — 2026-08-17, on CI, and this one IS named

The item's own purpose, discharged: a second Designer E2E flake, captured with the detail the first
one lacked.

|           | first (2026-08-17, local Windows)          | **second (2026-08-17, CI Linux)**                                                                                                             |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| run       | `pnpm gate:e2e`, no URL                    | <https://github.com/yasermostafaee/cg/actions/runs/32054398518>                                                                               |
| commit    | —                                          | `56c0799f`                                                                                                                                    |
| counts    | 268 → 267/1 fail → 268                     | 268 run, **267 passed, 1 flaky**                                                                                                              |
| test      | **not captured**                           | `apps/designer/tests/e2e/video-import.spec.ts:291` — _"a premultiplied-alpha source imports WITHOUT the black fringe (D-128 un-premultiply)"_ |
| assertion | `expect(locator).not.toHaveText(expected)` | a PIXEL assertion, ~`:368-371` (`expect(px.right[0]).toBeGreaterThan(200)` and neighbours)                                                    |
| outcome   | failed, not retried                        | failed then **passed on retry** — which is why the job is green                                                                               |

🔴 **They are NOT the same failure, and that is the finding.** Different spec, different assertion
kind — one a text-timing assertion, one a pixel comparison. So this is **not** a recurrence of the
first; it is a second, independent Designer E2E flake within a day. **Two unrelated flakes is a
different and worse signal than one repeated flake**: it points at the SUITE's environment
(single-worker CI under load, video decode timing) rather than at one brittle assertion.

⚠ **The job was GREEN.** Playwright retries in CI and a flaky pass counts as success, so this would
have gone unnoticed had the discharge not read the log rather than the conclusion. **A green
`conclusion` does not mean every test passed first time** — worth knowing for every future
discharge, and the reason the e2e discharge lines now record the flaky count.

**Still not actionable on its own**, and deliberately not acted on: the retry passed, and widening a
timeout or loosening a pixel threshold on this evidence is the longer-rope failure below.

**Notes:**

- **Do not "fix" `clock.spec.ts` or `video-import.spec.ts` on the strength of this item.** Widening a
  timeout or loosening a pixel threshold on an unconfirmed candidate is how a real defect gets a
  longer rope — the pattern this repo already names in the gate's own bound (a contention red
  answered by a longer timeout is `B-073`, and `B-098` is that bound blown in turn).
- **A third occurrence should be treated as a pattern about the suite**, not about whichever test it
  lands on: two independent specs in one day is already that shape.
- **If it recurs:** capture the full Playwright output including the test title and any trace, and
  note whether the machine was under concurrent load. Both runs that showed it were preceded by other
  suites on the same host.
- **Cross-refs:** `B-098` / `B-073` (the load-contention flake class and why a longer timeout is the
  wrong answer).

## 🔴🔴 THIRD OCCURRENCE — 2026-08-18 — AND IT IS REPRODUCIBLE, WITH A MECHANISM

⚠ **Read this before treating P-034 as a note.** The item's own escalation rule ("a third occurrence
should be treated as a pattern about the SUITE, not about whichever test it lands on") is now met —
and this occurrence goes further than a pattern, because it **reproduces on demand** and points at a
concrete cause.

⚠ **SCOPE, corrected the same day: this is a LOCAL-ONLY finding.** It was first written as also
explaining the CI flakes; that half is withdrawn and the retraction is at the end of this section.
Read it before citing this occurrence for anything about CI.

**What happened.** Running `pnpm test:e2e` (the root, turbo) on the session-D tip:

| run | invocation                                  | Designer           | Runtime           |
| --- | ------------------------------------------- | ------------------ | ----------------- |
| 1   | `pnpm test:e2e` (both suites, concurrent)   | **265 / 3 failed** | 81 passed         |
| 2   | `pnpm --filter @cg/designer test:e2e` alone | **268 passed**     | —                 |
| 3   | `pnpm test:e2e` again (both, concurrent)    | **265 / 3 failed** | **80 / 1 failed** |
| 4   | `pnpm --filter @cg/runtime test:e2e` alone  | —                  | **81 passed**     |

**Reproducible in the concurrent shape, clean in isolation, twice each.** That is the first time this
flake family has had a handle on it at all.

**The four failing tests, all named this time** (the acceptance criterion the first occurrence could
not meet):

| spec                                               | test                                                                            | assertion                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `designer .../clock.spec.ts:14`                    | author a wall clock → canvas shows Persian-digit time → it ticks in the preview | `toHaveText(/[۰-۹]{2}:…/)` — **element(s) not found** within 7 s  |
| `designer .../content-start-hold-entry.spec.ts:53` | timed / auto-out hold: the subtitle crawls from the entrance settle             | `expect.poll(style).toContain('translateX')` — **1500 ms budget** |
| `designer .../content-start-hold-entry.spec.ts:63` | content-driven hold: the subtitle still crawls from the entrance settle         | same helper, same 1500 ms budget                                  |
| `runtime  .../splash.spec.ts:102`                  | the phase label LEAVES on boot-done                                             | `toHaveCSS('opacity','0')` — got `"1"`, 17 polls over 7 s         |

🔴 **Every one is "did this ANIMATE within N milliseconds".** Not one is a logic assertion. A clock
that has not rendered, a crawl that has not started its transform, an opacity transition that has not
finished — these are exactly the assertions that fail when the box cannot schedule frames, and they
are the same shape as the first occurrence's `clock.spec.ts` candidate. **The suite is not flaky
about WHAT it checks; it is flaky about WHEN.**

## 🔴 THE MECHANISM — `test:e2e` is the ONE gate script B-098's bound was never applied to

```
"test":     "node tools/gate-hook/src/bounded-turbo-cli.mjs run test --continue=…"
"test:e2e": "turbo run test:e2e --continue=…"          ← a BARE turbo run
```

`CLAUDE.md` states the rule and names three scripts — `gate`, `test`, `test:integration` — routed
through `bounded-turbo-cli.mjs` so that `taskConcurrency × workersPerTask` stays ≤ cores. **`test:e2e`
is not one of them.** So `pnpm test:e2e` runs BOTH apps' Playwright tasks concurrently, each spawning
its own worker pool: **6 + 6 = 12 Chromium workers on an 8-core host.** That is precisely the
compounding-multiplier shape B-098 exists to prevent, on the one script it does not cover.

**Candidate remedy, since TAKEN (owner decision, 2026-08-18):** route `test:e2e` through
`bounded-turbo-cli.mjs` like its siblings, and set Playwright's `workers` from the bound. It was
left to the owner rather than applied by the session that found it — shared config every session
picks up, and this item's own rule is that a flake is not answered by whoever happens to be looking
at it. See the closing section for what shipped.

⚠ **One correction to this occurrence's own record: the Env line below says 8 cores. The host is
12** (`os.availableParallelism()` and `os.cpus().length` agree). The `6 + 6` figure is right —
Playwright resolves `workers` to 50% of logical CPUs — but it is 12 workers on 12 cores, i.e. 100%
of the machine with ZERO headroom, against the bound's 75% budget. That makes it a worse instance of
B-098's headroom bug than the item claimed, not a milder one.

🔴 **What must NOT be done, restated because this is exactly the moment it gets done:** no timeout is
to be widened, no pixel threshold loosened, no retry added, and none of the four named tests is to be
"fixed". Every one of them passes reliably when the host can schedule frames. Answering a contention
red with a longer rope is `B-073`, and `B-098` is that bound blown in turn — the item already says
so, and now the evidence says the same thing about this suite.

⚠ **What this changes about the earlier entries: NOTHING, and the first draft of this line said
otherwise.** It read that the three occurrences were "now plausibly ONE finding rather than three
shrugs", on the strength of a CI claim that measurement has since withdrawn — see the correction
below. The two earlier occurrences stand exactly as they were recorded, unexplained, and this local
finding does not reach them.

**Env:** Windows 11, 8 cores, session D tip, after a full `pnpm gate`. Full console output retained
for this session only; the four test titles and assertion forms above are the durable part.

## 🔴 CORRECTION — THE CI HALF OF THAT CLAIM IS WITHDRAWN (same day, 2026-08-18)

**What this section said when it was written**, and it was wrong: that
`.github/workflows/pr.yml`'s `e2e` job runs `pnpm test:e2e` on a single `ubuntu-latest` runner with
the same unbounded fan-out, and that the two earlier occurrences — one local, one on CI — were
therefore "consistent with a single cause rather than with two unrelated brittle tests".

**The measurement that withdraws it:** run
<https://github.com/yasermostafaee/cg/actions/runs/32126244485> (commit `63d42eae`), whose `e2e` job
ran and was green. Its log reads:

```
10:24:09  Running 81 tests using 1 worker      → 81 passed (2.0m)     [runtime]
10:28:31  Running 268 tests using 1 worker     → 268 passed (6.3m)    [designer]
```

**CI runs ONE worker per suite, and the two suites did not overlap** — the runtime suite finished
around 10:26 and the designer suite started at 10:28:31. Whatever `pnpm test:e2e`'s fan-out does on
an 8-core Windows box, it is not what CI does. The inference from the local finding to the CI
occurrences had no evidence under it and is retracted.

🔴 **THE CONSEQUENCE, STATED PLAINLY SO THE RECORD IS HONEST RATHER THAN EMPTY.** The SECOND
occurrence's flake — `video-import.spec.ts:291`, one flaky in run
<https://github.com/yasermostafaee/cg/actions/runs/32054398518> on commit `56c0799f` — had been
explained by this section as the same cause. **That explanation is withdrawn, so that flake is
UNEXPLAINED AGAIN**, and it needs somewhere for the next occurrence to land. It is recorded here as
open, with its run URL, deliberately: this repo's rule about a warning that outlives its truth runs
the other way too — an EXPLANATION that outlives its truth must leave the record honest, not tidy.
Deleting the wrong sentence would have quietly re-labelled a known-unexplained flake as one nobody
had ever looked at.

**What SURVIVES the correction, unchanged:** the local finding above. It reproduces on demand, it is
four named tests, and every one of them is an animate-within-N-milliseconds assertion. It is a
**LOCAL-ONLY** finding about `pnpm test:e2e` on this host, and it is stated as one from here on.

**What is now OPEN, and was not before:**

- the second occurrence (`video-import.spec.ts:291`, run 32054398518) — cause unknown, one green
  retry, no pattern it belongs to;
- whether the local concurrency finding and the CI flakes share anything at all — **no evidence
  either way**, which is a different state from "consistent with a single cause" and must not be
  written back as one.

## ✅ CLOSED — 2026-08-18, the remedy taken and measured

Fixed in `openspec/changes/platform-e2e-fan-out-bound/`. What shipped, and what it is worth:

- `test:e2e` and `gate:e2e:run` route through `bounded-turbo-cli.mjs`. **Every `turbo run` in the
  root `package.json` was swept**, not just the one named: `build`, `lint`, `typecheck`, `test:e2e`,
  `gate:e2e:run`, `package`, `dev`, `clean`. Only the two E2E scripts spawn browser worker pools;
  the rest run one process per task and cannot compound. `gate:e2e:run` already carried
  `--concurrency=1` from B-095 so it was NOT exhibiting the defect — routed anyway, because one
  rule with two spellings is what this item is about.
- The Playwright bound lives in the **same** `test-concurrency.mjs` as the vitest bound, with 82 new
  unit tests. A second module would have been the defect re-created one level out.
- The cap can only ever **tighten**: `workersPerTask` is capped at the number Playwright would have
  chosen unaided, so a serialised `gate:e2e` is not handed the whole budget and made WIDER. An
  isolated single-suite run is left at the default — it is not contended.

🔴 **Nothing was tuned.** No timeout widened, no threshold loosened, no retry added, no test edited.
Every one of the named tests passes under the concurrent run that failed it.

⚠ **STILL OPEN, and deliberately not closed with this item** — the SECOND occurrence
(`video-import.spec.ts:291`, one flaky in run
<https://github.com/yasermostafaee/cg/actions/runs/32054398518>, commit `56c0799f`) had been
explained by the withdrawn CI claim and is therefore **unexplained again**. It is CI, this fix is
local, and no evidence connects them. It is recorded here so the next occurrence has somewhere to
land; a warning that outlives its truth and an EXPLANATION that outlives its truth are the same
rule running in opposite directions, and both must leave the record honest rather than empty.

✅ **Linux CI `e2e` DISCHARGED** — <https://github.com/yasermostafaee/cg/actions/runs/32136025181>,
commit `b658a033`, `conclusion: success`, `e2e` job **RAN**,
**349 run / 349 passed / 0 flaky** (runtime 81, designer 268). The bound printed itself in that log
too, on a **2-core** runner: `1 concurrent task x 1 playwright worker`.

🔴 **And that zero is NOT evidence the fix worked on CI.** The run on the fix's BASE commit
`4e876d7a` (<https://github.com/yasermostafaee/cg/actions/runs/32130531609>) already read
**0 flaky** as well, before any of this landed — because CI never ran the unbounded shape. The
honest reading is "the fix broke nothing on CI", which is what a local-only fix should show.
Reading it as CI evidence would be the SAME inference this item already retracted once, and it is
called out here because that is precisely where someone will reach for it.

## [~] P-035 — a NEVER-STAGE guard, because `git add <directory>` swept the owner's uncommitted hack onto `dev` ⟨priority: high⟩ — implemented: the guard, its list and its tests ship with this item

**What:** a pre-commit guard that **refuses** the commit when a listed path is staged, driven by a
committed list (`.claude/never-stage`) with a documented, loud escape.

**Why:** on 2026-08-17 a `git add tools/caspar-bridge` — staging a DIRECTORY to pick up bridge work —
also staged the owner's uncommitted plant-testing hack. `dev` then briefly carried
`return '192.168.21.93';` at the top of `guessLanHost()`, so **every install would have advertised
one machine's LAN address** instead of its own, and the served template URL would have been wrong
everywhere except that box. It was caught in post-push verification and corrected in `56c0799f`, at
the cost of a second push on a day the owner was near their CI minute limit.

🔴 **The instruction to never stage that file existed, was repeated three times in one brief, and was
followed until it wasn't.** This repo is ONE folder on ONE branch that permanently contains the
owner's uncommitted work, so the hazard is structural rather than occasional: `git add <path>` cannot
distinguish that work from the work being committed, and a directory-level add reaches it silently.
**A rule that depends on remembering is the one that already failed** — hence a guard with an exit
code behind it, which is the same shape as this repo's other enforced rules (the gate lock, the
pre-push decision, the message-region lint).

**Acceptance:**

- WHEN a never-stage path is staged THEN `git commit` is REFUSED, and the message names **which**
  path tripped it, why the list exists, and the exact `git restore --staged` to undo it
- WHEN an unrelated path in the SAME directory is staged THEN the commit proceeds — the guard forbids
  a file, not the directory the accident happened in
- WHEN the escape `CG_ALLOW_NEVER_STAGE=1` is set THEN the commit proceeds AND the guard prints every
  path it let through, so a deliberate override is visible rather than silent
- WHEN the list file is absent or empty THEN nothing is guarded and no commit is blocked
- WHEN a listed file is DELETED in a commit THEN it is not refused, so the eventual cleanup is not
  blocked by the guard protecting it

**Notes:**

- **Shipped with the item:** `.claude/never-stage` (the list, with the reason per entry),
  `tools/gate-hook/src/never-stage-decision.mjs` (the pure decision) and `never-stage-cli.mjs` (the
  CLI), wired into `.husky/pre-commit`, with 10 unit tests in
  `tools/gate-hook/tests/never-stage-decision.test.ts`.
- ⚠ **The guard runs BEFORE `lint-staged`, and the order is not cosmetic.** `lint-staged` runs
  `prettier --write` over staged files. If the guard ran second, a commit about to be refused would
  already have reformatted the owner's uncommitted file on the way there — touching the very file the
  guard exists to leave alone.
- ⚠ **`.gitignore` needed a negation.** `.claude/*` is ignored, so the list would have been
  untracked — **a guard that silently does nothing on every other checkout**, which is the failure
  mode the guard itself exists to prevent. `!.claude/never-stage` joins the two existing exceptions.
- **PROVEN TO FIRE, end to end**, not only in unit tests: a real `git commit` with the hack staged was
  refused (`husky - pre-commit script failed (code 1)`) with the path named; the escape let the same
  staged state through and printed the override; and an ordinary commit in the same session passed
  untouched.
- 🔴 **THIS IS A NET, NOT A CURE.** The cure is the **bridge advertise-host refactor** — the hack
  exists only because `guessLanHost()` cannot be told what to advertise. That hack cost **two
  incidents in one day**: it blocked a push by failing `format:check`, and then it leaked to `dev`.
  ✅ **The refactor is now filed as [[C-024]]** (2026-08-18, owner-supplied number). This guard stops
  the hack reaching `dev`; C-024 removes the need for the hack to exist, and until it lands every
  day is another day of an uncommitted edit in a permanently-dirty checkout — a hazard this guard can
  only ever catch, never remove.
- **Cross-refs:** `P-009` (the Stop-hook gate, the same "enforce rather than remember" shape),
  `P-013` (the host gate lock).

## [~] P-036 — an E2E run against a STALE build makes red-then-green vacuous while looking rigorous ⟨priority: high⟩ — implemented: the guard, wired into both apps, with its proof

**What:** the E2E runner REFUSES to start when the built bundle is older than the newest source file
it covers, naming the stale file.

**Why:** the suites run against the built `dist/` via `vite preview`, never against source.
`turbo.json` already declares `test:e2e` `dependsOn: ['build']`, so the ROOT `pnpm test:e2e`
rebuilds — but **`pnpm --filter <app> test:e2e` runs `playwright test` directly and bypasses turbo
entirely.** Nothing rebuilds, and the suite tests whatever bundle happens to be on disk.

🔴 **That silently invalidates RED-THEN-GREEN**, which is this project's standard proof that a test
guards what it claims to guard — every implementation prompt asks for it by name. Edit the source,
run the suite, revert the fix, run again: **both runs execute the same bundle, agree perfectly, and
prove nothing.** The comparison looks exactly as rigorous as a real one.

**It has already produced a false result.** On 2026-08-17 (session B) a defect was reported in CC's
own B-140 fix — "the teardown runs but the divider still paints as dragging" — recorded as an open
defect in the change, and **escalated to the owner as decision-relevant**. It was retracted only when
it emerged that the second run had executed the first run's bundle. With a rebuild between runs the
picture inverted and was consistent.

**A proof that is vacuous while looking rigorous is worse than no proof**, because nobody goes
looking for the missing one. That is why this outranks a feature.

**Acceptance:**

- WHEN an E2E run starts and any bundled source is newer than the build THEN the run is REFUSED
  before any test executes, and the message names the offending file and how far behind the build is
- WHEN the build is current THEN the run proceeds unchanged, with no false positive
- WHEN there is no build at all THEN the run is refused rather than serving whatever is on disk
- WHEN editing only a SPEC file THEN the run proceeds — a spec is loaded from source by Playwright,
  never bundled, so it cannot make the build stale
- WHEN testing the existing bundle IS the intent THEN `CG_ALLOW_STALE_E2E=1` allows it and says
  loudly that it did
- WHEN either app's suite is run by any entry point THEN the same rule applies — one rule, one
  spelling
- WHEN a WORKSPACE PACKAGE the app bundles has a source newer than the build THEN the run is
  REFUSED naming that file, exactly as for the app's own sources
- WHEN a new workspace dependency is added THEN it is covered without anyone editing the guard —
  the set is resolved from the dependency graph, never from a list

**Notes:**

- **Mechanism chosen: a freshness check inside Playwright's `globalSetup`**, not a turbo dependency.
  🔴 **The turbo dependency already exists and does not close the hole** — the failing path is
  precisely the one that does not go through turbo. A check in the runner catches EVERY entry point
  (turbo, a filtered `pnpm` script, a hand-typed `pnpm exec playwright test`) because they all end in
  the same runner.
- **It refuses rather than rebuilding**, deliberately: a guard that silently rebuilt would hide how
  long the suite really takes and would make "test the bundle I have" impossible. Naming the stale
  file is the point.
- **Shipped:** `tools/gate-hook/src/e2e-staleness.mjs` (the walk, the pure `decideStaleness`, and
  the workspace-graph resolver), `apps/{runtime,designer}/tests/e2e-global-setup.mjs`, both
  `playwright.config.ts` files, and 15 unit tests across
  `tools/gate-hook/tests/e2e-staleness{,-graph}.test.ts`.
- ⚠ **Both apps checked and both had the identical hole** — `"test:e2e": "playwright test"` in each.
  Fixed in the same shape rather than one app at a time.
- 🔴 **PROVEN TO FIRE, with a rebuild between the runs** — the guard must not be validated by the very
  mistake it exists to prevent:
  1. build → run: **3 passed** (no false positive);
  2. touch one source → run: **REFUSED**, _"`ShellDivider.tsx` is 28s NEWER than the newest file in
     `apps/runtime/dist`"_;
  3. rebuild → run: **3 passed** again;
  4. touch again with `CG_ALLOW_STALE_E2E=1` → **ran, printing the override**.
     The Designer was proven the same way (refused at 841m behind, then green after its build).
- ⭐ **WIDENED to the DEPENDENCY GRAPH (owner decision, 2026-08-18).** The first cut compared only
  the app's own `src/**`, `index.html` and `vite.config.ts`, which left the guard blind to every
  workspace package the app bundles: a change in `@cg/gesture` — consumed by both apps' dividers —
  left a stale bundle looking CURRENT. Same false green, one level out, and it would have been found
  the same way: not at all.

  **The costs are asymmetric, and that is the reasoning:** a wrong refusal costs one rebuild; a
  wrong green costs a wrong conclusion, and this project has already paid that once. Every judgement
  in the resolver therefore leans toward refusing.

  🔴 **Resolved from the graph, NOT from a list.** `bundleInputDirs` walks the app's own
  `package.json` and follows every `@cg/*` dependency TRANSITIVELY (both `dependencies` and
  `devDependencies` — deciding per dependency kind which can reach a bundle is a judgement the
  resolver would have to get right every time, while following both is a rule it cannot get wrong).
  A hand-kept list is _extend the list, forget the mutator_: the next package added is exactly the
  one nobody adds to it, and the guard would go quiet where it is newest. A `@cg/*` dependency that
  cannot be LOCATED throws rather than being skipped — an unresolvable package must never be
  indistinguishable from a fresh one.

  ⚠ **Per dependency it takes `src` + `package.json`, NOT `dist` and NOT `tests`.** Both
  exclusions are decisions: a turbo CACHE RESTORE rewrites a package's `dist` mtimes with nothing
  edited, so including it would refuse on ordinary builds — and a guard that refuses routinely is
  one whose override becomes habit; and a package's tests are never bundled, the same reason the
  app's own `tests/` is absent. The one case this does not catch is a package rebuilt without any
  source change, which is not an edit and so is not the red-then-green hazard.

- 🔴 **PROVEN AGAIN, both apps, with a rebuild between the runs** (2026-08-18):
  1. touch `packages/gesture/src/index.ts` → **@cg/designer REFUSED**, naming
     `packages\gesture\src\index.ts` as _"8m NEWER than the newest file in apps\designer\dist"_;
  2. same touch → **@cg/runtime REFUSED**, same file, same shape;
  3. rebuild → **designer 268 passed**, **runtime 81 passed**.
- ⚠ **MEASURED during that proof, and encoded in the refusal message: a FULL turbo cache hit does
  not re-stamp `dist`.** Turbo hashes CONTENT, so a file whose mtime moved without its bytes
  changing produces a 100% cache hit — `pnpm build` reports "21 cached, 21 total", writes nothing,
  and the guard keeps refusing with the remedy it just printed. An ordinary edit does not hit this
  (changed bytes bust the hash and the app rebuilds), but a rebase, a checkout or a `touch` does.
  The message now names `pnpm build --force` for that case. **A guard whose printed remedy does not
  work is a guard whose override becomes the habit**, and then it protects nothing — so this is a
  correctness property of the guard, not a documentation nicety.
- **Cross-refs:** `B-140`'s change (`shared-drag-gesture/tasks.md` §6b) records the false result this
  item prevents; `P-035` (the other guard filed the same day, same "enforce rather than remember"
  shape).
