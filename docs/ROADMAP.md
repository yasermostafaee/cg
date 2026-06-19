# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

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

## Next — feature wave (in this order)

The owner UX-feature wave (D-042–D-048 + D-052) is complete — see Done (recent). The remaining
designer backlog, roughly in priority order:

1. [D-060](./prd/designer.md) — Auto-size text rendering (consume `fitMode`) — needs a dedicated
   design pass (sized like C-001). **Unblocks [D-046](./prd/designer.md)** — the sizing=auto guard
   is PARKED until this lands and ships **coupled** with it (no unguarded window).
2. [D-059](./prd/designer.md) — Friendly validation presets for dynamic text fields (preset
   dropdown + "Custom (advanced)" regex escape over the existing `pattern`; designer-facing)
3. [D-064](./prd/designer.md) — Re-wire repeater-stamped image `src` at play time — a D-062
   correctness follow-up: D-062 wired the static tree only, so images stamped into repeater rows at
   playout don't render in export (medium).
4. [D-061](./prd/designer.md) — Text decoration / transform / variant controls — the rest of the
   font controls the D-048 popover was envisioned with; needs schema + renderer (low priority)
5. [D-063](./prd/designer.md) — Drag a Shared Library image onto the canvas — D-040 parity follow-up
   (today click-to-select + logo tool / inspector only; add drag-drop like the Project Assets panel;
   low-medium).
6. [D-065](./prd/designer.md) — Shared library: keyboard-Delete to remove the selected library image
   (the panel selection has no Delete action today; confirm the panel-item vs canvas-logo target at
   scheduling; low).
7. [D-066](./prd/designer.md) — Relocate shared-library management out of the per-project left-rail to
   a project-independent home (device-level library shouldn't live inside one project; placement only;
   low).
8. [D-067](./prd/designer.md) — Image-import loading indicator in both asset panels (spinner tile while
   an import decodes/stores, cleared on ready or error; lightweight, no import-logic change; low-medium).

**Wave tail (carried over):** template cleanup — rebuild/refresh the bundled sample templates
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
