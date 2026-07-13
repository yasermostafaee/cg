# Tasks — reconnect-reconciliation

## 1. Face 1 — browser retention + re-delivery

- [x] 1.1 `WebSocketRuntime`: retain the exact `{ template, html }` of every
      successful `templates.import`, keyed by `templateId` (replace on
      re-import; cleared on `dispose()`).
- [x] 1.2 `#resync()`: re-deliver every retained template exactly once, BEFORE
      the stack/health/lock snapshot pulls; a re-delivery failure is isolated
      (remaining re-deliveries + snapshot still run).
- [x] 1.3 Unit tests (apps/runtime): retain-on-import; re-import replaces;
      reconnect replays exactly the retained set once, before the snapshot
      re-pull (assert `templates.import` dispatches on the resync path);
      cleared on dispose; a failing re-import does not abort resync.
- [x] 1.4 Bridge-restart integration test (apps/runtime): close the bridge,
      re-create it on the SAME port (empty registry), reconnect → the bridge
      serves the template again and a load succeeds with no manual re-import.

## 2. Face 1 — bridge-side load guard

- [x] 2.1 `CasparRuntime.load()`: reject with `accepted:false` + ack error
      `unknown-template` (nothing sent to CasparCG) when the registry lacks
      the templateId.
- [x] 2.2 Update existing suites that load un-imported ids to import first;
      the serve-render "unregistered load is rejected" case now passes via the
      guard (not mock strictness).

## 3. Face 2 — lazy layer adoption

- [x] 3.1 `CasparRuntime`: `#adopted` layer set; first ADD onto a non-adopted
      layer is preceded by `CLEAR <ch>-<layer>` (non-intent seq) issued BEFORE
      `#slots.set` / `assignSlot` / `#addInterest`; any bridge-issued CLEAR
      (adopt / out / remove) marks the layer adopted. No startup CLEAR.
- [x] 3.2 Orphan integration suite (bridge→mock): session 1 load+take, kill the
      runtime (orphan survives, mock state is per-instance); session 2
      re-delivers + loads the same type → the adopt-CLEAR precedes the first
      ADD on exactly that layer; the fresh item is never polluted to `on-air`
      before take; take renders (onAir + resolved verdict).
- [x] 3.3 Regression versions of EXP-A/EXP-C: post-restart load with an empty
      registry fails LOUD via the guard (`unknown-template`) and the item
      never shows a false ON AIR from the orphan's OSC.

## 4. Mock fidelity

- [x] 4.1 `CG ADD`: URL arg → `202` immediately, async GET, per-slot verdict
      (`resolved`/`failed`) recorded and exposed on `MockHandle`; a failed
      page is observably not rendering on PLAY. Bare id → `404` (unchanged).
- [x] 4.2 `CG UPDATE` → `403` when the layer has no producer.
- [x] 4.3 amcp-mock unit/integration tests updated for the new semantics;
      B-041 decode/recording surfaces untouched.

## 5. Keep-green + gate

- [x] 5.1 B-044 badge-settle, B-040 list-field, R-003 staging, B-038
      serve-render, B-039 playout-cycle suites green under the new semantics
      (adjust assertions for adopt-CLEAR + guard + verdict where needed).
- [x] 5.2 Full uncached gate (`turbo --force`): format:check + typecheck +
      lint + test + build for every touched workspace; repo `format:check`.
- [x] 5.3 `pnpm openspec validate reconnect-reconciliation --strict`.
- [x] 5.4 Full e2e (`pnpm test:e2e`).

## 6. Part C — live validation (operator-driven, CasparCG 2.5.0) then wrap-up

- [x] 6.1 FIRST: clean-main B-048 reproduction attempt with caspar log +
      bridge access log captured; apply the discriminator (no CG PLAY ⇒
      resolved-by-R-007; CG PLAY + GET 200 + blank ⇒ new PRD entry; reproduces
      ⇒ diagnose further). B-048's outcome does NOT block this change's own
      validation.
      **Result (2026-07-10, CasparCG 2.5.0 `69e8ad5`):** the symptom did NOT
      reproduce — the caspar log (19:01–19:07) shows every `CG ADD`/`PLAY`
      arriving and acking cleanly, the fresh session's Load at 19:06:34
      adopting + ADDing on the new port, and the Take at 19:07:51 sending
      ADD+PLAY back-to-back; the served page probed `200` (629,685 B) with
      zero `[html_producer]` errors all day ⇒ **resolved-by-R-007** (UI-layer
      first-click loss on the pre-AsyncButton UI). The false-ON-AIR badge seen
      during the runs was root-caused separately as PRE-EXISTING → [[B-053]].
- [x] 6.2 Face 1 live: import → Load+Take on air → RESTART BRIDGE (not the
      page) → Load works with NO manual re-import; access log shows the GET on
      the new port.
      **Result (TRUE C-1, 21:00:01):** fielded `persian-lower-third.vcg` on
      air → bridge-only restart, page untouched, NO re-import → link returned
      LIVE on its own → Load+Take RENDERED with the three headline fields;
      wire proof: `CLEAR 1-60` → `CG 1-60 ADD` carrying the NEW serve port
      (55399) AND the full `ttt` field array → `PLAY`. **PASS.**
