# Tasks — Ticker image/logo separator (D-039 ext)

## 1. Schema

- [x] 1.1 `@cg/shared-schema` `elements.ts` — add `TickerImageSeparatorSchema` (`kind:'image'`,
      `assetId`, `source`, `size:{w,h}`); widen `separator` to `string | image` (optional). No
      `CURRENT_SCHEMA_VERSION` bump, no migration.
- [x] 1.2 Round-trip tests (`tests/elements.test.ts`): an OLD string separator still parses; a NEW
      image separator parses + preserves fields; a malformed image separator (empty `assetId` /
      non-positive size) is rejected.

## 2. Runtime

- [x] 2.1 `ticker-driver.ts` — `TickerSeparatorImage` option (schema shape + resolved `url`);
      `separator` option widened. Feed an image separator as an `<img>` BETWEEN items only (D-081),
      vertically centred, at `size.w` (no measure). Stamp `data-cg-asset-id`/`-source`; set `src`
      from `url` when present. A SEPARATE image pool (`release` routes by tag) keeps `<img>` nodes
      out of the span pool. `cycleWidth` uses the separator width helper.
- [x] 2.2 `ticker-driver.ts` `populateTickerStaticRow` — render an image separator as an
      `<img data-cg-asset-id>` between items (the static authoring row; the host walk wires `src`).
- [x] 2.3 `runtime.ts` — resolve the separator's `url` from `options.assetUrls` and pass it to the
      driver (the one-time walk can't reach driver-fed nodes).
- [x] 2.4 `apps/designer` `preview.ts` — pass the current `assetUrls` to `createRuntime` so the live
      crawl's fed separators resolve in the preview too.
- [x] 2.5 Unit tests (`tests/ticker-driver.test.ts`): an image separator feeds an `<img>` between
      items (src/size/asset attrs), never leading/doubled/trailing (drain), carries
      `data-cg-asset-id` with no url, and survives recycles without polluting the span pool;
      `populateTickerStaticRow` puts an `<img data-cg-asset-id>` between items.

## 3. Inspector

- [x] 3.1 `TickerSeparatorControl.tsx` — Text/Image toggle; for Image, a combined picker over the
      project's assets AND the shared library (encoded `source:assetId`) + a size (w×h) box; wired
      into `StyleSection` `TickerSections`.

## 4. Export

- [x] 4.1 `image-export.ts` `collectImageElements` — collect a ticker's image separator as an
      `ImageRef` so export inlines its bytes and preflight reports a missing one.

## 5. E2E

- [x] 5.1 `tests/e2e/ticker.spec.ts` — set the separator to an image (a shared-library logo) in the
      inspector; the authoring canvas renders exactly 2 `<img>` separators between the 3 default
      items (between only, never trailing) and the size controls appear.

## 6. Gate

- [x] 6.1 Combined green gate (batched with D-084): `@cg/shared-schema` + `@cg/template-runtime` +
      `@cg/designer` `format:check` + `typecheck` + `lint` + `test` + `build` (turbo `--force`) —
      green (20/20 tasks; 223 + 393 + 547 unit tests; ticker + clock E2E pass).
