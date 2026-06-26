# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

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
  filter + Phase B editor + [B-026](./prd/bugs.md) grow-to-fit extent) — merged &
  archived (2026-06-21 / 2026-06-22, PRs #153 / #154 · #155 / #156 · #157). An
  off-frame staging area outside the frame, excluded from export / `.vcg` /
  single-file HTML, with the pasteboard extent growing to contain content parked
  far off-frame. [B-027](./prd/bugs.md) (during-drag drift) filed **DEFERRED**.
  Archives: `2026-06-21-off-frame-export-filter`, `2026-06-22-pasteboard-editing`,
  `2026-06-22-pasteboard-extent-fits-content`. Living spec: `designer-canvas-viewport`.
- Per-composition export + top-chrome relocation ([D-086](./prd/designer.md),
  **absorbs [D-095](./prd/designer.md)**) — merged & archived (2026-06-21, PRs
  #144 / #145 / #147). Phase A scopes `.vcg` / HTML export to the open
  composition plus its nested closure; Phase B relocated the global chrome (slim
  top bar, centered project name adjacent to Save) and added the per-composition
  Preview / Export / HTML bar. Also fixed [B-023](./prd/bugs.md)
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
  shared button recipe; the [B-025](./prd/bugs.md) gizmo-frame render fix
  (selection box renders again) rode alongside (#146). Archive:
  `2026-06-20-restyle-buttons`.
- Selection-overlay scale + rotate fix ([B-022](./prd/bugs.md)) — merged &
  archived (2026-06-20, PRs #141 / #143). The selection overlay now tracks the
  shape under scale + rotation. Archive: `2026-06-20-fix-selection-overlay-scale-rotate`.
- Desktop-style Save epic ([D-088](./prd/designer.md) + folded [D-089](./prd/designer.md)
  Save-button unsaved visual + [D-093](./prd/designer.md) non-destructive Remove-from-Recent) —
  merged & archived (2026-06-20, PR #139). Native `FileSystemFileHandle` persisted in IndexedDB
  (survives reload, permission re-acquired in the click gesture), content-hash dirty +
  tab-title / `beforeunload` guards, Home-closes-project, handle-keyed Recent + tiered
  OPFS/download fallback. Absorbs D-002 / D-003. Living spec: `designer-project-persistence`.
- Asset-import polish ([D-067](./prd/designer.md) loading indicator + the headerless D-069/D-070
  multi-select + prepend sub-labels + the [B-019](./prd/bugs.md) / [B-020](./prd/bugs.md) /
  [B-021](./prd/bugs.md) fixes, and [D-068](./prd/designer.md) Shared Library search + grid/list
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
  layer-reorder drag, [D-048](./prd/designer.md) inspector visual polish, + the [B-018](./prd/bugs.md)
  spread static-write fix) merged & archived (2026-06-17); D-042 and D-052 landed earlier. Only
  [D-046](./prd/designer.md) (sizing=auto guard) is NOT done — PARKED, blocked on the new D-060
  (auto-size rendering); see Next.
- Multi-select chain ([D-041](./prd/designer.md) + follow-ups D-049 / D-050 /
  D-051 / D-053 / D-054 + [B-014](./prd/bugs.md)) — merged & archived
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
stop-clears, preview-blank, pasteboard, icon-pack, and timeline/layers work is
archived — see Done (recent). The agreed upcoming order (one line each; **full PRD
entries authored per-item when started** — most of these IDs are not yet filed):

1. [D-072](./prd/designer.md) / [D-073](./prd/designer.md) — guide coordinate
   readout + arrow-key nudge. **IN REVIEW:** both implemented + tested on
   `feat/D-072-073-guide-readout-nudge` (changes
   `openspec/changes/guide-coordinate-readout/` +
   `openspec/changes/arrow-key-nudge/`); only the batched green gate + E2E and the
   merge/archive remain.
2. [D-039](./prd/designer.md) (ext) / D-081 / D-082 / D-083 / D-084 — sequence / clock
3. [D-090](./prd/designer.md) / D-091 — chrome (additional polish beyond D-086
   Phase B; confirm scope vs. what D-086 delivered when filing)
4. [B-024](./prd/bugs.md) — negative guard

> **Ordering note:** the icon-pack (D-092) is done — the shared `Icon` set now
> exists, so new control-bearing items (e.g. D-084) reuse it.

Previously-listed designer items not in this order — D-059, D-060 (unblocks the parked
[D-046](./prd/designer.md)), D-061, D-063, D-064, D-065, D-066, [D-096](./prd/designer.md)
(perf — animate position via CSS transform; belongs to the hardening wave) — remain **queued**
in the PRD but are deprioritized below the above.
**Wave tail (carried over):** template cleanup — rebuild / refresh the bundled sample templates
against the UX wave's finalized controls.

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
