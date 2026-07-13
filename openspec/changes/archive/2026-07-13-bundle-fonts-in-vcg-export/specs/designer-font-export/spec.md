# designer-font-export Specification

## ADDED Requirements

### Requirement: A `.vcg` export bundles the template's non-system font files

A `.vcg` export SHALL package the bytes of every font the scene references whose
bytes are obtainable (an operator-imported / starter-seeded `asset-*` font), writing
them into the package's `fonts/` directory via the `@cg/vcg-format` packer's `fonts`
byte map, and SHALL record each one in the manifest's `assetIndex` with `kind: 'font'`
so the bytes are addressable by `assetId`. The package's CSS SHALL declare an
`@font-face` for each bundled font that references it **from within the package**
(a package-relative URL), making no external, network, or `file://` request.

#### Scenario: A template using a non-system font ships the font bytes

- **WHEN** a template whose text uses a bundled (non-system) font is exported to `.vcg`
- **THEN** the package contains the font's bytes under `fonts/` AND the package CSS declares an `@font-face` for that family referencing the packaged file from within the package (no external or `file://` reference)

#### Scenario: The packaged font is addressable by asset id

- **WHEN** a font is bundled into the `.vcg`
- **THEN** the manifest's `assetIndex` carries an entry for it with `kind: 'font'` whose `path` locates the packaged bytes, so a host re-rendering the package resolves the face by `assetId`

### Requirement: A packaged font makes a content-driven crawl measure the correct width off-machine

A `.vcg` carrying its fonts SHALL render text with the correct face on a machine
where that font is NOT installed, so a content-driven ticker measures the true text
width and its crawl's one-pass duration — which is what ends the hold — matches the
authoring machine. Font resolution SHALL come from the package, never from a
system-installed copy.

#### Scenario: The crawl duration survives a machine without the font installed

- **WHEN** a `.vcg` containing a content-driven ticker runs on a machine WITHOUT that font installed
- **THEN** the text renders with the packaged font and the crawl measures the correct width, so the content-driven hold duration matches the authoring machine

### Requirement: A font that cannot be embedded is skipped, never fatal

A licensed / `system` font, or an `asset-*` font whose bytes are missing, SHALL be
skipped by the packager rather than blocking the export. The export SHALL still
succeed, packaging every font it can, and SHALL surface the un-bundled font as a
warning.

#### Scenario: A licensed/system font degrades gracefully

- **WHEN** a scene references a system font that cannot be embedded and is exported to `.vcg`
- **THEN** the export succeeds, that font's bytes are not packaged, and a warning names it

### Requirement: Packaging fonts leaves the package valid and the HTML export unchanged

A `.vcg` carrying fonts SHALL round-trip and validate (pack → verify → unpack), and
the single-file HTML export's behavior SHALL be unchanged (it already inlines fonts).

#### Scenario: The font-carrying package round-trips

- **WHEN** a `.vcg` containing bundled fonts is re-opened / verified / unpacked
- **THEN** it validates and the packaged font bytes are recovered intact

#### Scenario: Single-file HTML export is untouched

- **WHEN** a scene using a bundled font is exported as single-file HTML
- **THEN** the fonts are base64-inlined exactly as before this change
