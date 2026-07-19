# Design — self-enforcing local gate (P-009)

## D1. Where each piece lives, and why

- **`.claude/hooks/gate-stop.mjs`** — the orchestrator. Zero-dependency Node ESM: reads
  the hook JSON from stdin, resolves the repo root FROM ITS OWN FILE URL (not the cwd,
  so a session launched in a subdirectory still gates the repo), shells out to
  git/pnpm, writes logs, decides exit codes. Works identically from PowerShell, Git
  Bash, or WSL because everything is Node — no `jq`, no bash-isms.
- **`tools/gate-hook/src/gate-decision.mjs`** — ALL pure decision logic (path
  normalization, porcelain parsing, docs-only detection, UI/render matching,
  classification → command list, attempt counting). Plain `.mjs` with NO build step,
  imported by the hook via relative path (`../../tools/gate-hook/src/…`) so a fresh
  clone works before any install/build. It lives in a `tools/*` workspace (the
  `pnpm-workspace.yaml` glob for exactly this kind of repo tooling — `soak-runner`
  already hosts the bug-number audit there) so its unit tests run under the ordinary
  `turbo run test` gate. Module + tests sharing one package also keeps turbo caching
  honest WITHOUT touching the frozen root `turbo.json` (no cross-package `inputs`).
- **`.claude/settings.json`** — committed, shared: registers the Stop hook and
  allow-lists the gate commands so a repair run never pauses for approval.

## D2. Schema facts verified against current docs (they correct the initial brief)

Checked via the Claude Code docs before writing config:

1. A command hook takes a SINGLE `"command"` string — there is no exec form with a
   separate `"args"` array. The documented space-safe idiom is quoting the project-dir
   variable inside the string: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/gate-stop.mjs"`.
2. `timeout`: the current docs describe a duration string (`"30m"`), but the INSTALLED
   CLI (2.1.185) silently drops the hook when given one — found by the real-turn test:
   the hook never fired until the value became NUMERIC seconds (`1800`). Numeric it is;
   command hooks default to 10 min, which a `gate` + `gate:e2e` chain can exceed.
3. There is no `statusMessage` field on hook definitions — dropped.
4. `permission_mode` IS delivered in Stop hook input, so plan mode is detectable
   directly. `stop_hook_active` is the documented loop guard.
5. Bash allow rules: `Bash(cmd)` is EXACT; a trailing ` *` (or `:*`) adds a
   word-boundary prefix wildcard. Both exact and wildcard forms are listed for each
   command family (`pnpm test` and `pnpm test *` are different rules).

## D3. The decision order, and the two loop bounds

```
stop_hook_active → 0        (per-CHAIN bound: a hook-driven continuation never re-blocks)
plan mode        → 0
changed set ∅    → 0
docs-only        → openspec validate --all --strict + format:check   (CLAUDE.md carve-out, mirrored)
otherwise        → pnpm gate  [+ pnpm gate:e2e when UI/render paths changed]
green            → 0  (+ win32 non-authoritative note when gate:e2e ran)
red              → attempts ≤ 2: exit 2 (tail + repair rules) · attempts > 2: exit 0 + systemMessage
```

Two DIFFERENT loop bounds, on purpose:

- `stop_hook_active` bounds one stop CHAIN: after the hook blocks once and the session
  repairs and stops again, that stop is a hook-driven continuation and is let through.
  The consequence is explicit: an in-chain repair is re-verified at the NEXT natural
  turn end (or push — husky still runs the fast gate), not recursively inside one turn.
  That is the price of a structural no-infinite-loop guarantee.
- The per-session ATTEMPT counter (a file under `.gate-logs/`, reset on any green run)
  bounds red episodes ACROSS turns: two blocks per episode, then the hook stands down
  with a `systemMessage` asking for human eyes. Never thrash.

## D4. Changed-set semantics

Working tree (`git status --porcelain`, rename → NEW path) ∪ committed branch work
(`git diff --name-only <merge-base(HEAD, origin/main)>..HEAD`). The union matters:
a turn that only COMMITS (clean tree) must still be gated, and a turn with only
uncommitted edits has no branch diff yet. Any git failure (not a repo, no origin/main)
degrades to exit 0 — the hook must never block a session because of its own plumbing.

## D5. The UI/render set (derived from the repo, not guessed)

`apps/*/src/renderer/**` (both SPAs' UI), `packages/template-runtime/**` (how scenes
render/play), `packages/lottie-bridge/**` (the mounted players the preview and exports
render — D-125 made this a render surface), `packages/ui/**` (tokens),
`packages/single-file-export/**` (the exported HTML the E2E exercises), `**/*.css.ts`
(vanilla-extract anywhere), `apps/*/tests/e2e/**` and `apps/*/playwright.config.ts`
(the suites/configs themselves — editing them owes a run). Deliberately NOT included:
`apps/*/src/platform/**` and `packages/shared-schema/**` alone — those are covered by
the fast gate's unit suites; when they change rendering they do so through a renderer/
runtime file that IS in the set. The list lives next to its unit tests
(`UI_RENDER_PATTERNS`), which is where it gets extended.

## D6. Honesty rules

- A green `gate:e2e` on `win32` emits a `systemMessage` stating the run is
  NON-AUTHORITATIVE for pixel geometry (~19px vs Linux) and a Linux/WSL run is still
  owed. The hook enforces effort, not false confidence.
- The repair rules fed to a blocked session forbid the cheating moves outright
  (delete/skip/`.only`/loosen/widen) and name the B-078 port-collision triage so a
  stale-process flake isn't "fixed" in code.

## D7. Escape hatch + blast radius

`{"disableAllHooks": true}` in `.claude/settings.local.json` (personal, gitignored)
turns the whole thing off locally. The hook writes only under `.gate-logs/`
(gitignored). FROZEN surfaces untouched: `.husky/pre-push`, the `gate`/`gate:e2e`
script bodies, `.github/workflows/**`, root `turbo.json`, all `apps/**`/`packages/**`
source.
