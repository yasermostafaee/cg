# Preview blank until Play (D-087)

## Why

The Preview modal opens already painted: it shows the static frame 0 of the composition the
moment it loads. On air (CasparCG) and in the exported `.vcg`/HTML, a template after `CG ADD`
is **loaded but unpainted** — nothing shows until `CG PLAY` runs the intro. The preview
therefore diverges from the on-air/export pre-play state, which is misleading: the operator
sees a frame that the broadcast surface would never show before Play.

The runtime already models this correctly. `createRuntime` adds `body.cg-pending` (the stage
is hidden via `.cg-pending .cg-stage { visibility: hidden }`); `play()` removes it (reveal +
intro); a self-settle / `stop()` re-adds it (re-blank). The exported runtime keeps this. The
preview **deliberately defeats** it for the editor's benefit, in two places in
`platform/preview.ts` `#buildHtml`:

1. A CSS `!important` override that lifts `.cg-pending` (`opacity: 1`, stage `visibility:
visible`).
2. `applyScene` on boot removes `cg-pending` and calls `runtime.tick(0)` — rendering and
   revealing frame 0.

This was intentional so the **editor canvas** (which shares the very same `preview.ts`
harness) shows what the operator is building. The fix must keep the canvas visible while
making the **Preview modal** blank until Play.

## What Changes

- Add an optional `broadcast?: boolean` to the `preview.load` request (`PreviewLoadChannel`).
  `broadcast: true` means "render like the on-air/export runtime: stay in the native
  `cg-pending` blank state until `play()`". Absent / `false` keeps today's authoring
  behaviour (reveal frame 0 on load).
- Thread it into `Preview.load(scene, broadcast)` → `#buildHtml(scene, broadcast)`. When
  `broadcast` is set, `#buildHtml` (a) omits the `.cg-pending` CSS override and (b) gates off
  the boot-time `cg-pending` removal in `applyScene` (a `REVEAL_ON_LOAD` constant), so the
  body keeps `cg-pending` after `createRuntime`. `runtime.tick(0)` still runs but paints
  under the hidden stage, so the first Play is instant and correct. The transport's `play()`
  clears `cg-pending` natively (reveal + intro → hold); `stop()` re-blanks.
- The Preview modal (`PreviewModal.tsx`) passes `broadcast: true`. The editor canvas
  (`CanvasArea.tsx`) is unchanged (omits the flag → authoring reveal).
- The on-air / export runtime is **not touched** — it is already blank-until-play. Once
  playing, preview and export are byte-for-byte the same runtime, so they match.

## Impact

- Affected specs: **designer-playout-lifecycle** (ADDED requirement — the preview opens
  loaded-but-unpainted until Play; reuses the existing `cg-pending` lifecycle and the
  "preview matches the exported file" parity guarantee).
- Affected code: `@cg/shared-ipc` (`channels/preview.ts` — `broadcast` on the load request),
  `@cg/designer` (`platform/preview.ts`, `platform/createDesignerBridge.ts`,
  `renderer/features/fields/PreviewModal.tsx`). The bridge contract derives from the channel
  schema, so it updates automatically.
- Test impact: existing preview E2E that assert modal **stage** content before Play
  (critical-flow, ticker, repeater, regressions D-025, sequence) move those assertions to
  after Play — the new contract. `toHaveCSS` / `toHaveText` checks (regressions B-006,
  clock) read computed style / textContent regardless of visibility and are unaffected. A
  new E2E asserts blank-on-open + painted-after-Play + re-blank-on-Stop.
- Risk is low and contained: a presentation flag baked into the preview document; the runtime
  lifecycle and the export path are untouched.
