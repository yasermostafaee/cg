# tasks — designer-export-block-visible

## 1. The item

- [x] 1.1 `D-157` filed in `docs/prd/designer.md` with the owner's report, the task-0 measurement and
      acceptance shaped as scenarios; number reserved in the registry.
- [x] 1.2 `B-180` filed in `docs/prd/bugs-designer.md` — the invisible-overlap defect found while
      reading the geometry. **No tolerance added.**

## 2. The canvas mark

- [x] 2.1 `ErrorMarkOverlay` — plain props (`scene`, `issues`, `scale`), rendered inside the
      `canvas-surface` frame box, one absolutely-positioned mark per offending element.
- [x] 2.2 Element rects resolved through the SAME `flattenElements` the preflight uses.
- [x] 2.3 The `danger` token, plus a shared-`Icon` badge and an `aria-label`/`title` carrying the
      issue's own message. `pointer-events: none`.
- [x] 2.4 `issues` threaded to the canvas from the existing `useIssues` output.

## 3. The Export control

- [x] 3.1 Error-blocked buttons keep `aria-disabled` and stay operable.
- [x] 3.2 A press opens the Issues panel and selects the offenders.
- [x] 3.3 The unreachable `window.alert` is REMOVED; the tooltip names the count and first offender.
- [x] 3.4 `!hasComp` keeps a genuinely `disabled` control with its own honest title.
- [x] 3.5 `issuesOpen` lifted from `StatusBar` local state to the store, so the panel can be opened
      from the control that was refused.

## 4. Tests

- [x] 4.1 🔴 A fixture with two plates overlapping by EXACTLY 1 px — the rule fires for BOTH
      elementIds AND the canvas marks both, in ONE test for the same fixture.
- [x] 4.2 The same shape for a plate partly off-frame.
- [x] 4.3 🔴 The positive control: a clean composition marks nothing.
- [x] 4.4 The blocked Export's surface NAMES the offender — not merely that it is blocked.
- [x] 4.5 E2E mapping the scenarios.

## 5. Gate

- [x] 5.1 `pnpm gate` green, uncached.
- [x] 5.2 `CG_GATE_HOOK_E2E=1` run locally once before push.
- [ ] 5.3 🔴 Linux `gate:e2e` OWED — evidence below. A ticked box with no URL is a claim.

### The `gate:e2e` discharge

- Run URL: _(not yet discharged)_
