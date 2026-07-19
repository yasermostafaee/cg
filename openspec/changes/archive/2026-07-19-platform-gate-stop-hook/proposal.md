# Self-enforcing local gate for Claude Code sessions (P-009)

## Why

CI is billing-blocked until ~Aug 1, so the LOCAL gate is the only merge gate — and today it
relies on the session remembering to run it. The fast gate is at least wired to `git push`
(husky pre-push), but nothing enforces it at turn end, and `pnpm gate:e2e` is entirely
manual — slow enough that it gets skipped, which is exactly how an a11y regression shipped
on a Windows-run shortcut (#352 → fixed in #354). Enforcement must not depend on model
discipline: a Claude Code turn should be UNABLE to end with a red gate, and the E2E gate
should run automatically when the diff actually warrants it.

## What Changes

- A committed Claude Code **Stop hook** (`.claude/hooks/gate-stop.mjs`, zero-dependency
  Node ESM) that runs when a session's turn ends:
  - no-ops on hook-driven continuations (`stop_hook_active`), plan mode, and turns with an
    empty changed set (working tree ∪ branch commits vs the `origin/main` merge-base);
  - docs-only changed sets run the CLAUDE.md **docs-only carve-out** (openspec validate
    strict + format:check) — mirrored, not redefined;
  - any other change runs **`pnpm gate`**, and changes touching the **UI/render set**
    (renderer sources, template-runtime, lottie-bridge, ui, single-file-export,
    `*.css.ts`, e2e specs, playwright configs) also run **`pnpm gate:e2e`**;
  - red gate ⇒ the turn is **blocked** (exit 2) with the failing tail + non-cheating
    repair rules; after two red attempts per session it stops blocking and asks for
    human eyes (never thrashes);
  - a green `gate:e2e` on `win32` is reported as **non-authoritative** (Linux still owed).
- The **pure decision logic** lives in a new `tools/gate-hook` workspace
  (`src/gate-decision.mjs`, no build step) with unit tests that run under the ordinary
  `turbo run test` gate; the hook imports it by relative path.
- Committed **`.claude/settings.json`** registering the hook and allow-listing the gate
  commands so a repair run never pauses for approval; `.gitignore` re-includes exactly
  `settings.json` + `hooks/` and ignores `.gate-logs/`.
- Docs: README "Local gate" (what the hook runs, the 2-attempt cap, the
  `settings.local.json` `disableAllHooks` escape hatch) and a short CLAUDE.md subsection
  so a future session understands why its turn was blocked.

## Capabilities

- **`platform-local-gate`** (NEW capability, `## ADDED Requirements`) — the self-enforcing
  turn-end gate: trigger conditions, classification, bounded self-repair, escalation, and
  the Windows-honesty rule.

## Impact

- New: `.claude/hooks/gate-stop.mjs`, `.claude/settings.json`, `tools/gate-hook/*`.
- Edited: `.gitignore`, `README.md`, `CLAUDE.md`, `docs/prd/platform.md` (P-009).
- FROZEN and untouched: `.husky/pre-push`, the `gate`/`gate:e2e` script bodies,
  `.github/workflows/**`, the root `turbo.json` task graph, all of `apps/**` and
  `packages/**` source.
- Escape hatch: `{"disableAllHooks": true}` in `.claude/settings.local.json`.
