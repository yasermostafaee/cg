# DEBT — R-028 parts A and B (fast mode, 2026-07-29)

What these sessions deliberately skipped, found un-runnable, or discovered mid-flight. Every
item here must be discharged (or explicitly retired) before this change archives.

---

# PART B (`dev-r028-b`) — the row surface, the verbs, and the playout tab

## Adversarial review of part B — 11 confirmed, 6 fixed, 5 owed

The review ran over the part-B diff with the clear path as its first dimension. Fixed in the
follow-up commit:

1. **The playout state was published AFTER the sweep's `state !== 'healthy'` guard.** A
   CasparCG outage therefore stopped the publishes entirely and the tab kept serving the last
   "Graphic on air (html)" snapshot **with an enabled CLEAR** — unverifiable occupancy shown as
   verified, plus an enabled control that can only reject, both house-rule violations at once.
   The fixed-slot publish has sat before that guard since R-021 for exactly this reason; the
   playout publish now sits beside it, with a source-level regression guard.
2. **The per-layer playout CLEAR had no confirm gate**, contradicting this module's own doc and
   the channel contract ("the operator is told whose layer it is and confirms"). Gated now.
3. **`already-empty` split from `unknown-occupancy`.** "I looked and found nothing" was being
   reported as "I cannot see" — opposite statements about our knowledge, and the alarming one
   was being shown when the calm one was true.
4. **Double-toast**: a specific refusal ("that layer carries a decklink") was overwritten a
   moment later by a generic "Not accepted." from the button's own error path. Both the single
   and bulk clears now return `cancelled` so their precise message survives; clear-all also
   reports PARTIAL failure instead of a green success naming only the wins.
5. **LOAD ignored `slot.observed`.** An unbound row can still carry a live producer (task 3.3's
   own case — a graphic that survived a bridge restart), and the load chain adopt-CLEARs before
   its `CG ADD`, so one un-gated click destroyed it. LOAD now requires an observed `empty`;
   `unknown` fails closed.
6. **The tombstone reversed B-085's local-wins** for ids the bridge already held, so a template
   corrected offline would be silently ignored on reconnect and the stale HTML would keep going
   to air. Narrowed to the resurrection case only, which is what part A actually asked for.

**Owed (recorded, not fixed):**

- **A live html producer on a DECLARED row with no binding has no clear affordance anywhere.**
  Row CLEAR is item-scoped (`stack.out({itemId})`) and disabled without a binding, and the
  orphan banner excludes declared slots by design. Reachable after a bridge restart. Needs a
  layer-scoped clear on the row — deliberately not improvised here, because it is the same
  adopt/clear-a-foreign-producer question R-015 governs.
- **A template removal made while the bridge link is DOWN is silently undone on reconnect.**
  The reconciliation policy heals offline imports but loses offline removals; the tombstone
  lives on the bridge, which never heard about this one.
- Three lower-severity findings (DEFAULT_CHANNEL assumption in `playoutLayersState`, the
  channel half of the coordinate being trusted, `onError` on UPDATE double-reporting) are in
  the review output; none is on-air-affecting.

## Owner's visual review (`dev-r028-b2`) — NOT implemented, filed as R-033

The owner reviewed the running surface and returned twelve items (row identity, alias-primary,
fixed columns, channel tabs, responsive degradation, tooltips, PGM/Preview, Configure modal
sizing, row click target, neutral buttons, table-with-sticky-header + icon-only verbs, and the
fullscreen affordance as a panel primitive). They are filed as **PRD R-033** with the reasoning
attached, and none is implemented here. **Two are structural and expensive to retrofit — do
them first:** channel must be the OUTER tab axis with LAYERS/PLAYOUT inside a channel (the
playout reservation is per-channel, so the yellow indicator must be attributable to one), and
the fullscreen/tooltip affordances must be properties of a shared panel/control primitive so
PGM, Preview and anything added later inherit them rather than being hand-wired.

## Decisions taken fast

- **The narrow breakpoint is 900px** (`NARROW_BREAKPOINT_PX`, pinned by a test). Below it the
  Inspector stops being a column and becomes a right-pinned overlay. Reasoning: the shell's
  default is a 1fr workspace beside a 320px Inspector, and a layer row needs roughly 520px
  before its verb buttons wrap under the template name — 900 is the first round number that
  keeps BOTH usable side by side. Below that a squeezed Inspector beside a squeezed row makes
  neither usable, so one has to go.
- **The overlay is right-pinned at `min(24rem, 82vw)`, not full-screen**, and the scrim
  dismisses in one click. That is the owner's "must not hide what is on air" constraint: the
  Layers list stays visible to its left, so the operator can see on-air state while editing a
  live graphic's fields — the normal case on this console, not the edge case.
- **Panel geometry persists in `localStorage`, per browser** — it is a per-operator preference
  about their own screen, not shared state. Two operators on one bridge must not fight over
  each other's panel widths, so it deliberately does NOT live in bridge config.
- **The escape hatch is a CLAMP, not just a reset button.** Neither panel can be dragged below
  its floor (Inspector 240px, workspace 420px), because `reset()` only helps if the operator
  can still find the control — a panel dragged to 0px might be covering it.
- **Icons are decorative; every verb keeps its word.** STOP and CLEAR mean the opposite here of
  what they mean in the reference product, so an operator must never have to decode a glyph to
  know which one they are pressing.

## The task-1.3 recon: RUN, and it came back POSITIVE

Part A recorded this as unrun and no longer load-bearing. Part B needed it after all — the
playout tab's clear gate turns on whether producer KIND is legible for a layer we did not
create — so it was probed against **the station's own running CasparCG 2.3.2** (AMCP 5250,
OSC 6250, the owner's live bridge attached):

