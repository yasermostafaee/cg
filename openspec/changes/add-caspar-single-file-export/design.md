## Decisions

- **Single-file is a second exporter, not a replacement.** The `.vcg` (multi-file
  zip, strict CSP) targets the project's own Runtime over http; the single file
  (everything inlined, classic IIFE script, permissive CSP) targets a `file://`
  drop into CasparCG `templates/`. The `.vcg` `index.html` deliberately uses ESM +
  `fetch`, which does not run over `file://` — hence a separate output.
- **One runtime source, two bundle formats.** Add an IIFE build of
  `@cg/template-runtime` for the inlined file; the preview and `.vcg` keep the ESM
  bundle. Same TypeScript, so "don't duplicate render/runtime code" holds.
- **GDD now, OGraf later.** Current CasparCG clients consume GDD; OGraf's graphics
  definition is v1-stable but its control API is still draft. Put the generator
  behind a `SchemaExporter` interface so `ograf.ts` can be added later without
  touching the exporter.
- **CSP / CEF.** The inlined file needs inline script/style and `font-src data:`,
  so it can't use the strict `.vcg` CSP — use a permissive policy (or omit the
  meta CSP for `file://`) with a comment. Keep CSS within common CasparCG CEF
  builds (63/71/117) with a comment; if targeting 2.3.x (CEF ≈ 71) verify the IIFE
  output JS (no top-level await, no very new syntax).

## Risks

- **AMCP load/update sequence.** Loading via `PLAY [HTML]` + `CALL`/`CG INVOKE`
  does not pass data (this repo's `docs/adrs/0006-…` spike); the working path is
  `CG ADD … "{data}"` + `CG UPDATE` (UPDATE is the only data-bearing CG command;
  INVOKE takes no parameters). `CG UPDATE` too soon after load can return `403` —
  allow a brief readiness window / retry on the controller side.
- **Auto-remove after stop.** Whether CasparCG auto-removes after `stop()` is
  version-dependent — verify against the target build and comment it.
- **Font weight.** Base64 fonts can bloat the file; embed only weights/styles the
  scene actually uses.
