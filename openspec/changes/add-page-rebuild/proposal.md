# Proposal — `add-page-rebuild` (`C-034`)

## Why

CG Control bakes every template's page at import, from its own bundled template runtime. A runtime
fix therefore reached a station only after every template was re-exported from the Designer and
re-imported into CG Control by hand. The next version carries many runtime fixes (`IMAGE-PAGES-01`,
`DESIGNER-FIX-02`, `PNG-SEQUENCE-IMPORT-01`, `AUDIO-ELEMENT-01`), and the trial build `0.11.6` is with
the client.

The owner chose (`DESIGNER-DECISIONS` Q23 (a), 2026-10-14): keep what each page was built from beside
the page, and rebuild the page from it when CG Control's template runtime changes.

## What changes

- **The import keeps its inputs.** CG Control sends the `.vcg` it has just verified to CG Bridge
  (`templates.source.put`), which keeps the bytes by its own SHA-256 beside the template records. The
  import names that package and the runtime that built the page (CG Control's release and a
  fingerprint of the runtime bundles, base CSS, font CSS and exporter shell revision).
- **CG Control rebuilds on connect.** A console that may operate asks CG Bridge which pages another
  runtime built (`templates.rebuild-plan`). It reads each kept package back (`templates.source.get`)
  and checks the bytes hash to the package verified at import. It then runs the import's own
  verify → unpack → bake and sends the page (`templates.rebuild`).
- **Nothing on air or loaded is touched.** A rebuilt page is a new version at a new serve path
  (`<templateId>~<version>`). While any row holding the old page is in any state but `idle`, or an ADD
  of it is in flight, CG Bridge stores the rebuilt page and holds it back. The first row change that
  frees the old page swaps every channel list over to the new one.
- **Failure keeps the old page.** A package that no longer verifies, or a bake that throws, is
  reported and recorded. The old page stays listed, and the same runtime does not try again.
- **Templates imported before this have nothing kept.** The Library names them once ("Re-import these
  N templates"). Nothing else changes for them.
- **One audit row per rebuild** (`template-rebuild`): the template's name and the old and new
  runtime. The Log shows `0.11.6 → 0.12.0`.
- **The operator is told once.** One confirmation names how many pages were rebuilt and which are
  waiting for their row to be cleared. One refusal (shown until dismissed) names the ones that could
  not be rebuilt.

## Impact

- `@cg/shared-ipc`: four channels, `PageBuildSchema`, `TEMPLATE_SOURCE_MAX_BYTES`, and the import's
  optional `build` and `sourceSha256`.
- `@cg/shared-schema`: the `template-rebuild` audit action and its `rebuild` detail.
- `@cg/single-file-export`: `pageRuntimeBuild` and `EXPORTER_SHELL_REVISION`.
- CG Bridge: the template registry (kept packages, the plan, the held-back swap), four routes, the
  channel scopes and the three route censuses.
- CG Control: the import, the rebuild pass on connect, the Library line and the Log clause.
- **No CasparCG command changes.** No installer changes: the rebuild runs in CG Control, which
  already bundles the runtime, so CG Bridge's staged contents are unchanged.
