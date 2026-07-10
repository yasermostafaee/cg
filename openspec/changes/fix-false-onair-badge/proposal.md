# False ON AIR badge on the first Load per layer — producer existence is not play evidence (B-053)

## Why

On the FIRST Load onto a fresh layer per bridge process, the stack badge shows
**ON AIR** with no Take and sticks there indefinitely. Confirmed pre-existing on
`main` (not a reconnect-reconciliation regression) and root-caused with captured
publish sequences (see the B-053 PRD entry and `design.md`):

- Real CasparCG stage-loads AND stage-plays the html producer at `CG ADD`
  (play-on-load OFF) — the template page stays hidden until its `play()` is
  invoked, so **nothing is on program output** — yet OSC reports the
  `empty → html` foreground transition.
- `Reconciler.applyOsc` maps ANY non-empty producer to truth `'on-air'`
  (`reconciler.ts:197`); the merge ladder resolves at READ time, and nothing
  re-publishes when the 1 s truth TTL decays, so the false badge sticks.
- It is first-per-layer only because the OSC change-tracker's process-lifetime
  memory suppresses every later `html` report as a repeat (`remove()` drops
  interest before its CLEAR; a cleared layer goes silent on real CasparCG).

The wire cannot disambiguate: `CG PLAY` causes no OSC-observable change (ADR
0004, 315k-event live capture — no `/cg.*` address exists; `paused` is `false`
in both states). Play evidence exists only on the intent/ack side.

Beyond the badge word, the false `on-air` corrupts the StackRow button gating:
PLAY is DISABLED and UPDATE/OUT wrongly enabled on a merely-loaded item — the
operator cannot take the very item they just loaded.

## What Changes

- **`@cg/caspar-client` Reconciler** — store the raw observation
  (`lastProducer: 'empty' | 'present'`) instead of a pre-mapped truth status;
  add intent-side play evidence (`played`, set by the `take` intent, reset only
  when a fresh `load` record is created); derive the truth status at READ time:
  `empty → idle`, `present → played ? 'on-air' : 'loaded'`. The merge ladder,
  `truthConfirmsIntent`, and the entire B-044 settle/expiry/ack machinery are
  untouched.
- **`tools/caspar-bridge` updateRequest parity (one line)** — the system-update
  deferral gate counts `'on-air' || 'playing'` (matching `MockRuntime`) instead
  of `'on-air'` only; strictly more conservative (see `design.md`).
- **Button gating correction falls out** (no component change): a loaded-not-
  taken item now rests `loaded` → PLAY enabled, UPDATE/OUT gated — asserted by
  a new jsdom StackRow test.
- **Tests** — reconciler injected-clock units (the B-053 regression incl.
  "still `loaded` after `truthTtlMs` with no further event", take-within-window
  → `on-air`, resync re-observation for loaded vs playing, played survives
  out); bridge→amcp-mock integration in `disableOsc` transition-only mode (the
  mode that reproduces the real first-observation-emits / later-suppressed
  asymmetry — tick mode masks it).
- **Docs** — stale `fix-pending-update-completion` change dir removed
  (hygiene; B-044 archived via #259, leftover delta targeted this same
  requirement); B-056 filed for the accepted backup-only orphan-window residual
  (documented in `design.md`, NOT fixed here).

## Capabilities

- `runtime-caspar-bridge` (MODIFIED — Requirement "Stack state updates from
  real OSC confirmations": producer existence ≠ play evidence; read-time
  derivation; publish-equals-decay). No other requirement heading is touched —
  in particular NOT "Playout verbs are chosen from producer state
  (prescriptive)" (owned by the reconnect-reconciliation active delta), so this
  change archives ordering-independent of the held fix-amcp-escaping-v2 →
  reconnect-reconciliation pair.

## Impact

- `packages/caspar-client` (reconciler + unit tests), `tools/caspar-bridge`
  (one-line updateRequest gate + integration test), `apps/runtime` (jsdom
  gating test only — no component code change), `docs/prd`, `openspec`.
- Behavior after the fix: Load rests READY (no flash, no revert-and-stick,
  including the reconnect-resync re-observation variant); Take → TAKING →
  ON AIR on ack (instant when a fresh observation exists — unchanged feel);
  Update/Out/B-044 lifecycle unchanged.
- Non-regression: R-003 semantics, the B-044 completion lifecycle, the
  reconnect-reconciliation behavior, and the AMCP escape rule are untouched —
  verified adversarially (no existing test in the repo asserts `on-air` without
  a prior take; see `design.md` §Verification).
