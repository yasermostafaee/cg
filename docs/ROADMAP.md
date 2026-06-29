# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

- Auto-size text + sizing=auto guard ([D-060](./prd/designer.md) +
  [D-046](./prd/designer.md)) — merged & archived (2026-06-29, design #218 + impl
  #223). A `text` element with `fitMode: 'autosize'` now hugs its content in BOTH
  dimensions via CSS intrinsic sizing (`max-content` + `white-space: pre`; `\n`
  honored, no auto-wrap; min box; RTL pins the right edge) — synchronous +
  CEF/`file://`-safe, identical in preview / `.vcg` / single-file HTML. The selection
  gizmo traces the measured rendered box with inert resize handles; vertical-align is
  disabled in Auto (horizontal kept). D-046 guard: switching to Auto with size
  keyframes warns+confirms then deletes them as one undo; Auto→Fixed commits the
  measured size once. Living specs: `designer-text-autosize` (net-new),
  `designer-shapes` (gizmo MODIFIED). Archive:
  `2026-06-29-consume-fitmode-auto-size-text`. (Squeeze-off / `shrink-to-fit` remain
  out of scope; starter-template visual repair folds into [D-119](./prd/designer.md).)
- Guide readout + nudge, split exit, explicit field Update ([D-072](./prd/designer.md) /
  [D-073](./prd/designer.md) / [D-105](./prd/designer.md) / [D-106](./prd/designer.md)) — merged &
  archived (2026-06-29, PRs #160 · #194 · #198). D-072 guide coordinate badge on hover/drag, D-073
  arrow-key nudge (Shift = 10px, keyframe-aware, one undo step per key-press run), D-105 split exit
  (animated "Out" = content-first/background-last vs a quick "Stop"/"Clear" hard removal), D-106
  preview field form with an explicit global + per-INPUT Update and a pending/unapplied indicator
  (+ optional textarea). Archives: `2026-06-29-guide-coordinate-readout`, `2026-06-29-arrow-key-nudge`,
  `2026-06-29-preview-split-exit`, `2026-06-29-preview-field-update`.
- Selective content-driven hold ([D-107](./prd/designer.md)) — merged & archived (2026-06-28,
  PR #201). An optional `drivesHold` (absent ⇒ participates; non-breaking, no version bump) on
  ticker / sequence / clock lets the designer pick WHICH content closes the graphic: `ownContentWait`
  filters to `drivesHold !== false` (start/stop still cover ALL content; D-104's `contentTreeWait`
  aggregation flows through, so nested selection works for free; all-excluded / none ⇒ zero-length
  hold). The PlayoutSection shows a pre-checked checklist of the active composition's own content
  (wall/countup clocks never listed); a recursive `setElementDrivesHold` reaches grouped content.
  Living spec: `designer-playout-lifecycle`. Archive: `2026-06-27-selective-content-hold`. Follow-up
  [D-108](./prd/designer.md) surfaces nested-composition hold-driving content (read-only) in the
  checklist.
- Nested-composition content lifecycle ([D-104](./prd/designer.md)) — merged & archived (2026-06-27,
  PR #191). Finite content (ticker / sequence / countdown) inside a NESTED composition now participates
  in the parent's content-driven hold: `hasContentElement` recurses into composition instances (so the
  hold control is OFFERED), and a content-driven "coordinator" scope starts + awaits its OWN content PLUS
  its non-coordinator nested descendants' at its hold entry — the parent holds until the nested content
  completes (infinite → until `stop()`) and the nested content starts AFTER the parent's intro, not on
  the play cascade. Content-driven nested comps stay independent (skipped); repeater rows / sequence
  comp-items unaffected; the root `contentHold` override is preserved. NON-BREAKING (no schema change).
  Living spec: `designer-playout-lifecycle`. Archive: `2026-06-27-nested-content-lifecycle`. Follow-up
  [B-030](./prd/bugs-designer.md) filed (the timed-auto-out nested-holder strand edge).
- Sequence typed items — Phase 1 ([D-083](./prd/designer.md)) — merged & archived (2026-06-27, PRs
  #182 / #183 / #185 / #186 / #188). A sequence item is now TEXT or a COMPOSITION reference
  (clock+text / logo+text layouts cycled under the same transitions / dwell; live content runs inside,
  the comp's own intro/outro held); NON-BREAKING (`kind` defaults to `'text'`, no migration). The #188
  follow-up made TEXT items bind EXPLICITLY (operator opt-in) instead of auto-exposing every item as a
  field. Living spec: `designer-sequence-element`. Archive: `2026-06-27-sequence-typed-items`. Phase 2
  (per-item field injection into composition items) remains later.
- Start-trimmed content no longer dropped from play/export ([B-029](./prd/bugs-designer.md)) — focused fix,
  merged (2026-06-27, PR #187, 9737ab9). A clock / ticker / sequence trimmed at its start
  (`lifespan.in > 0`) was hidden for the whole playout because the lifespan gate ran only in the
  scrubber's `tick`, not the PlayoutController's per-frame `applyFrame`; the root controller now
  evaluates the same `applyLifespanGatesAtFrame` during play, so the element appears at its in-point.
  No change dir (focused fix); regression tests in `runtime.test.ts` + `trimmed-content-start.spec.ts`.
- Per-element preview timing — Phase 1 ([D-102](./prd/designer.md)) — merged & archived
  (2026-06-26, PR #180). Ticker timing in the preview moved from per-scope to PER-ELEMENT (keyed by
  element id), so two tickers in one composition are tuned independently — each ticker's own
  repeat / cycle-seam applies to its OWN driver; the timing panel shows one row per ticker
  (duplicate names disambiguated) and scrolls; session-only (the stored template is untouched).
  Archive: `openspec/changes/archive/2026-06-26-per-element-preview-timing/`. Phase 2 (sequences +
  countdown clocks) + the repeater-stamped-ticker gap remain OPEN (see Next).
- Sequence/clock wave ([D-084](./prd/designer.md), [D-039](./prd/designer.md) ext,
  [D-103](./prd/designer.md)) — merged & archived (2026-06-26, PR #177). D-084 clock selectable
  IANA time zone (wall mode via `Intl`, Persian digits preserved; invalid zone degrades to local),
  D-039 ext ticker image/logo separator (project OR shared library, between-items only, follows
  `verticalAlign`, inlined + preflighted on export), D-103 clock blinking colon (opacity pulse at an
  adjustable rate, no reflow). All NON-BREAKING additive schema widenings — no version bump or
  migration. Archives under `openspec/changes/archive/2026-06-26-clock-timezone/`,
  `…-ticker-image-separator/`, `…-clock-blink-colon/`. PRD → [x]. (The wave's D-081/D-082 shipped
  earlier in Group A.)
- Group A quick-wins ([D-081](./prd/designer.md), [D-082](./prd/designer.md),
  [D-097](./prd/designer.md), [D-098](./prd/designer.md), [D-099](./prd/designer.md),
  [D-100](./prd/designer.md), [D-101](./prd/designer.md) + [B-024](./prd/bugs-designer.md)) — merged
  (2026-06-26, PR #175; filed in #174). D-081 no-trailing ticker separator, D-082 English
  ticker/sequence defaults (+ LTR direction & white default text), D-097 distinct shared-image
  timeline icon/color, D-098 bound-layer key icon, D-099 minimum-window-size gate, D-100 menubar
  hover-to-switch, D-101 red unbind control matching the row remove, B-024 non-negative
  width/height/scale. All FOCUSED FIXES (no living-spec change to archive); the batch also added
  Ctrl+O / Ctrl+S / Ctrl+Shift+S file shortcuts + right-aligned menu shortcut hints. PRD → [x].
- Timeline/layers wave ([D-074](./prd/designer.md)–[D-079](./prd/designer.md)) — merged &
  archived (2026-06-26, PRs #167–#171). D-074 (zoom-slider border removed), D-075 (new default
  per-type layer colors), D-076 (multi-select layer context menu), D-077 (copy/cut/paste
  shortcuts — physical-key / Persian-safe), D-078 (pinned scene row), D-079 (inline color hex
  input widen + shorthand normalize). D-076/D-077 and D-078 carry living-spec deltas
  (`designer-multi-select`, `designer-animation-timeline`); D-074/D-075/D-079 were focused fixes
  (no change dir). Archives: `2026-06-26-multi-select-clipboard`, `2026-06-26-pin-scene-row`.
  D-080 was reserved but unused. (Follow-up `fix/playhead-above-scene-row` — keep the index line
  above the pinned scene row — PR open.)
- Icon pack — shared vector `Icon` (lucide-react) replacing the ad-hoc Unicode-glyph
  icons across the Designer ([D-092](./prd/designer.md)) — merged & archived
  (2026-06-25, PR #163). App-local `Icon` (`currentColor` / `aria-hidden` / one
  `size` / opt-in `flipRtl`) across tools, alignment, transform, chevrons, transport,
  callouts, the timeline layer-type icons, and the panel grid/list + zoom + add +
  radius controls; the Select dropdown chevron is a real lucide element; tool palette
  reordered drawing-first → dynamic. `lucide-react` (ISC) imported per-icon +
  recorded in `THIRD_PARTY_LICENSES.md`. Living spec: `designer-controls`. Archive:
  `2026-06-25-replace-glyph-icons`. (Standalone fixes rode the same branch: canvas
  checkerboard contrast, Compositions panel border, a vcg-format lint fix.)
- Pasteboard editing epic ([D-071](./prd/designer.md) Phase A off-frame export
  filter + Phase B editor + [B-026](./prd/bugs-designer.md) grow-to-fit extent) — merged &
  archived (2026-06-21 / 2026-06-22, PRs #153 / #154 · #155 / #156 · #157). An
  off-frame staging area outside the frame, excluded from export / `.vcg` /
  single-file HTML, with the pasteboard extent growing to contain content parked
  far off-frame. [B-027](./prd/bugs-designer.md) (during-drag drift) filed **DEFERRED**.
  Archives: `2026-06-21-off-frame-export-filter`, `2026-06-22-pasteboard-editing`,
  `2026-06-22-pasteboard-extent-fits-content`. Living spec: `designer-canvas-viewport`.
- Per-composition export + top-chrome relocation ([D-086](./prd/designer.md),
  **absorbs [D-095](./prd/designer.md)**) — merged & archived (2026-06-21, PRs
  #144 / #145 / #147). Phase A scopes `.vcg` / HTML export to the open
  composition plus its nested closure; Phase B relocated the global chrome (slim
  top bar, centered project name adjacent to Save) and added the per-composition
  Preview / Export / HTML bar. Also fixed [B-023](./prd/bugs-designer.md)
  (repeater-mediated nesting cycle slipping past the author-time guard). Archive:
  `2026-06-21-per-composition-export-and-chrome`. Living specs:
  `designer-composition-export` (net-new), `designer-shell`, `designer-repeater-element`.
- Stop/close = CLEARED terminal state ([D-085](./prd/designer.md)) — merged &
  archived (2026-06-21, PRs #150 / #151). Stop and close now resolve to a CLEARED
  terminal state. Archive: `2026-06-21-stop-clears-composition`.
- Preview blank-until-play ([D-087](./prd/designer.md)) — merged & archived
  (2026-06-21, PRs #148 / #149). The preview opens blank until Play. Archive:
  `2026-06-21-preview-blank-until-play`.
- Global button restyle ([D-094](./prd/designer.md)) — merged & archived
  (2026-06-20, PRs #142 / #143). No default border + refined accent colors at the
  shared button recipe; the [B-025](./prd/bugs-designer.md) gizmo-frame render fix
  (selection box renders again) rode alongside (#146). Archive:
  `2026-06-20-restyle-buttons`.
- Selection-overlay scale + rotate fix ([B-022](./prd/bugs-designer.md)) — merged &
  archived (2026-06-20, PRs #141 / #143). The selection overlay now tracks the
  shape under scale + rotation. Archive: `2026-06-20-fix-selection-overlay-scale-rotate`.
- Desktop-style Save epic ([D-088](./prd/designer.md) + folded [D-089](./prd/designer.md)
  Save-button unsaved visual + [D-093](./prd/designer.md) non-destructive Remove-from-Recent) —
  merged & archived (2026-06-20, PR #139). Native `FileSystemFileHandle` persisted in IndexedDB
  (survives reload, permission re-acquired in the click gesture), content-hash dirty +
  tab-title / `beforeunload` guards, Home-closes-project, handle-keyed Recent + tiered
  OPFS/download fallback. Absorbs D-002 / D-003. Living spec: `designer-project-persistence`.
- Asset-import polish ([D-067](./prd/designer.md) loading indicator + the headerless D-069/D-070
  multi-select + prepend sub-labels + the [B-019](./prd/bugs-designer.md) / [B-020](./prd/bugs-designer.md) /
  [B-021](./prd/bugs-designer.md) fixes, and [D-068](./prd/designer.md) Shared Library search + grid/list
  view toggle) — merged & archived (2026-06-20, PRs #138 / #137 / #134 / #130). Living specs:
  `designer-project-assets` (net-new), `designer-shared-image-library`.
- Shared image library epic ([D-040](./prd/designer.md) + [D-062](./prd/designer.md)) — archived
  (2026-06-17). [D-062](./prd/designer.md) (merged) wired the per-project image byte→`src`
  render/inline path (runtime `assetUrls` seam + `.vcg` packaged paths + single-file HTML base64
  inline + missing-asset report) and left the source-aware seam; [D-040](./prd/designer.md) added the
  device-level shared image library + logo element (the `source: 'shared'` image, two-source resolver
  across preview / `.vcg` / HTML, library panel + canvas logo tool + inspector combo). Living specs:
  `designer-image-export`, `designer-shared-image-library`. Follow-ups filed:
  [D-063](./prd/designer.md) (drag a library image → canvas) and [D-064](./prd/designer.md) (re-wire
  repeater-stamped image `src` at playout).
- Owner UX-feature wave ([D-042](./prd/designer.md) → [D-048](./prd/designer.md) + [D-052](./prd/designer.md)) —
  complete. The final batch ([D-043](./prd/designer.md) box-shadow spread+inset, [D-044](./prd/designer.md)
  font-weight, [D-045](./prd/designer.md) unified alignment + vertical align, [D-047](./prd/designer.md)
  layer-reorder drag, [D-048](./prd/designer.md) inspector visual polish, + the [B-018](./prd/bugs-designer.md)
  spread static-write fix) merged & archived (2026-06-17); D-042 and D-052 landed earlier. Only
  [D-046](./prd/designer.md) (sizing=auto guard) is NOT done — PARKED, blocked on the new D-060
  (auto-size rendering); see Next.
- Multi-select chain ([D-041](./prd/designer.md) + follow-ups D-049 / D-050 /
  D-051 / D-053 / D-054 + [B-014](./prd/bugs-designer.md)) — merged & archived
  (2026-06-14); multi-select editing now reaches single-selection parity "fanned
  out": keyframe-aware group move + field edits (reusing `commitAnimatable`),
  aggregate keyframe diamonds (empty / at-frame / partial), realtime single-undo
  number fields, and the central keyframe-ability + inspector-field registry
  (D-051). Living specs: `designer-multi-select`, `designer-inspector-registry`.
- Ticker/crawler ([D-028](./prd/designer.md)) — merged; two-loop model (ticker
  repeat/cycleBoundary + holdSource axis), hard-stop pinned
- Clock element ([D-027](./prd/designer.md)) — merged; wall/countup/countdown
  on the ticker's self-wire pattern, countdown = content source
- Sequence / now-next ([D-029](./prd/designer.md)) — merged; decomposed
  in/out/timing transitions with presets, per-item dwell, real `next()`
  dispatch (the D-031 seam), finite sequence = third content source
- Repeater / data-driven layout ([D-030](./prd/designer.md)) — merged; one
  child-composition instance per data-list row, reuses the D-028 extensible
  list field

## Next — agreed order

The save + import-polish, button-restyle, per-composition export + chrome,
stop-clears, preview-blank, pasteboard, icon-pack, timeline/layers, and the
guide-readout / arrow-nudge / split-exit / explicit-field-Update work
([D-072](./prd/designer.md) / [D-073](./prd/designer.md) / [D-105](./prd/designer.md) /
[D-106](./prd/designer.md)) is archived — see Done (recent). The agreed upcoming order
(one line each; **full PRD entries authored per-item when started** — most of these IDs
are not yet filed):

1. [D-090](./prd/designer.md) / D-091 — chrome (additional polish beyond D-086
   Phase B; confirm scope vs. what D-086 delivered when filing). NOTE: neither ID is
   filed in `docs/prd/designer.md` yet — author the PRD entries (or fold into D-086's
   follow-ups) before starting.

> **Ordering note:** the icon-pack (D-092) is done — the shared `Icon` set now
> exists, so new control-bearing items reuse it.

Previously-listed designer items not in this order — D-059, D-060 (unblocks the parked
[D-046](./prd/designer.md)), D-061, D-063, D-064, D-065, D-066,
[D-096](./prd/designer.md) (perf — animate position via CSS transform; belongs
to the hardening wave), and [D-102](./prd/designer.md) **Phase 2** (per-element preview timing for
SEQUENCES + COUNTDOWN clocks, plus surfacing repeater-stamped tickers in the timing tree — which
currently walks only authored composition instances; Phase 1 tickers shipped, see Done) — remain
**queued** in the PRD but are deprioritized below the above. (D-097–D-101 shipped in Group A — see
Done.)

### Designer — remaining, in order

The concrete near-term Designer sequence (survives across sessions; the Runtime
track is independent — see its own entries):

1. **[B-036](./prd/bugs-designer.md) inspector icon align** (quick) — filed, fix pending.
2. **[B-035](./prd/bugs-designer.md) fit-on-open** (medium) — filed, investigate the
   timing/ordering race.
3. **[B-037](./prd/bugs-designer.md) pen tool** (low, keep-or-remove decision) — filed.
4. **[D-119](./prd/designer.md) rebuild starter templates** (5 showcases) — filed,
   **BLOCKED until 1–3 are done** (templates should exercise healthy features);
   supersedes the old "template cleanup" wave-tail note. (D-060 auto-size, its other
   prerequisite, is now done — see Done.)

Plus the existing queued / deprioritized items already in `designer.md`:
[D-059](./prd/designer.md), [D-061](./prd/designer.md), [D-063](./prd/designer.md),
[D-064](./prd/designer.md), [D-096](./prd/designer.md), and
[D-102](./prd/designer.md) **Phase 2**.

## Then — hardening wave (after features)

No PRD items filed yet — file them when this wave is scheduled.

1. Visual regression (Playwright screenshots; CI-only baseline)
2. Exported-artifact test (load the single-file HTML headless; update→play→
   update→stop; no console errors / external requests)
3. Runtime a11y (axe in E2E on main surfaces)
4. Light perf guardrails (frame-drop budget on a heavy preview scene)

## Then — infra/quality

- Extract domain SKILLS from scattered docs ([P-007](./prd/platform.md))

## Parked / strategic

- License decision · user-docs site ([P-006](./prd/platform.md)) · MOS ·
  target-hardware validation · on-air reference · soft-stop
  ([C-008](./prd/caspar.md), rundown layer)
