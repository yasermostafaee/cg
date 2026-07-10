# Tasks — fix-false-onair-badge (B-053)

## 0. Hygiene + change authoring

- [x] Delete the stale `openspec/changes/fix-pending-update-completion/` dir
      (B-044 archived via #259; its leftover delta targeted the same
      requirement this change modifies). Committed separately (hygiene).
- [x] `proposal.md` + `design.md` (full Part-A diagnosis, approved by the
      operator 2026-07-10) + `specs/runtime-caspar-bridge/spec.md` (MODIFIED
      "Stack state updates from real OSC confirmations") + this plan.
- [x] `pnpm openspec validate fix-false-onair-badge --strict`.

## 1. Reconciler — producer existence ≠ play evidence (design §5)

- [x] `ItemRecord.played: boolean` — false at load-record creation, set true by
      the `take` intent, never reset by update/out/unconfirmed.
- [x] Replace `truthStatus` with the raw `lastProducer?: 'empty' | 'present'`
      (`applyOsc` stores observation + `lastOscAt`).
- [x] `freshTruth()` derives at READ time: `empty → idle`;
      `present → played ? 'on-air' : 'loaded'`. Merge ladder /
      `truthConfirmsIntent` / B-044 settle-expiry-ack machinery untouched.
- [x] Update the Reconciler header merge-rule comment with the derivation.

## 2. Bridge parity (design §5)

- [x] `updateRequest` deferral gate counts `'on-air' || 'playing'` (parity with
      `MockRuntime`).

## 3. Tests (design §9)

- [x] Reconciler injected-clock units: B-053 regression (loaded + fresh `html`
      → `loaded`, still `loaded` after `truthTtlMs`, published sequence never
      contains `on-air`); take-within-window → `on-air`; resync re-observation
      loaded vs playing; `played` survives out; `empty → idle` unchanged.
- [x] Bridge→amcp-mock integration in `disableOsc` transition-only mode: the
      3-step PRD repro (first load fresh layer / remove+reload same layer /
      second fresh layer) all rest `loaded` with no `on-air` pre-take; take →
      ON AIR; out → idle. (Verified failing pre-fix: the first run against the
      stale pre-fix `dist/` published `['loaded','on-air']` for item1.)
- [x] StackRow jsdom gating test: `loaded` → PLAY enabled, UPDATE/OUT disabled;
      `on-air` → PLAY disabled, UPDATE/OUT enabled.
- [x] B-044 / reconnect / B-040 / R-003 suites stay green (no assertions
      changed): caspar-client 220/220, caspar-bridge 40/40, runtime 14 files
      green.

## 4. Docs

- [x] File B-056 (backup-only orphan window — accepted residual, design §8) in
      `docs/prd/bugs-runtime.md`, cross-referencing reconnect-reconciliation
      and its "never on-air from the orphan's OSC before take" mandate.
- [x] Mark B-053 `[~]` with the change dir noted.

## 5. Gate

- [x] Full green gate UNCACHED (`turbo --force`) for `@cg/caspar-client`,
      `@cg/caspar-bridge`, `@cg/runtime` + repo `pnpm format:check`
      (23/23 tasks, prettier clean).
- [x] `pnpm openspec validate --all --strict` (33/33).
- [x] Full e2e (`pnpm test:e2e`): designer 191 passed, runtime 18 passed.
- [x] Conventional commits + push; verify remote head (`a11ddbe` verified via
      `git ls-remote`). Then STOP.

## 6. Live validation (operator drives, CasparCG 2.5.0 `69e8ad5`) — Part C

**Operator PASS 2026-07-10** (bridge restarted from this branch, page
refreshed, template re-imported):

- [x] Fresh import → Load (no Take): badge read READY and STAYED READY across
      and beyond the ~1 s window — no ON AIR flash, no revert-and-stick; PLAY
      enabled.
- [x] Take: badge → ON AIR, output rendered. Out: badge → IDLE, no stick.
- [x] Second fresh template (new layer): first Load also rested READY — the
      first-per-layer case is clean.
- [x] B-044 spot-check: Update settled back to ON AIR at ack speed; CasparCG
      stopped mid-update → UNCONFIRMED. Unchanged.
- [x] After PASS: flip B-053 → `[x]` (build 2.5.0 `69e8ad5`); archive (delta
      touches no requirement owned by the held fix-amcp-escaping-v2 /
      reconnect-reconciliation archives — ordering-independent, re-confirmed at
      archive time; archived cleanly).