- **Kind IS legible for foreign layers.** Four html producers were observed on layers
  61/70/71/72 that this bridge session did not create (their served URLs point at dead ports
  from previous sessions), reported identically through the OSC occupancy tap
  (`fixedLayers.state` on the running bridge) and through AMCP `INFO 1`
  (`<producer>html</producer>` per layer).
- **The tap can never INVENT a kind.** `occupancy-tap.ts` stores `event.producer` verbatim and
  only skips the literal `'empty'`; there is no defaulting. So a non-html producer cannot be
  misread as html, and a layer with no OSC evidence has no entry at all — which the contract
  reports as `unknown`, and unknown offers no clear.
- **Re-verified against the owner's OWN hand-placed fixture** (`cg 1-61 add 0 vp8-alpha-test 1`,
  placed outside this codebase on a reserved layer, deliberately looping): AMCP `INFO 1` reports
  layer 61 as `<producer>html</producer>` with
  `file://…/template/vp8-alpha-test.html`. This is the case the premise is actually about — a
  graphic we did NOT create — and the kind is legible. Also confirmed: the owner's running
  bridge reports `layers.orphans: []` while that graphic is on air, so part A's reserved-layer
  exclusion is working in the wild — the AUTOMATIC surface is not inviting him to clear it.
  (Station is CasparCG **2.5.0 Stable** `69e8ad5`, not 2.3.2 — the C-018 upgrade landed.)
- **NOT observed on hardware: the negative case.** The station currently has no video/route
  producer anywhere, and putting one there to watch it would have been an on-air action on a
  live channel. The negative direction rests on the code path above (verbatim pass-through)
  plus the mock (`ffmpeg` reported correctly). **Owed: confirm on hardware that a video
  producer on a reserved layer reports a non-`html` kind, at the next opportunity when
  something non-graphic is legitimately on air.** The gate fails safe either way — anything
  that is not exactly `html` is refused — so this is confirmation, not a blocker.
- **The CLEAR itself was NOT executed against the fixture.** The owner asked to be told before
  his fixture is cleared, and a mid-turn notification is not something this session can do, so
  the clear was left for him rather than performed unannounced on a live channel. Everything
  up to it is verified (presence, kind, and that the gate would offer the control); the clear
  path itself is covered by seven bridge integration tests against the AMCP mock.
  **Owed: one single-layer clear against the fixture, with the owner watching.** The command
  that re-places it is `cg 1-61 add 0 vp8-alpha-test 1`.

## What the owner should NOT assume is covered

- **The playout tab is mock- and unit-tested, never hardware-tested.** The bridge-side gate is
  integration-tested against `amcp-mock` (`playout-layers.integration.test.ts`), including
  that part A's automatic-path refusals still stand. No CLEAR has been sent to a real playout
  layer on real hardware by this session — deliberately: the reserved layers on the station
  carry live graphics.
- **The E2E suite is NOT passing and was not run** (section 9, suspended). The fixture's boot
  assertion was re-pointed from the deleted Library import button to the Layers region, and
  the seven specs bound to the deleted Library/Stack panels were removed. The remaining twelve
  need their load flows rewritten onto the row's LOAD action. **Owed in full before archive.**

## Known part-B seams (carried forward, not bugs)

- **The `features/fixedLayers/` directory is now a misnomer.** Its panel and row are deleted;
  what remains is shared machinery the Layers surface uses (`fixedSlotLoad`, `occupancyLabel`,
  `useTemplatePicker`, `FixedBankConfigModal`). Renaming it to `layers/` was deliberately NOT
  done here — it would churn every import and every test path in a diff that already deletes
  three panels. Part C touches these files anyway (section 6 retires the dynamic path); fold
  the rename in there.
- **Template REMOVAL was re-homed into the template picker dialog.** It had no other surface
  after the Library panel was deleted, and silently losing a shipped capability (R-005) would
  have been worse than putting it somewhere slightly unexpected. If the owner wants template
  management in Settings instead, that is a small move — the bridge contract is unchanged.
- **The tombstone that stops resurrection is PROCESS-LIFETIME.** `#removedTemplateIds` lives in
  the bridge and is not persisted, on purpose: after a restart the bridge re-reads its
  persisted registry, and a template absent from it is indistinguishable from one that was
  never imported — at which point a browser's re-delivery is the desired REPAIR. The tombstone
  only has to outlive the reconnects of the session that removed. If a removal must survive a
  bridge restart against a browser that was offline for both, it needs persisting; nobody has
  asked for that and it is not obviously right.
- **`hasNext` rides `TemplateInfo`, so templates imported BEFORE this change have no bit** and
  will not offer NEXT until re-imported. Absent is read as "no next step" — the safe
  direction, since an enabled control that can only no-op is the anti-pattern the rule exists
  to prevent.
- **The Designer's `canStepScene` now delegates to the shared `hasNextStep`,** which widens it:
  it descends into `repeater` rows and D-083 sequence composition items, both of which the
  runtime's `next()` cascade genuinely reaches. The full Designer suite (98 files) is green,
  including the B-034 hidden-content-inert fixtures. Called out because it is a behaviour
  change in another app: the Designer's preview Next button is now enabled in cases where it
  was previously (wrongly) greyed.

## Skipped process (fast mode — owner's instruction)

- Section 8 (docs + PRD status flips, engine doc-sync) — not done for part B either.
- Section 9 (`openspec validate --strict` against the updated change docs is RUN and green;
  the full uncached `pnpm gate` is run; `gate:e2e` is NOT — see above; no hardware pass).

---

# PART A (`dev-r028-a`, fast mode, 2026-07-29)

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
