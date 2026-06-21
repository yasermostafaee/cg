# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

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

The shipped save + import-polish work (D-088 / D-089 / D-093, D-067 / D-068) is archived — see
Done (recent). The agreed upcoming order (one line each; **full PRD entries authored per-item when
started** — most of these IDs are not yet filed):

1. [B-022](./prd/bugs.md) — scale + rotate selection bug
2. [D-094](./prd/designer.md) — global button restyle (no default border + colors)
3. [D-095](./prd/designer.md) — project name centered + Save adjacent
4. [D-086](./prd/designer.md) **[DESIGN]** — per-composition Preview / Export / HTML sticky bar +
   playout combo (`.vcg` per-composition, Save on top)
5. [D-087](./prd/designer.md) — preview blank-until-play
6. [D-085](./prd/designer.md) **[DESIGN]** — stop / close = CLEARED terminal state
7. [D-071](./prd/designer.md) / D-072 / D-073 — canvas
8. [D-092](./prd/designer.md) — icon-pack
9. [D-074](./prd/designer.md)–D-080 — timeline / layers
10. [D-039](./prd/designer.md) (ext) / D-081 / D-082 / D-083 / D-084 — sequence / clock
11. [D-090](./prd/designer.md) / D-091 — chrome
12. [B-024](./prd/bugs.md) — negative guard

> **Ordering note:** D-092 (icon-pack) precedes D-075 / D-078 / D-080 / D-084.

Previously-listed designer items not in this order — D-059, D-060 (unblocks the parked
[D-046](./prd/designer.md)), D-061, D-063, D-064, D-065, D-066 — remain **queued** in the PRD but
are deprioritized below the above.
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
