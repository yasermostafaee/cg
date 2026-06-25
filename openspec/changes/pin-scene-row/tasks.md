# Tasks — pin the scene row while scrolling layers

## 1. Implementation

- [x] `TimelineDock.css.ts` — `sceneLane`: `position: sticky; top: 0; z-index: 3` (solid bg applied
      inline as TIMELINE_BG); `sceneLabel`: `position: relative; z-index: 3; willChange: transform`
- [x] `TimelineDock.tsx` — add `sceneLabelRef`; in `syncScroll` set the scene label's
      `translateY(+scrollTop)` to cancel `leftBodyInner`'s `translateY(-scrollTop)`
- [x] `TimelineDock.tsx` — attach `sceneLabelRef` to the `sceneLabel` row; give `sceneLane` a solid
      `background: TIMELINE_BG`
- [x] Preserve row height (`SCENE_ROW`), the reorder-indicator math, and the `clearSelection` onClick

## 2. Spec & docs

- [x] Extend `designer-animation-timeline` (ADDED: pinned scene row) — scenarios for "pinned both
      columns while scrolling" and "label stays aligned with its lane"
- [x] PRD `docs/prd/designer.md` — D-078 → `[~]`
- [x] `pnpm openspec validate pin-scene-row --strict`

## 3. Tests & gate

- [x] E2E: with enough layers to overflow, scroll the body down and assert (a) the scene row is at
      the top on both columns and (b) a given layer's left label and right lane share the same
      vertical position at scrollTop=0 and after scrolling
- [x] Full `@cg/designer` green gate (format:check + typecheck + lint + test + build)
