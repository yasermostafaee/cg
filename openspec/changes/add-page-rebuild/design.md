# Design — `add-page-rebuild` (`C-034`)

## §0 — what was read before anything was built

Line numbers are those of the commit that carries this change unless a line says otherwise.

### 0.1 Where Import bakes the page

In CG Control, in the browser:

- `importVcgFile` (`apps/runtime/src/renderer/features/library/importVcgFile.ts:66`) calls
  `importTemplateFromBytes`.
- That calls `produceTemplateDelivery` (`templateDelivery.ts:207`), which runs `verify(bytes)`
  (`:211`), `unpack`, the `B-196` runtime shortfall check, and derives `TemplateInfo` from the scene.
- It then renders the self-contained page with `ExporterSingleFile`. The page is built from CG
  Control's OWN `cgJsIife`, `cgJsLottieIife`, `cgCss` and its bundled fonts (`fonts.css?inline`).
- The `cg.js` inside a `.vcg` is never served.
- The page and the info then cross the socket in one `templates.import` frame.

### 0.2 What was kept, and where

**CG Bridge's template store.** Per `CHANNEL-TEMPLATES-01` it is one shared, reference-counted store
of VERSIONS under per-channel lists:

- Before this change, each version record held exactly `{ info, html, importedAt, versionId,
serveKey }` (`tools/caspar-bridge/src/template-registry.ts`, `StoredVersion` at `:25`).
- Records live in `<stateHome>/.cg-runtime/bridge-templates/` (`bin/caspar-bridge.mjs:409`), one JSON
  file per version. The lists and holds live in `template-channels.json` beside them.
- The serve key is already `<templateId>~<versionId>`, where the version id is 16 hex of the SHA-256
  of the info and page (`B-293`). A new page therefore gets a new path by construction.

**The `.vcg` bytes were kept nowhere.** The bridge, the console's `LibraryStore` and `importVcgFile`
all dropped them.

### 0.3 How the `.vcg` is checked

- `verify` (`packages/vcg-format/src/verify.ts:40-47`) checks every file's SHA-256 against the
  manifest's `integrity` block and recomputes the Merkle root.
- An Ed25519 signature over that root is checked only when the caller passes `trustedPublicKeys`. No
  app passes them, and the packages are unsigned today.
- So the check an import runs is the integrity check. It is the same `verify(bytes)` call either way.

### 0.4 Can a page be rebuilt without weakening it? Yes — by keeping the verified bytes themselves

The re-derive-from-HTML route `C-034` first sized loses `manifest.integrity`, `signing` and
`minRuntimeVersion`, so its page could never be re-verified.

Keeping the whole verified `.vcg` loses nothing:

- The rebuild reads the kept bytes back and compares their SHA-256 to the hash recorded at import.
- It then calls the SAME `produceTemplateDelivery`, which runs `verify` first and the `B-196`
  shortfall check after.
- A page is therefore only ever rebuilt from bytes that pass exactly the check the import ran.
- If a signed package ever arrives with a trust root configured, the rebuild checks the signature
  exactly as the import would. Nothing about the check moved.

The owner's choice (Q23 (a)) was "keep the manifest — the scene and assets the page was built from".
The whole verified package IS that, plus what re-verifying needs. An extracted copy of the scene and
assets could not be verified again. **This is a choice made for the owner, recorded in the report.**

## Decisions

### D1 — the rebuild runs in CG Control, at connect — not in CG Bridge at start

- **The prompt asked for "at CG Bridge start, before the page is served".** The bake needs the
  template runtime bundle and the console's font files. CG Bridge has neither:
  - it depends on neither `@cg/single-file-export` nor `@cg/vcg-format`;
  - the fonts live in `apps/runtime/public/fonts`.
- **Moving the bake into CG Bridge would change what `stage-bridge.mjs` stages**, which needs an
  `[installers]` run, and this run forbids installers.
- **CG Control is where the template runtime lives.** "The running template runtime" is the
  console's, and pages are built by it.
- **So the rebuild runs when an upgraded CG Control first connects.** Until then, CG Bridge serves
  the page it has, which is exactly the page it served before the upgrade. Nothing is worse than
  before; the rebuild is an improvement that lands on the first connect.
- **The deviation is reported as a choice.**

### D2 — what "on air or loaded on a layer" means, and how it is detected

A row's `CG ADD` records a HOLD (`itemId → versionId`), and an ADD in flight PINS the version
(`caspar-runtime.ts:16477`). A rebuilt page waits while `#mayBeOnALayer` (`:14534`) answers yes. That
is when either:

- the old version is pinned; or
- any row holding it is in any state but `idle`. That covers on air, exiting, `loaded`, unconfirmed,
  error, or a row the stack does not know (not yet restored).

A STOPPED row settles to `loaded` (`reconciler.ts:789`, `B-053`) and its page stays on its layer, so
it waits too. Only `idle`, the layer emptied by a CLEAR or a removal, frees it.

The check is re-asked on every `item-changed` and `item-removed` (`:2399`) and after every ADD
settles. The first change that frees the old page swaps every channel list over to the new one.

The old page stays stored and served at its own path while any row holds it. That is
`CHANNEL-TEMPLATES-01`'s rule, unchanged.

### D3 — which runtime a page was built by

`PageBuild` has two parts:

- **`runtimeBuild`** is `pageRuntimeBuild(fontsCss)`: 16 hex of the SHA-256 of the shell revision, the
  runtime IIFE, the Lottie player, the base CSS and the font CSS. A pin test makes a shell change bump
  `EXPORTER_SHELL_REVISION`.
- **`consoleVersion`** is CG Control's release. A console never rebuilds a page a NEWER release built
  (`builtByNewer`), so two consoles on different patch releases cannot undo each other's pages. It
  fails open on an unreadable version.

### D4 — failures, legacy templates, and what the operator reads

- **A failed rebuild** is recorded on the old version (`rebuildFailed: { runtimeBuild, reason }`). The
  same runtime is never offered it again, and it joins the Library's re-import line.
- **A template with no kept package** is listed once per template in that line. Nothing else about it
  changes.
- **The operator reads:**
  - one confirmation per pass (how many; the held-back ones by name);
  - one refusal per pass, standing until dismissed, for the failures;
  - one Library line.

### D5 — sizes, frames and collection

- **Packages are kept in a separate frame** (`templates.source.put`) because the page already fills
  most of the import's frame, and the bridge's frame cap is 64 MB.
- **Packages over 44 MB are not kept.** The import proceeds, and the template is listed later.
- **A kept package is deleted** when no stored version names it, after a 30-minute grace for the
  import that follows its put.

## Risks

- A station whose rows are never cleared keeps the old page for those templates until they are. That
  is the hard stop working as intended; the confirmation names the held-back templates.
- After a CG Bridge restart, a held-back swap is forgotten. The next connect rebuilds that page again.
