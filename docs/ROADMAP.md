# Roadmap (agreed order)

The agreed **sequence** of upcoming work, so the plan survives across sessions.
The PRD files under [`docs/prd/`](./prd/README.md) hold the items
(What / Why / Acceptance); this file records the **order**. Keep it updated as
the order changes. Strategic / non-engineering notes live in
[`docs/prd/roadmap.md`](./prd/roadmap.md).

## Done (recent)

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

1. Owner UX-feature wave ([D-041](./prd/designer.md) → [D-048](./prd/designer.md)) —
   see the subsection below

### Owner UX-feature wave (D-041 → D-048, in this order)

1. [D-041](./prd/designer.md) — Multi-select shapes (canvas + layers) + shared-property editing
2. [D-042](./prd/designer.md) — Per-corner border radius (toggle)
3. [D-043](./prd/designer.md) — Extended drop-shadow (outset/inset + spread) + text-shadow section
4. [D-044](./prd/designer.md) — Font-weight for plain text
5. [D-045](./prd/designer.md) — Unify text alignment + vertical align (ticker/sequence) + align not keyframable
6. [D-046](./prd/designer.md) — Sizing=auto behavior (modal + squeeze off + no keyframes on text-metrics)
7. [D-047](./prd/designer.md) — Layer reordering via drag (z-index) + drop indicator
8. [D-048](./prd/designer.md) — Inspector visual polish (align/padding/sizing buttons, text-settings popover, no blue button)

**Tail (after D-048):** template cleanup — rebuild/refresh the bundled sample
templates against the wave's finalized controls (the explicit tail of this wave).

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
