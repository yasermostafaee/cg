# runtime-template-library Specification (delta)

## ADDED Requirements

### Requirement: The library presents a template by its display name

The Runtime template Library SHALL identify a registered template to the operator by its
**display name** — the `.vcg` manifest's `name` — not by its raw `templateId`. The id
SHALL remain discoverable as secondary information on the row, so an operator can still
correlate a row with a served `/template/<id>` URL or a stack item's `templateId`.

The registry metadata (`TemplateInfo`) SHALL carry the name as an **optional** field,
populated at import from the manifest (falling back to the scene's name) and, for a
bundled starter, from the starter's label. Optionality is deliberate: a `TemplateInfo`
without a name SHALL remain valid and SHALL display exactly as it does today.

A template with **no usable name** — absent, or present but blank after trimming, which
the manifest schema permits — SHALL fall back to displaying its `templateId`. The Library
SHALL NEVER show an empty primary line.

The display name SHALL be presentation only: it SHALL NOT become an identity. The
`templateId` remains the sole key for the registry, the stack item's `templateId`, the
served template URL, and every lookup — the name is never matched, keyed, or routed on,
and it never reaches an AMCP command argument.

#### Scenario: An imported template's row shows its manifest name

- **WHEN** the operator imports a `.vcg` whose manifest carries a display name **THEN**
  the Library row shows that name as its primary line, with the `templateId` still visible
  as secondary information

#### Scenario: A bundled starter shows its label, not its id

- **WHEN** the template library is seeded from the bundled starter pack **THEN** each
  starter's row shows the starter's display label, not its raw id

#### Scenario: A template with no usable name falls back to the id

- **WHEN** a registered template has no name, or a name that is blank after trimming
  **THEN** its row shows the `templateId` as the primary line — never an empty line

#### Scenario: The name is display-only and changes no identity

- **WHEN** a named template is loaded onto the stack **THEN** the `stack.load` payload,
  the registry lookup, and the served template URL all still key on `templateId` —
  the display name reaches no AMCP command argument and no lookup key
