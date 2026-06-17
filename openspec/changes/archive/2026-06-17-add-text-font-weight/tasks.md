# Tasks — add-text-font-weight (D-044)

## 1. Designer (@cg/designer) — UI parity only

- [x] 1.1 `TextStyleSection.tsx`: add a `weight` `SelectField` (options `100`..`900`, value `String(element.font.weight)`) inline beside the font-family control (family → weight → size), committing via `designerStore.updateElement(id, { font: { ...element.font, weight: Number(w) } })`. Non-keyframable: `updateElement` (NOT `commitAnimatable`); no `KeyframeDot`. Import `SelectField` from `./controls.js`.
- [x] 1.2 Multi-select: NO change — font-weight stays single-select-only (not added to the shared-property model), consistent with font-family / alignment.

## 2. Tests

- [x] 2.1 `text-font-weight.test.ts` (jsdom): the text inspector renders the `weight` select (9 options 100..900) reflecting `element.font.weight`; committing a weight updates `element.font.weight` via `updateElement` with NO `font.weight` keyframe track; the control renders no keyframe diamond.

## 3. Gate + validate

- [x] 3.1 `pnpm turbo run typecheck lint test build --filter @cg/designer --force` (uncached) + `pnpm format:check`.
- [x] 3.2 `pnpm openspec validate add-text-font-weight --strict`.
