# Design — fix-pen-path-style-commits (B-051 + B-052 rider)

## Recon findings (2026-07-10)

### B-051 mechanism — the static-write guards, NOT missing defaults

Method: code trace + a red unit test against the live store (deterministic, ran pre-fix).

- **Hypothesis "pen paths are created without `fill`/`stroke`" — REFUTED.**
  `pathFromScenePoints` (`state/element-defaults.ts`) seeds every pen path with
  `fill: { kind: 'solid', color: '#BEBEBE' }` and `stroke: { width: 2, color: '#1A1A1A' }`;
  the red test's baseline case proves both defined on a fresh path.
- **Actual mechanism — CONFIRMED red:** the Path Style controls commit via
  `commitAnimatable`, which with no keyframe track lands in `writeStaticAnimatable`
  (`state/slices/timeline.ts`). Its per-kind guards predate D-109:
  - `boxKind = el.type === 'shape' || el.type === 'text'` gates `stroke.width`,
    `stroke.dash`, and `stroke.color` → `if (!boxKind) return;` — a path no-ops.
  - `fill.color` guards `el.type !== 'shape'` → a path no-ops.

  Red test (pre-fix): all four commits left a fresh path frozen at its creation defaults
  (width 2, `#1A1A1A`, no dash, `#BEBEBE`) — exactly the owner's "the values don't even
  change". Post-fix the same file is green.

- **Why the symptom looked partial:** transform/opacity/filter cases in the same switch have
  no kind guard (or include all kinds) — they worked; keyframed `stroke.*`/`fill.color`
  route through `upsertKeyframe` (kind-agnostic) — they worked; gradient/mode fill changes
  bypass the guard entirely (`applyFillModeChange` → raw `updateElement`) — they worked.
  Only the static solid-colour / width / dash writes — the everyday edits — died.

### B-052 mechanism — missing element-type case

`layerTypeIcon` (`features/timeline/ElementRow.tsx`) switches on `element.type` with no
`case 'path'`, so the D-109 path element falls to `default: return Square` (the rectangle).
The pre-existing `case 'path'` sits inside the SHAPE sub-switch — it maps the legacy
`shape: 'path'` VARIANT to `Spline` and is unrelated. Mapping audit: every other element
type (text, image ± shared, ticker, clock, sequence, repeater, lottie, video-placeholder,
container, composition, shape variants) is correctly iconed — only `path` was missing.

## Decisions

### D1 — fix the guards, not the creation defaults

The prompt offered "seed defaults at creation" as the primary fix — but the defaults already
exist, so the ONLY correct fix is the guard set: `boxKind` gains `'path'` (stroke is a real,
schema-carried property of a path) and `fill.color` accepts `shape | path`. This keeps
D-056's deliberate strictness — ticker/clock/sequence still REFUSE stroke writes so no dead
`stroke` data is ever written to those kinds (regression-tested) — and changes nothing for
shape/text.

### D2 — no general "auto-create missing parent objects" rewrite

The guarded writes already create the missing parent object when absent
(`el.stroke ?? { color: '#000000', width: 0 }` spreads), so once the kind is allowed, a
hypothetical strokeless path would still work. A broader "any nested set creates its parent"
refactor of `writeStaticAnimatable` is NOT needed for this bug and would touch every kind's
semantics — declined as scope creep; noted here per the prompt's decide-in-design instruction.

### D3 — no runtime / export change needed

`@cg/template-runtime`'s scene-builder already renders path `fill`, `stroke`, `stroke-width`
and `stroke-dasharray` (and the animation applier already evaluates `stroke.*` tracks on
paths), so model writes flow to the preview, `.vcg`, and the single-file HTML export with no
further change. The E2E asserts the export carries all four edited values.

### D4 — B-052 stays a code + PRD fix (no spec delta)

The icon mapping is presentation detail below spec granularity; the OpenSpec delta covers
B-051 only. `layerTypeIcon` is exported so the mapping is unit-testable (a pure function —
matches the canvas feature's "pure helpers are what keep the doc honest" convention).
