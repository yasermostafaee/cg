## ADDED Requirements

### Requirement: Self-contained, file://-safe CasparCG HTML export

The Designer SHALL provide a "Download HTML" action that exports the current
composition as a single `.html` file suitable for CasparCG's `templates/`
directory. The file SHALL inline all CSS and JavaScript, embed images as base64
data URIs and fonts as base64 `@font-face`, and contain no external references or
runtime `fetch`. It SHALL load the shared `@cg/template-runtime` as a classic
(non-module) script so it runs over `file://`, install the global
`play/update/stop/next/remove` functions, render on a transparent background at
the composition resolution, and not auto-play. The render and runtime code SHALL
be the same source used by the preview, so preview behavior equals exported-file
behavior. The existing `.vcg` exporter SHALL remain unchanged.

#### Scenario: One self-contained file with no external references

- **WHEN** the operator clicks "Download HTML"
- **THEN** one `.html` downloads with all CSS, JS, images (base64) and fonts
  (base64) inlined and no external references

#### Scenario: Runs standalone in a browser

- **WHEN** the exported file is opened directly in Chrome and `window.update({…})`
  then `window.play()` are called (in either order)
- **THEN** there are no console errors and the text updates and animates

#### Scenario: Plays under CasparCG AMCP

- **WHEN** the file is loaded as a CasparCG template and
  `CG <ch>-<layer> ADD <cg> "<name>" 1 "{data}"`, `CG … PLAY`, `CG … UPDATE`,
  `CG … STOP` are issued
- **THEN** the graphic plays, shows the ADD data, updates on UPDATE, and exits on
  STOP, and `CG … NEXT` is a safe no-op for a single-step template

#### Scenario: Preview equals export

- **WHEN** a composition is previewed and then exported
- **THEN** the exported file's render and animation match the preview (shared
  runtime source)

### Requirement: Embedded GDD schema generated from dynamic fields

The exported file SHALL embed, inside `<head>`, a
`<script name="graphics-data-definition" type="application/json+gdd">` block whose
content is a JSON-schema object generated from the composition's dynamic fields.
It SHALL contain one `properties` entry per dynamic field keyed by field id, with
`type`/`gddType` mapped by field type (text → string with `single-line` or
`multi-line`; number → number; color → string `color-rrggbb`; boolean → boolean;
select → string with `enum`), including `minLength`/`maxLength`/`pattern`/
`default`/`minimum`/`maximum` when set, every required field in the top-level
`required` array, and `gddPlayoutOptions.client` with `dataformat:"json"`,
`steps`, and `duration` (the active-range length in milliseconds, or `null` for
manual out). The runtime's `update()` SHALL consume data shaped exactly like the
schema (`{ "<key>": value, … }`). The generator SHALL sit behind a pluggable
interface so an alternative schema exporter can be added without rewriting the
HTML exporter.

#### Scenario: Two text fields produce a valid GDD

- **WHEN** a composition has text fields `f0` (required) and `f1` and is exported
- **THEN** the embedded GDD parses as a valid JSON-schema object whose
  `properties` lists `f0` and `f1` as strings with their `gddType` and
  constraints, and whose top-level `required` array contains `f0`

#### Scenario: Field constraints carry into the schema

- **WHEN** a dynamic field sets `maxLength` and `pattern`
- **THEN** the matching GDD property includes those exact JSON-schema keys
