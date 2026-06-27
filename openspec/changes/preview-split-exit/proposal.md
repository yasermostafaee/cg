# Split exit: animated "Out" vs quick "Stop" (coordinated exit) (D-105)

## Why

Today a single Stop conflates two intents and plays **uncoordinated**: the
background outro runs while the content (ticker / clock / sequence) is still
fully visible, then the content pops out at settle — which looks broken. This
mirrors the broadcast standard where the two intents are distinct (CasparCG
`CG STOP` = animate out, vs `CG REMOVE`/`CLEAR` = hard removal).

## What Changes

Two distinct exit operations, coordinated in the RUNTIME (so preview, exported
single-file HTML, and on-air all behave the same), surfaced as two preview
transport buttons:

- **"Out"** (animate off) — `runtime.out()`. Plays the graphic's designed exit
  COORDINATED: the content drivers animate out FIRST/with (a sensible default
  short opacity fade for a crawling ticker / a clock that has no authored exit),
  sequenced via promise so the background outro plays LAST — the background never
  closes over fully-visible content. The background's authored `[outPoint → out]`
  keyframes are respected; content-first / background-last is the DEFAULT when
  nothing is choreographed. Ends in the D-085 CLEARED terminal state.
- **"Stop" / "Clear"** (quick) — `runtime.stop()`. Halts + hides the content
  drivers IMMEDIATELY (the existing D-085 cleared behavior, tightened so content
  never lingers over the closing background), THEN plays the background's close
  animation, then settles cleared.
- **Transport UI** — an "Out" button alongside "Stop" in the preview transport,
  each a separate momentary command with an icon + a short tooltip making the
  difference clear.

## Capabilities

- `designer-playout-lifecycle` (MODIFIED): the preview transport gains a separate
  momentary **Out** command; a new requirement specifies the coordinated
  content-first / background-last animated exit (`out()`) vs the immediate-content
  removal then background close (`stop()`), both ending in the cleared terminal
  state.

## Impact

- `packages/template-runtime/src/runtime.ts` — add `out()` (animate content out →
  background outro → settle); tighten `stop()` to remove content immediately before
  the background outro; a per-scope content-fade aggregator reusing the D-104
  scope tree; expose `window.out` via the CasparCG globals adapter.
- `packages/template-runtime/src/ticker-driver.ts` / `clock-driver.ts` /
  `sequence-driver.ts` — a `fadeOut(durationMs)` returning a clock-driven promise
  (CSS opacity transition + a clock timeout); ensure an immediate hide for `stop()`.
- `apps/designer/src/renderer/features/fields/PreviewTransport.tsx` +
  `PreviewModal.tsx` + `PreviewFieldForm.tsx` (dispatch type) — the Out button +
  `out` dispatch; `apps/designer/src/platform/preview.ts` — the `out` message →
  `window.out()`.
- No schema change; no version bump.
