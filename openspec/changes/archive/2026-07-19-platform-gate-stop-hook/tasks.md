# Tasks — platform-gate-stop-hook (P-009)

## 1. Verify before code

- [x] 1.1 Quote current `gate`/`gate:e2e` scripts, `.husky/pre-push`, the `.gitignore`
      `.claude/` line, `pnpm-workspace.yaml` globs, README "Local gate", CLAUDE.md gate
      rules; confirm no `.claude/settings.json` exists and no hooks are set.
- [x] 1.2 Verify the CURRENT hook + permission schemas against the Claude Code docs
      (string command form; duration-string `timeout`; no `statusMessage`;
      `permission_mode` present in Stop input; `Bash(cmd)` exact vs ` *` word-boundary
      wildcard). Recorded in design §D2 — they correct the initial brief.
- [x] 1.3 Pick `P-009` from `docs/prd/platform.md`; RE-VERIFY free against current
      `origin/main` and every remote branch immediately before commit.

## 2. Implementation

- [x] 2.1 `tools/gate-hook/src/gate-decision.mjs` — pure decision logic, zero-dep ESM,
      no build step (normalize/parse/classify/match/count; `UI_RENDER_PATTERNS`).
- [x] 2.2 `tools/gate-hook` workspace: package.json (typecheck/lint/test only),
      tsconfig (noEmit, tests+types), eslint config, vitest config, and the
      `types/gate-decision.d.ts` typed surface for the `.mjs`.
- [x] 2.3 `.claude/hooks/gate-stop.mjs` — the orchestrator: stdin JSON, decision order
      (design §D3), changed-set union (§D4), per-session `.gate-logs/` log + attempt
      counter, exit 2 with tail + verbatim repair rules, stand-down `systemMessage`
      after two reds, win32 non-authoritative note on green e2e.
- [x] 2.4 `.claude/settings.json` — Stop hook (documented string form, quoted
      `$CLAUDE_PROJECT_DIR`, `timeout: "30m"`) + `permissions.allow` for the gate
      command families (exact + word-boundary wildcard forms).
- [x] 2.5 `.gitignore` — `.claude/` → `.claude/*` with negations for exactly
      `settings.json` + `hooks/` (parent-dir exclusion trap), keep
      `settings.local.json` + generated commands ignored, add `.gate-logs/`.
      Verified with `git check-ignore -v` on all five cases.

## 3. Tests

- [x] 3.1 `tools/gate-hook/tests/gate-decision.test.ts` — porcelain/rename parsing,
      normalization, docs-only membership, UI/render membership (positive + negative),
      classification → command lists, dedup, attempt counting.
- [ ] 3.2 Seven manual hook invocations with crafted stdin (exit codes recorded in the
      PR): stop_hook_active → 0 · clean tree → 0 · docs-only → carve-out only ·
      non-UI code → gate only · UI code → gate + gate:e2e · forced red → 2 with repair
      rules · third red → 0 + systemMessage.
- [ ] 3.3 caspar-bridge suite green BOTH isolated and under full parallel `pnpm test`.

## 4. Docs

- [x] 4.1 README "Local gate": the Stop hook, what it runs per classification, the
      2-attempt cap, the `disableAllHooks` escape hatch.
- [x] 4.2 CLAUDE.md: one short subsection — why a turn was blocked and what to do.
- [x] 4.3 PRD `docs/prd/platform.md` P-009 → `[~]` with the change dir.

## 5. Gate

- [ ] 5.1 `pnpm gate` green (uncached). `pnpm gate:e2e` NOT required — this change
      touches no UI/render path (tooling + docs only); stated explicitly, not silently
      skipped.
- [ ] 5.2 `pnpm openspec validate platform-gate-stop-hook --strict` green.
- [ ] 5.3 Conventional commit, push, verify remote head, open PR (`gh pr view <n>
--json` for the number). DO NOT archive — owner confirms.
