# runtime-ui — the from-file affordance becomes an authored opt-in

## MODIFIED Requirements

### Requirement: A text-carrying field can take its value from a text file (manual reload)

The Inspector SHALL offer a "from file" affordance on a text-carrying field (text / multiline /
list) **when, and only when, the template's AUTHOR granted that field a file source**. The kind
test is the OUTER condition and the authored grant is the inner one: a field whose kind cannot
take file content can never be granted, and a field whose kind can take it renders the affordance
only if it was granted. A field that was not granted SHALL render no from-file control at all —
not a disabled one, and not a hidden one that still reads a file.

Absence of the grant is OFF. A field authored before the grant existed therefore offers no
from-file control until its template is re-exported with the box ticked.

The absence of the template SCHEMA is NOT the absence of a grant. While the Inspector has not yet
resolved the template (or the registry does not know it), the affordance SHALL NOT render — and
NOTHING SHALL be deleted on the strength of that silence.

When the operator picks a text file, its content becomes the field's value through the EXISTING
field-update path — staged like a hand edit on pick, and re-read + re-applied on an explicit
RELOAD. The file is an input method for field values, never a second content pipeline.

Content is VERBATIM: never trimmed (split mode's per-entry trim is the one opt-in exception),
never digit-normalized (numeric-input normalization is for typed numeric fields, not broadcast
copy), never otherwise transformed — UTF-8 Persian/RTL content survives byte-for-byte.

By DEFAULT split is OFF and the ENTIRE file content is the value: on a `list` field it becomes
ONE item's text, so a ticker crawl renders the typist's own embedded separators exactly as
typed. With SPLIT enabled the operator defines a free-text delimiter (sensible suggestions
offered; `\n` means one entry per line) and the content splits into a list value — entries are
trimmed and entries empty after trimming are SKIPPED. The split default is per-TARGET, resolved
from the scene's bindings at import: a field consumed by a SEQUENCE defaults split ON; a field
consumed by a ticker — or whose consumer is unknown or ambiguous — defaults OFF (verbatim is
the safer default) and the operator can flip it. While split is OFF on a list field the UI
SHALL say explicitly that the whole text becomes ONE item.

If the file is missing or unreadable at (re)load, the CURRENT value SHALL be KEPT — nothing is
staged or applied — and the operator SHALL see a legible error naming the file. Where the
browser cannot provide a re-readable file handle (no File System Access API), the affordance
SHALL degrade to a disabled control with a legible reason — never a broken control.

When a field that HAS a file attached loses its grant, the attachment SHALL be DETACHED —
from the live store and from durable storage — rather than kept live behind a hidden control.
The detach SHALL be driven only by a POSITIVELY RESOLVED template schema that declares the
field without the grant.

#### Scenario: An un-granted field offers no from-file control

- **WHEN** the template declares a text / multiline / list field WITHOUT the authored file-source
  grant **THEN** the Inspector renders that field's normal editor and no from-file control —
  no button, no chip, no split row

#### Scenario: A granted field behaves exactly as every eligible field did before

- **WHEN** the template declares a text / multiline / list field WITH the grant **THEN** the
  from-file control renders and behaves identically to the pre-opt-in affordance: pick, stage,
  reload, split defaults, delimiter picker, list-footer placement and the unsupported-browser
  degrade are all unchanged

#### Scenario: A kind that cannot take file content is never granted

- **WHEN** a field is of a kind that cannot carry file content (number, colour, boolean, image,
  select) **THEN** the grant cannot be expressed on it at all, and the Inspector renders no
  from-file control — the flag is un-settable rather than settable-and-ignored

#### Scenario: An unresolved schema deletes nothing

- **WHEN** the Inspector has not yet resolved the template, or the registry does not know it,
  **THEN** no from-file control renders AND no existing attachment is detached — silence on the
  schema channel is not evidence that a grant was revoked

#### Scenario: Losing the grant detaches an existing attachment

- **WHEN** a resolved template declares a field WITHOUT the grant and that field has a file
  attached from a previous session **THEN** the attachment is removed from the live store and
  from durable storage, so it can neither feed content nor return pre-armed if the grant is
  later restored

#### Scenario: Whole-file verbatim is the default, staged like a hand edit

- **WHEN** the operator chooses "from file" on a granted text field with split OFF **THEN** the
  entire file content is staged as the field's draft value verbatim, and applying with Update
  sends it through the normal `stack.update` — a live item updates exactly as a hand-edited
  field would

#### Scenario: A ticker's list field with split OFF becomes ONE item

- **WHEN** the target is a granted `list` field with split OFF **THEN** the staged value is a
  single item whose text is the entire file content, so a crawl renders the typist's own
  embedded separators exactly as typed, and the UI states that the whole text becomes ONE item

#### Scenario: Split ON produces a trimmed list, empties skipped

- **WHEN** the operator enables split and defines a delimiter **THEN** the content splits into
  a list value with one item per entry, entries trimmed, and entries empty after trimming
  skipped
- **WHEN** the field's sole consumer is a SEQUENCE **THEN** split defaults ON; **WHEN** the
  consumer is a ticker, unknown, or ambiguous **THEN** split defaults OFF

#### Scenario: RELOAD re-reads the file and re-applies the field

- **WHEN** the operator triggers RELOAD **THEN** the file is re-read (each reload sees the
  file's CURRENT content) and the field re-applies through the same `stack.update` path the
  Update button uses, scoped to this field — the operator's unrelated staged edits are not
  carried to air

#### Scenario: Persian/RTL content survives verbatim

- **WHEN** the file holds UTF-8 Persian/RTL content — including Persian digits — **THEN** the
  value is byte-for-byte identical to the file content: no digit normalization, no trimming,
  no transformation

#### Scenario: A missing or unreadable file keeps the current value

- **WHEN** a reload's read fails (file deleted, share unavailable) **THEN** nothing is staged
  or applied — the current, possibly on-air value is KEPT — and a legible error naming the
  file is shown at the field and via the command-error channel

#### Scenario: No File System Access API — legible degrade

- **WHEN** the browser lacks `showOpenFilePicker` **THEN** a GRANTED field's from-file control
  renders disabled with the reason visible — never a broken or silently absent control
