# DEBT — R-028 part A (`dev-r028-a`, fast mode, 2026-07-29)

What this session deliberately skipped, found un-runnable, or discovered mid-flight. Every
item here must be discharged (or explicitly retired) before this change archives.

## Prerequisite NOT met when part A started

- **R-021 stage 4 had NOT landed.** The task sheet said to run after `dev-r021-stage4` landed
  on `dev`; verified at session start that it had not: `dev` == `main` at `edf8dcb`, no
  stage-4 commit on any branch, `runtime-fixed-layers` task 3.1 unchecked, and
  `#slotForRestore` still falls through to `#allocate()` (`caspar-runtime.ts`). Part A's scope
  (config + bridge-owned template store) does not functionally depend on it, so part A
  proceeded — but R-028 task **1.1 stays unticked**, and the D11 hazard stands: a restored
  fixed item still comes back on a DYNAMIC layer until stage 4 lands. **Part B must not ship
  to a restart-prone install before stage 4.** The stage-4 session should rebase on this
  commit (it touches the same `caspar-runtime.ts` restore region).

## Skipped recon

- **1.3 (CasparCG 2.3.2 template-identity recon) is UNRUN** — no hardware in this session.
  With 0.1 answered it is no longer load-bearing for OUR rows: per-row identity comes from
  the bridge's own item records joined with its persisted registry
  (`FixedSlotState.binding.templateId/templateName`), and after a bridge restart identity is
  reported `null` (unknown) rather than guessed — nothing in part A depends on CasparCG
  reporting identity, and nothing new would change if the probe finds it does. **What would
  still benefit:** task 5.3's FOREIGN-row wording (part B) — if `INFO`/OSC turns out to
  expose more than producer kind, a foreign row could say more than "producer: html". Run the
  probe before writing that wording; do not block anything else on it.

## Skipped process (fast mode — owner's instruction)

- Section 8 (docs + PRD): engine doc-sync, `docs/prd/runtime.md` status flip, cross-refs — not
  done.
- Section 9 (gate): `openspec validate --strict` not run against the updated change docs; NO
  full `pnpm gate` (uncached) run; NO `gate:e2e` (Windows or Linux); NO real-hardware pass.
  Part A ran targeted suites only: `@cg/caspar-client` tests (292 passed), `@cg/caspar-bridge`
  tests (43 files passed), `@cg/runtime` tests (61 files passed), plus typecheck + lint + build
  of the touched workspaces, a real bridge-CLI boot with the new flags, and a served-dist UI
  load check. The full green gate + the Linux `gate:e2e` debt are owed before merge to `main`.

## Adversarial review (post-implementation, same session)

A 46-agent find→refute review ran over the part-A diff; 19 findings survived verification.
Thirteen were fixed in the same commit — the three that matter most: **declared reserved
layers are now excluded from the orphan surface and refused by `layers.clear`
(`reason: 'reserved'`)** — without this, a playout graphic surfaced as a clearable orphan
and the operator could take playout output off air; **a retained item whose slot is now
reserved is SKIPPED at restore, never re-homed** (re-homing read the wrong layer's occupancy
and could put two copies on air); and **the null-bank live install path now runs the same
fail-closed untick check** as a bank change. The rest: bare `--reserved-layers` flag is a
boot error; reserved ranges are capped (legible refusal, never an OOM expansion); registry
hydration re-creates import chronology (`importedAt`) so newest-first survives a restart;
the binding carries RAW naming facts (`templateName` + `sourceFileName`) and every surface
resolves the label through the ONE canonical `displayLabel` rule; the modal's remove dialog
FAILS CLOSED on unverifiable state ("MAY BE ON AIR"), filters visibility keys to the bank
range, and masks binding/Remove on a dead link; the panel keeps a bound-or-producer row
visible even when unticked (honesty beats cosmetics); `useTemplateIndex` and the Library
re-pull on catalogue pushes and link transitions.

## Known part-A seams (carried forward, not bugs)

- **Catalogue reconciliation is still per-id local-wins on reconnect — and broader than the
  offline case.** EVERY reconnect (including a plain page reload of any browser) re-delivers
  that browser's whole local library, so a bridge-removed template is resurrected by any
  browser still holding it, and an older local copy of an id overwrites a newer bridge copy.
  No tombstones exist, and an OFFLINE removal is local-only (never replayed to the bridge) —
  it silently reverts on reconnect. Pre-existing B-085 behaviour, now more visible under a
  bridge-owned catalogue; part B should decide a reconciliation policy (tombstones or
  bridge-wins with timestamps).
- **`#resync` never re-pulls the catalogue and the bridge sends no initial
  `templates.changed` on connect.** Operator-visible staleness is covered at the UI layer
  (live `list()` is bridge-served; the Library and template index re-pull on link
  transitions and pushes), but a WebSocketRuntime-level mirror refresh is still owed if
  anything ever consumes the catalogue without those hooks.
- **Concurrent config-modal edits are last-writer-wins.** The modal seeds ticks/aliases once
  at open; two operators editing simultaneously and both Applying will silently revert each
  other's alias/tick changes (no conflict detection). Bounded: channel/start/count cannot
  change live, so only aliases/ticks are exposed. Part-B polish.
- **Import-time side facts don't travel.** R-011 `defaultPosition` and R-018
  `listFieldTargets` are recorded in the IMPORTING browser only; a template listed from the
  bridge but imported elsewhere has no records in this browser (display-only residual today;
  becomes the normal case under one-bridge-many-browsers). Part B's row Load chain should
  derive them bridge-side at import (the `produceTemplateDelivery` seam — same place 5.4's
  `hasNext` lands).
- **The 30-row plan (70–99) is capped at 70–89 until part B.** `MAX_FIXED_LAYER` stays 89 and
  `logo-bug` 90–99 is still a live policy range; section 6.4 (policy becomes descriptive)
  frees 90–99. The schema already allows `count` up to 30 so the config shape won't change
  again.
- **`fixedLayers` is still missing from the B-074 mock↔bridge parity guard**
  (`mock-bridge-parity.test.ts` `BRIDGE_SURFACE.groups`) — pre-existing gap, discovered
  during part A's mapping; `tests/**` is not typechecked so the mapped type does not catch
  it. Worth closing in part B when the surface grows verbs.