- [x] 6.3 Face 2 live: kill bridge with output on air → fresh session →
      Load/Take: caspar log shows `CLEAR <ch>-<layer>` before `CG ADD`; first
      Take renders; no Update-then-Take dance; no false ON AIR before take.
      **Result:** adopt-CLEAR preceded the fresh ADD in both runs (19:06:34,
      21:00:01), the orphan left air at Load, and the first Take rendered —
      output-judged; the badge blip is [[B-053]], not orphan pollution
      (publish-sequence + main-worktree proof). **PASS.**
- [x] 6.4 Negative/edge: Load while disconnected → explicit rejection; import
      a CHANGED `.vcg` then bounce the bridge → the re-delivered HTML is the
      changed one; page-reload matrix behaves as scoped (reload with live
      bridge still works; both-restart needs manual re-import).
      **Result:** disconnected-command rejection is pinned by the
      `WebSocketRuntime` suite (`BridgeDisconnectedError`, never optimistic);
      changed-payload re-delivery is pinned by the retention test (v1→v2
      replace replayed across a REAL bridge restart); the both-restart matrix
      row was operator-confirmed live (manual re-import required, as scoped —
      the `@cg/storage` path is C-011); reload-with-live-bridge rides the
      unchanged bridge-registry path.
- [x] 6.5 After PASS: PRD updates (B-038 follow-up resolved; B-048 per the
      discriminator; note build 2.5.0 `69e8ad5`; file the two follow-up
      candidates), archive per workflow (AFTER `fix-amcp-escaping-v2`, or
      re-reconcile the shared requirement text), push, compare URL.
      **Status:** PRD updates + follow-ups (B-054, R-009) landed on
      `docs/wrap-reconnect-reconciliation`. The ARCHIVE hold is **RELEASED**
      (2026-07-13): `fix-amcp-escaping-v2` archived FIRST (its B-041 clauses are
      now the living-spec base), so this change's "Template resolution is
      validated" delta — a SUPERSET of that text — folds on top without
      clobbering it. Archived SECOND, per the held-pair ordering pin.

## 7. B-070 — `update` gets the producer-state rule it never had

This change introduced the mock's `403`-on-a-producerless-`CG UPDATE` (matching
real CasparCG, from the B-038 live log) but never gave `update` a bullet in the
prescriptive-verb requirement it rewrites. B-070 is the missing half: `update`
was the ONE verb firing blind, so an idle/producerless item's field edits were
refused on air ("Not accepted") — and the refusal then POISONED the item.

- [x] 7.1 Bridge: `update()` branches on producer existence (`#loaded` — the same
      signal `take()`'s B-039 re-ADD and `setPosition()` already use; no new
      source of truth). Live producer → `CG UPDATE`, byte-identical (ADR-0006
      frozen). No producer → commit the fields, send NOTHING, settle the intent
      in-process (B-044), answer `accepted: true`.
- [x] 7.2 Reconciler: a FAILED ack now SETTLES the intent. It used to move only
      `ackedStatus`, leaving `intentStatus` at the transient `updating`, so
      `pending` never cleared — one refused update poisoned the item for life and
      permanently blocked R-011's `setPosition` (which refuses while `pending`).
      Not update-specific: a failed take zombied identically.
- [x] 7.3 Wire contract: `stack.update` answers `{ accepted, errorCode? }`
      (mirroring `stack.take`); `#send` surfaces the real AMCP code. The Runtime
      renders the reason at the control instead of the generic "Not accepted.".
- [x] 7.4 `MockRuntime` gains the producer model (`#loaded`) so the offline mock
      stops lying about this path — it used to accept an update on ANY item,
      which is exactly why the R-003 Inspector UX was built against semantics the
      real bridge does not have.
- [x] 7.5 Tests (red-first): bridge integration over the PRODUCERLESS path the
      suite never had — commit-without-wire-send, the settled intent, the next
      take's re-ADD carrying the fields, the live-producer regression guard, and
      a genuine AMCP-error update that settles terminally and no longer blocks
      `setPosition`. Reconciler units for the failed-ack settlement.
- [x] 7.6 LIVE CONFIRMATION on real CasparCG (owner has hardware) — the decisive
      question is in `design.md` §7: ADR-0006 validated `CG UPDATE` against a
      producer ADDed with **play-on-load=1** (playing), but B-039 later flipped
      load to **play-on-load=off**. There is therefore NO in-repo hardware proof
      that `CG UPDATE` succeeds on an ADDed-but-never-PLAYED producer. Load an
      item (do NOT take it) → edit fields → Update. If CasparCG `403`s even that
      loaded producer, then producer-existence must mean "loaded AND playing" and
      the loaded-not-playing case ALSO takes the no-send commit path.
      — **ANSWERED on real CasparCG 2.3.2 / `4de6d18f` (2026-07-13, B-070):
      `CG UPDATE` on a play-on-load=off producer WORKS.** The ADR-0006 open
      question is closed in favour of the shipped rule: producer-existence means
      LOADED (not "loaded AND playing"), so a loaded-not-taken item updates on the
      wire like any other — no fallback to the no-send commit path was needed. The
      `#loaded` branch as written is correct; no code change followed from this.
