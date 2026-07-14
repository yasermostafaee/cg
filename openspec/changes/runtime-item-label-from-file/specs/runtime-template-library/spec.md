# runtime-template-library Specification (delta)

## MODIFIED Requirements

### Requirement: The library presents a template by its display name

The Runtime SHALL identify a registered template to the operator by a human **label** — never
by its raw `templateId` — on EVERY operator-facing surface: the Library card, the stack row,
and the Inspector header.

The label SHALL be resolved by one rule, in this order:

1. The **imported file name** (`TemplateInfo.sourceFileName`), cleaned for display: the
   `.vcg` extension stripped, `-` and `_` turned into spaces, and repeated separators
   collapsed. The cleaning SHALL **preserve case** — these names are routinely Persian or
   mixed Persian/English, and imposing a capitalization rule would corrupt them.
2. Else the **manifest/scene name** (`TemplateInfo.name`). A bundled starter has no source
   file and keeps its label.
3. Else the words **"Unnamed template"**. The label SHALL NEVER be the `templateId`: a UUID
   is not a name, and no surface SHALL show an empty primary line.

The file name takes priority because it is the one string the operator chose. The only human
name a `.vcg` carries is the entry COMPOSITION's — the export projection overwrites the scene
name with it, and the project name never enters the package — so the manifest name is
frequently a Designer-internal label, and (since `ManifestSchema.name` permits a blank) can
be empty.

The registry metadata (`TemplateInfo`) SHALL carry BOTH `name` and `sourceFileName` as
**optional** fields, populated at import — `sourceFileName` from the `File` the operator
picked, `name` from the manifest (falling back to the scene's), and for a bundled starter,
`name` from the starter's label. Optionality is deliberate and back-compatible: a
`TemplateInfo` carrying neither SHALL remain valid.

The raw `templateId` SHALL NOT be rendered as text on a row. It SHALL remain reachable as the
row's **tooltip**, so an operator or a developer can still correlate a row with a served
`/template/<id>` URL or a stack item's `templateId`.

The label SHALL be presentation only: it SHALL NOT become an identity. The `templateId`
remains the sole key for the registry, the stack item's `templateId`, the served template URL,
and every lookup — the label is never matched, keyed, or routed on, and it never reaches an
AMCP command argument. A stack item SHALL NOT carry a label of its own; the stack row resolves
it by joining `templateId` against the registry.

#### Scenario: An imported template is labelled by the file the operator picked

- **WHEN** the operator imports `news-lower-third.vcg` whose manifest name is a
  Designer-internal label such as "Comp 1" **THEN** its Library card, its stack row and the
  Inspector header all read `news lower third`, and none of them renders the `templateId`

#### Scenario: The cleaned file name preserves the operator's case and script

- **WHEN** the imported file is `زیرنویس-خبر.vcg` or `BBC-news_LOWER-third.vcg` **THEN** the
  label is `زیرنویس خبر` / `BBC news LOWER third` — separators become spaces and the
  extension is dropped, but the case is left exactly as the operator typed it

#### Scenario: A bundled starter shows its label, not its id

- **WHEN** the template library is seeded from the bundled starter pack **THEN** each
  starter's row shows the starter's display label — it has no source file to take priority

#### Scenario: A template with no file and no usable name is named in words

- **WHEN** a registered template has no `sourceFileName` and no name, or a name that is blank
  after trimming **THEN** every surface shows "Unnamed template" — never the `templateId`, and
  never an empty line

#### Scenario: The stack row and Inspector never fall back to a UUID

- **WHEN** a stack item's template declares no `title` field **THEN** its row and the
  Inspector header still show the template's label — NOT `item-<uuid>`, and NOT the raw
  `templateId`

#### Scenario: The id stays correlatable without being a label

- **WHEN** a developer needs to match a row to a served `/template/<id>` URL **THEN** the
  row's tooltip carries the `templateId`, even though no surface renders it as text

#### Scenario: The label is display-only and changes no identity

- **WHEN** a labelled template is loaded onto the stack **THEN** the `stack.load` payload,
  the registry lookup, and the served template URL all still key on `templateId` — the label
  reaches no AMCP command argument and no lookup key
