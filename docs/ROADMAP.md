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

## Next — feature wave (in this order)

1. UX features (list TBD by the owner — slot here when provided)
2. Sequence / now-next ([D-029](./prd/designer.md)): one item at a time,
   extensible transitions (horizontal/vertical/slideUp/slideDown/hide-show),
   per-item dwell; needs multi-step `steps` + real `next()`
3. Repeater / data-driven layout ([D-030](./prd/designer.md)): reuses the
   extensible list field from D-028

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
