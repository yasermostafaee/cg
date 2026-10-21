# runtime-template-library Specification

## Purpose

TBD - created by archiving change import-vcg-template. Update Purpose after archive.

## Requirements

### Requirement: Import a `.vcg` template into the runtime library

The Runtime SHALL let the operator upload a `.vcg` file, verify it with
`@cg/vcg-format.verify` in the browser, and — on success — register it in the
template library so it can be loaded onto the stack with its field schema shown
in the Inspector. A package that fails verification SHALL register nothing and
surface a clear error. Verification and unpacking run in the renderer (the format
is isomorphic), so no Node APIs are imported into browser code.

The registered field schema SHALL be the template's **full field closure** — the entry
composition's own fields PLUS the fields of every nested composition instance,
namespaced by that instance's stable name — not the entry composition's flat fields
alone. A template whose fields live only inside a nested composition (the D-119 starter
shape: a graphic composition nested in a full-frame positioning composition) SHALL
therefore present those fields to the operator, not an empty form.

Verify, unpack and the single-file HTML export are local work in the browser; none of them
commands CasparCG. **Registration is CG Bridge's** (`CENTRAL-BRIDGE-01`, `B-294`): the bridge
keeps the library for every console, so an import SHALL reach it or not happen. With CG Bridge
unreachable the import SHALL be refused with a sentence that says nothing was imported and to
import it again once CG Bridge is back — never registered in this console alone to be delivered
later.

#### Scenario: A verified `.vcg` is registered

- **WHEN** the operator uploads a `.vcg` **THEN** it is verified
  (`@cg/vcg-format.verify`) and added to the template registry

#### Scenario: A registered template loads onto the stack with its fields

- **WHEN** a registered template is selected **THEN** it can be loaded onto the
  stack with its field schema in the Inspector

#### Scenario: A package that fails verification registers nothing

- **WHEN** a `.vcg` fails verification **THEN** the operator sees a clear error
  and nothing is registered

#### Scenario: A two-composition starter exposes its nested fields

- **WHEN** a starter whose editable fields live in a NESTED composition (a graphic
  composition nested inside a full-frame composition) is imported **THEN** the
  registered template's field schema includes those nested fields, grouped under the
  nested instance's namespace — the Inspector does NOT show "No fields."

#### Scenario: Nested field values seed and travel under the instance namespace

- **WHEN** such a template is loaded onto the stack **THEN** its field values are seeded
  as a NESTED value object keyed by the composition instance's stable name, and the
  `stack.load` / `stack.update` payload carries that same nested shape unchanged

#### Scenario: An import while CG Bridge is unreachable is refused

- **WHEN** the operator imports a valid `.vcg` while the SPA↔bridge WebSocket is down
  **THEN** the import is refused with a sentence that says nothing was imported, the Library
  is unchanged, and nothing is queued for later

### Requirement: The operator Inspector edits structured list fields without coercion

The Runtime operator Inspector SHALL edit a `list` (array) dynamic field — e.g. a
ticker's Data key — with a **structured items editor**, preserving the field value's
`ListItem[]` structure through display, edit, and the applied `stack.update`
payload. The editor SHALL preserve each item's stable `id` and any other (unknown)
fields, and SHALL support add / remove / reorder. Item text MAY span multiple
lines: the per-item editor SHALL be a multi-line control that preserves newlines in
an item's `text` on display AND when applied (lines are never joined/flattened),
and pressing Enter inside it SHALL insert a newline — never commit or submit. A
list value SHALL NEVER be rendered in a plain text input nor `String()`-coerced
(which produces `"[object Object]"`); a non-array value (including a legacy
`"[object Object]"` string) SHALL yield an empty items editor, not a corrupted text
field. Edits (item text, add, remove, reorder) SHALL stage locally and reach the
bridge ONLY when the operator applies the item (the Update button — see "The
operator Inspector stages edits"); the applied field value SHALL be the structured
array, so the `CG ADD` / `CG UPDATE` JSON carries real items, not a stringified
array.

#### Scenario: A list field renders an items editor, not "[object Object]"

- **WHEN** a stack item with a `list` field (e.g. a ticker's `_tickerTexts`) is
  selected **THEN** the Inspector renders an items editor (one editable multi-line
  control per item showing the item's text) and never displays `"[object Object]"`

#### Scenario: Editing an item preserves structure and ships structured JSON

- **WHEN** the operator edits an item's text (or adds / removes / reorders items)
  and then applies the item **THEN** the Inspector sends the value via `stack.update`
  as a structured `ListItem[]` array (each item keeping its `id` + other fields) —
  not a `String()`-coerced string — so the on-air `CG UPDATE` payload carries real
  items

#### Scenario: A non-array value does not corrupt the editor

- **WHEN** the field value is not an array (undefined, or a legacy stringified
  value) **THEN** the editor shows no items (ready to add) rather than a text input
  containing `"[object Object]"`

#### Scenario: A multi-line item survives editing (newline never flattened)

- **WHEN** the operator types a two-line item text — pressing Enter for the line
  break — and applies the item **THEN** Enter inserts a newline (it does not commit
  or submit), the applied `ListItem[]` carries the item's `text` with the `\n`
  intact, and the editor keeps displaying both lines (the lines are never joined)

### Requirement: The operator Inspector stages edits until an explicit apply

Inspector edits SHALL stage locally and SHALL NOT reach the bridge on change,
blur, or Enter. All field kinds stage — scalars, textareas, and list operations
(item text, add, remove, reorder). Enter in a textarea SHALL insert a newline;
Enter in a single-line input SHALL commit nothing.

The item's staged field-set SHALL be applied by an explicit control — the stack
row's Update button, with an equivalent apply control in the Inspector — as ONE
atomic `stack.update` carrying the complete field-set (no per-field sends). The
apply control SHALL remain usable even when nothing is staged, so an operator can
re-send unchanged values (the B-048 recovery workaround); staged state SHALL be
communicated by dirty markers, not by disabling apply.

Staged-but-unapplied state SHALL be visible: dirty fields carry a marker, a
Discard control reverts drafts to the last applied values, and a dirty item is
marked in the stack row so the operator sees that on-air values differ from the
draft. Drafts SHALL be per stack item and SHALL survive selection changes within
the session.

Take, Out, and Remove SHALL NOT apply drafts: Take plays the last applied values
and the item stays visibly dirty. Incoming stack-state pushes SHALL NOT clobber
in-progress drafts — an un-staged field follows the pushed value, a staged field
keeps its draft, and neither a push nor a commit re-mounts the editor (the first
click on a list control always lands; typing during a push never loses keystrokes).

#### Scenario: Edits stage and never reach air on blur or Enter

- **WHEN** the operator types in a field and blurs or presses Enter **THEN** no
  `stack.update` is sent, the on-air values are unchanged, and the field shows a
  dirty marker

#### Scenario: Update applies the whole staged set atomically

- **WHEN** the operator has staged several field edits and clicks Update **THEN**
  the Inspector sends exactly one `stack.update` carrying the complete field-set,
  the B-044 lifecycle settles the badge, and the dirty markers clear

#### Scenario: Discard reverts drafts to the applied values

- **WHEN** the operator has staged edits and clicks Discard **THEN** every field
  reverts to the last applied value and no `stack.update` is sent

#### Scenario: Apply is available with nothing staged (B-048 workaround)

- **WHEN** no edit is staged **THEN** the Update control still sends the item's
  current applied values (the operator's recovery path), rather than being disabled

#### Scenario: Drafts survive selection changes and are per item

- **WHEN** the operator stages an edit, selects another stack item, then returns
  **THEN** the draft is intact and unrelated items carry no draft

#### Scenario: Take does not apply a draft

- **WHEN** an item has a staged edit and the operator clicks Take **THEN** the last
  applied values play (not the draft) and the item stays visibly dirty

#### Scenario: A state push does not clobber an in-progress draft

- **WHEN** a stack-state push arrives while a field is staged **THEN** the staged
  field keeps its draft value, un-staged fields reflect the push, the editor does
  not re-mount, and the first click on a list add/remove/reorder control still lands

### Requirement: The operator Inspector edits nested-composition fields

The Runtime operator Inspector SHALL render a template's nested-composition fields as
labelled groups — one per composition instance, labelled by the instance's display label
(falling back to its namespace name) — with the entry composition's own fields rendered
at the top level as today. Groups SHALL nest to arbitrary depth.

An edit to a nested field SHALL stage, apply, and reach the wire through the SAME
staged-edit path as a flat field (R-003): it stages into the item's draft, applies as one
atomic `stack.update`, and arrives in the `CG UPDATE` data payload under the SAME nested
key (`{ instanceName: { fieldId: value } }`) that the template's binding resolves at
render. Two fields with the SAME id in different compositions SHALL remain distinct,
because each is addressed within its own instance namespace.

#### Scenario: Nested fields render as labelled groups

- **WHEN** the operator selects a stack item whose template has nested-composition fields
  **THEN** the Inspector shows a labelled group per composition instance containing that
  composition's fields

#### Scenario: A nested field edit round-trips to the wire under its binding key

- **WHEN** the operator edits a nested field and applies **THEN** the `stack.update`
  payload nests the value under the instance namespace, and the `CG UPDATE` data argument
  carries `{ "<instanceName>": { "<fieldId>": <value> } }` — the exact key the template
  runtime's binding reads, so the graphic re-renders with the new value

#### Scenario: Same-named fields in different compositions stay distinct

- **WHEN** two nested composition instances each declare a field with the same id
  **THEN** editing one does NOT change the other, because each value is addressed under
  its own instance namespace

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

### Requirement: Offline library reads degrade gracefully in the operator UI

The operator UI readers of the template registry SHALL read local state and SHALL NOT empty,
throw, or leave an unhandled promise rejection when the link is down. The stack row's
template-name join SHALL resolve names while disconnected (no `disconnected` early-return),
and the Inspector's field-schema fetch SHALL fall back to local/inferred fields rather than
producing an unhandled rejection when a lookup does not resolve.

#### Scenario: Stack rows keep their template names offline

- **WHEN** the link is disconnected **THEN** stack rows still show their template display
  names (the registry join is local), not "Unnamed template"

#### Scenario: The Inspector shows fields offline without an unhandled rejection

- **WHEN** a stack item is selected while the link is down **THEN** the Inspector shows the
  template's fields from local state (or the type-inferred fallback) and no unhandled promise
  rejection occurs

### Requirement: A Load refusal surfaces as a toast, not inline in the library row

The Library's Load control SHALL surface a Load refusal as the transient command toast (the
shared `commandFeedback` / `CommandErrorToast` overlay), and SHALL NOT render it as inline text
pinned inside the library row. This covers the bridge-down case, where Load stays bridge-owned
and refused. The refusal message wording is unchanged; only its placement moves out of the row's
layout flow, so a wrapped message cannot bloat or break the row. The Load button SHALL return to
its idle state rather than holding a persistent inline error.

#### Scenario: A refused Load shows a toast and pins nothing in the row

- **WHEN** the operator clicks Load on a library row and the command is refused (e.g. the
  bridge is unreachable) **THEN** the refusal message appears in the command toast, no inline
  error is rendered inside the row, and the Load button returns to idle

### Requirement: Remove a template from the library, refused while it is referenced

The Runtime SHALL let the operator remove a registered template from the library via a
per-row control on the Library row, confirmed before it acts (removal is destructive and
is not undoable — the package must be re-imported). A removed template SHALL disappear
from the Library and from `templates.list`, its registry entry (metadata AND retained
HTML) SHALL be dropped, and its served `GET /template/<id>` endpoint SHALL stop resolving.

Removal SHALL be **refused while any stack item references the template**, regardless of
that item's status. The bridge SHALL be authoritative for the refusal: it counts the
referencing items and returns a refusal carrying a reason and an operator-readable message
naming the count, and the UI SHALL surface that message rather than pre-judging the
outcome itself. Removing the referencing stack items (per-item Remove, or Remove-All) is
the unblock path.

The refusal is not a courtesy — it prevents an invisible break. Removing a referenced
template does NOT take the graphic off air (CasparCG has already fetched the
self-contained HTML), so nothing appears to go wrong; but the item's next out→take cycle
resolves against a missing template and the row can never be brought back. A referenced
template SHALL therefore never be removable, and the Library SHALL NEVER leave a silently
unloadable stack row behind.

Removal of an id that is not registered SHALL be refused with a distinct reason rather
than silently reporting success.

A removed template SHALL NOT be resurrected by reconnect-reconciliation. The client
retains each delivered import payload and re-delivers the set on every reconnect to heal
the bridge's in-memory registry; a confirmed removal SHALL prune that retained payload, so
a subsequent reconnect does not re-register what the operator deleted. A **refused**
removal SHALL leave the retained payload intact.

The offline mock SHALL apply the same predicate against its own stack, so removal behaves
identically with and without a live bridge.

#### Scenario: An unreferenced template is removed

- **WHEN** the operator removes a template that no stack item references **THEN** it
  disappears from the Library and from `templates.list`, and its retained HTML and served
  `/template/<id>` endpoint no longer resolve

#### Scenario: Removing a referenced template is refused with a reason

- **WHEN** the operator removes a template that a stack item references — whether that
  item is on air or merely idle/loaded — **THEN** the removal is refused, the template
  stays registered and loadable, and the operator sees a message naming how many items
  reference it and pointing at removing those items first

#### Scenario: Removing an unregistered template is refused, not silently accepted

- **WHEN** a removal names a `templateId` that is not registered **THEN** it is refused
  with a distinct reason rather than reporting success

#### Scenario: A removed template does not come back on reconnect

- **WHEN** a template has been removed and the client subsequently reconnects to the bridge
  **THEN** reconnect-reconciliation does NOT re-deliver it, and it stays absent from the
  library

#### Scenario: A refused removal keeps the template intact across a reconnect

- **WHEN** a removal is refused and the client subsequently reconnects **THEN** the
  template is still re-delivered and remains loadable — a refusal removes nothing

### Requirement: Each channel has its own template list

The Runtime SHALL keep one template list PER CASPARCG CHANNEL, over one shared store of template
versions (`CHANNEL-TEMPLATES-01`, the owner, 2026-09-28). Each channel is its own programme with its
own operator, who holds only that channel; a template may be listed on several channels, each at the
version that channel imported.

- **The picker** SHALL list the templates of the channel of the row it was opened from, and no other
  channel's. `Import a .vcg` and a `.vcg` dropped on the picker SHALL add the template to that channel
  only.
- **A re-import** (the same template id, new content) SHALL move that channel's list to the new version
  only; every other channel SHALL keep the version it lists until it re-imports. Rows on that channel
  follow the re-import as before (their next take serves the new version); rows on other channels do
  not.
- **The row's delete icon** SHALL remove the template from that channel's list only. Its accessible name
  SHALL read `Remove <name> from CH n`, and its confirm SHALL name the channel. It SHALL be refused while
  a row ON THAT CHANNEL holds the template (the in-use gate, per channel); a row on another channel does
  not refuse it.
- **Storage** SHALL hold one stored file per template version however many channels list it; importing
  the same package on a second channel SHALL reuse it. A version's file SHALL be removed only when no
  channel lists it and no row holds it — a row holds the version its page was last served from.
- **A page on air** SHALL never be touched by a list change: its version's file and its serve path SHALL
  keep serving the same bytes.
- **Permissions**: an import, a re-import and a removal SHALL each be judged by the station fence, the
  channel grant and a channel-scoped lock on the current channel only; nothing on one channel SHALL
  need another. A request that names no channel SHALL be judged on every channel it changes.
- **Source defaults** SHALL NOT be written by a template action: a re-import keeps the channel's
  defaults for every plate that still exists, and a default for a plate the new version no longer
  declares is ignored, never deleted; a removal leaves them in place.
- **The upgrade** SHALL list every template in the station's existing library on every declared
  channel, once, at the version it had, on the first load that has a channel to copy to; a second load
  SHALL copy nothing. A channel declared after that SHALL start with an empty list.

#### Scenario: Each channel's picker shows its own list

- **WHEN** the picker is opened from a row on CH 1 and then from a row on CH 2 **THEN** each lists that
  channel's templates only

#### Scenario: An import on CH 2 adds to CH 2 only

- **WHEN** a `.vcg` is imported from CH 2's picker **THEN** CH 2 lists it and CH 1's list is unchanged

#### Scenario: A re-import on CH 2 moves CH 2 alone, and both versions are served

- **WHEN** a template both channels list is re-imported on CH 2 **THEN** CH 2 lists the new version, CH 1
  keeps the old one, and each is served at its own path

#### Scenario: The same package on two channels is one stored file

- **WHEN** the same `.vcg` is imported on CH 1 and on CH 2 **THEN** one file is stored

#### Scenario: Removing from one channel keeps the file while another lists it

- **WHEN** a template is removed from CH 2 while CH 1 lists it **THEN** its file stays stored, and **WHEN**
  it is then removed from CH 1 with no row holding it **THEN** its file is deleted

#### Scenario: A row on the channel refuses its removal there

- **WHEN** a row on CH 2 holds a template and it is removed from CH 2 **THEN** the removal is refused
  `in-use`, naming that row, and nothing changes

#### Scenario: An operator holding CH 2 only needs nothing else

- **WHEN** an operator whose grant holds CH 2 only imports, re-imports and removes a template on CH 2
  **THEN** none of it is refused, and CH 1's list, rows, Source defaults and on-air page are unchanged —
  while the same acts on CH 1 are refused with the channel grant's sentence

#### Scenario: A page on air survives every act on another channel

- **WHEN** a page is on air on CH 1 and CH 2 imports, re-imports and removes the same template **THEN**
  the page's serve path returns the same bytes before and after

#### Scenario: Nothing disappears at the upgrade

- **WHEN** a station's existing library is loaded for the first time **THEN** every declared channel lists
  every template once, served where it always was; a second load copies nothing, and a channel declared
  later starts with an empty list

#### Scenario: A re-import keeps the channel's defaults and ignores a gone plate's

- **WHEN** a template is re-imported on a channel **THEN** no Source defaults are written: the channel's
  defaults for plates that still exist stay in force, and a default for a plate the new version no longer
  declares is kept and read by nothing

#### Scenario: The delete icon names its channel

- **WHEN** the picker is opened from a row on CH n **THEN** each row's delete icon's accessible name is
  `Remove <name> from CH n`, and its confirm is titled `Remove “<name>” from CH n?`

### Requirement: A console's template library is a display copy, and an import or a removal needs CG Bridge

The template library SHALL be CG Bridge's: one persisted library per bridge, the same for every
console connected to it (`CENTRAL-BRIDGE-01`, `B-294`). A console SHALL keep a DISPLAY copy in its
own browser-local, file-based storage (`@cg/storage`), written only after the bridge accepted an
import or a removal, so the Library, `templates.list`, `templates.get` and the offline stack's
template names keep answering while CG Bridge cannot be reached and across a page reload. The
display copy SHALL NEVER be sent to the bridge: no re-delivery on connect, no replay after a
reconnect.

An import and a removal SHALL need CG Bridge. With it unreachable the console SHALL refuse each
with a sentence that says nothing was changed and what to do, and SHALL change neither the
display copy nor anything queued — there is nothing queued. While live, the bridge's answer SHALL
stand: a `templates.get` the bridge answers `null` is `null`, whatever the display copy holds. The
on-air channels stay refused while the link is down, as before.

#### Scenario: The Library stays visible while CG Bridge is down

- **WHEN** the link drops, or the page reloads with CG Bridge down, while the Library holds
  templates **THEN** the Library keeps showing them and `templates.list` keeps returning them, and
  nothing is sent

#### Scenario: An import or a removal while CG Bridge is down is refused

- **WHEN** the operator imports or removes a template while CG Bridge cannot be reached **THEN**
  the console refuses it with a sentence saying nothing was changed, and the Library is as it was

#### Scenario: A connect delivers nothing

- **WHEN** the console connects or reconnects holding templates in its display copy **THEN** it
  sends no `templates.import` — control: the resync ran (it read the bridge's state)

#### Scenario: A bridge restart keeps the library from the bridge's own store

- **WHEN** CG Bridge restarts on its own files **THEN** every template is back before any console
  connects — control: a bridge on an empty store gets nothing from a reconnecting console

### Requirement: The operator SHALL set a countdown's target per row with the date and time control

CG Control's import SHALL mark a `text` field that drives a countdown's target — its own composition
binds it as `clock-target` to a countdown aimed at a time of day or a date and time — as that
countdown's target (`countdown`: the target kind and the author's After zero). The marker SHALL be
DERIVED from the template's bindings at import, never authored, and a marker the bindings do not
justify SHALL be removed. The Inspector SHALL offer the shared date and time control for a marked
field, per row, in place of a text box, staging its value through the Inspector's ordinary path: the
stored value is ISO with the console's offset, or `HH:mm[:ss]`, in every calendar.

On air, a target change SHALL be the row's existing `CG <channel>-<layer> UPDATE 0 "<json>"` and
nothing else — never a `PLAY`, a re-take, a `MIXER`, a `CLEAR` or any command the operator did not
cause. A row with no page on its layer SHALL send nothing: the change is state, and the next take
carries it in its `CG ADD` payload. A row that is loaded and not yet taken holds its page on the
layer already, so the same one `CG UPDATE` reaches that page and no playout command is sent.

A target already in the past SHALL be stated, never refused: `Target passed 12 min ago` followed by
the author's After zero in the operator's words (`holds at 00:00`, `counts past zero`, `digits
hidden`, `will close at once`), re-read every 15 s; the Take SHALL stay available. When the machine
CG Bridge runs on keeps another time zone than this console (`bridge.capabilities` reports its
clock; an older bridge reports none), both clocks SHALL be stated as facts.

#### Scenario: A marked field gets the control

- **WHEN** a template whose countdown target is bound to `targetTime` is imported and its row selected
- **THEN** `targetTime` is the date and time control, and its neighbouring text field stays a text box

#### Scenario: On air, a target change is the row's update and nothing else

- **WHEN** the operator changes the target of an on-air row and updates it
- **THEN** the only line on the layer is `CG 1-<layer> UPDATE 0 "{\"targetTime\":\"…\"}"`, and the row
  stays on air

#### Scenario: Off air, nothing is sent until the take

- **WHEN** the operator changes the target of a row whose page left the layer
- **THEN** nothing is sent, and the next take's `CG ADD` payload carries the new target

#### Scenario: A passed target is stated, not refused

- **WHEN** a row's target is twelve minutes past and the author chose Close the graphic
- **THEN** the Inspector reads `Target passed 12 min ago · will close at once` and Update stays enabled

### Requirement: An imported book is read as a book without a re-export

CG Control's import SHALL derive the template's field form, its page lists and its page from the package's scene after
`withPageLists`: every `list` field bound by `sequence-items` to a sequence whose items and whose default are all
pictures SHALL be a page list (marked `pages`, recorded in `TemplateInfo.pageLists`) even without a stored mark, and a
stepped picture sequence no field drives SHALL be given its page list (`pages-<elementId>`, the sequence's name). CG
Bridge reads the same record. A package already exported SHALL need only a re-import.

#### Scenario: telavat2.vcg imported as it is

- **WHEN** a package of `telavat2.vcg`'s shape (a key `a1` bound to 87 pictures, no `pages` mark, advance auto) is
  imported
- **THEN** `a1` is the template's page list, a book that stops at its ends, and the row reads `1 / 87`

#### Scenario: A book with no Data key

- **WHEN** the same book without a Data key is imported
- **THEN** the template has the page list `pages-<elementId>` labelled with the sequence's name

### Requirement: An import whose id the channel already lists asks Update or Add as a new template

When a `.vcg` is imported and the channel already lists a template with its package id, CG Control SHALL ask in the
Templates dialog's own message region — `“<name>” is already on this channel.` — with two answers: `Update “<name>”`
(the default, first and primary: the same template, its rows and Source defaults kept) and `Add as a new template` (a
new library id; the name takes ` (2)`, ` (3)`… when it would clash). Closing the dialog SHALL answer neither and
import nothing. The success line SHALL say which happened: `Updated · <name>` or `Imported · <name>`. A row already on
air SHALL keep the version its page was served from until its next `CG ADD` (CG Bridge's holds; unchanged). A
template added as new SHALL be rebuilt under its own library id when the console's runtime changes.

#### Scenario: Two compositions of one project side by side

- **WHEN** two packages with different ids are imported on one channel
- **THEN** both are listed and nothing is asked

#### Scenario: Add as a new template

- **WHEN** a package whose id the channel lists is imported and the operator answers Add as a new template
- **THEN** a second template is listed, named with ` (2)`, under its own id, and the line reads `Imported · <name> (2)`

#### Scenario: Update

- **WHEN** the operator answers Update
- **THEN** the channel still lists one template under that id, at the new version, and the line reads
  `Updated · <name>`

#### Scenario: Declined

- **WHEN** the dialog is closed while the question is open
- **THEN** nothing is imported

### Requirement: An import SHALL keep the verified package and the runtime that built its page

When CG Control imports a `.vcg`, it SHALL send the exact bytes it has just verified to CG Bridge before
the import. CG Bridge SHALL keep them by its own SHA-256 of the bytes received. The import SHALL name
that package only when CG Bridge answered the same hash, and SHALL name the template runtime that built
the page (`PageBuild`: CG Control's release and the page runtime fingerprint). A package CG Bridge
cannot keep (too large for one frame, refused, or answered with another hash) SHALL NOT fail the
import; the page is then simply not rebuildable.

#### Scenario: The verified bytes are kept

- **WHEN** an operator imports a `.vcg`
- **THEN** CG Bridge holds those exact bytes under their SHA-256, and the stored page names that hash and the runtime that built it, across a bridge restart

#### Scenario: A package that cannot be kept does not stop the import

- **WHEN** CG Bridge refuses the package or answers another hash
- **THEN** the template is imported as before and its page names no package

### Requirement: A console SHALL rebuild every page another runtime built, from the verified package only

When a console that may operate connects, it SHALL ask CG Bridge which listed pages were built by
another template runtime and have a kept package. Pages built by a newer CG Control release, pages
already waiting to be swapped in, and pages whose rebuild by this runtime failed SHALL NOT be
offered. For each page offered, the console SHALL read the kept package back, refuse it unless it
hashes to the package verified at import, and build the page through the import's own verify →
unpack → bake, keeping the operator's file name. A package that fails verification SHALL be reported,
never built.

#### Scenario: A runtime change rebuilds a page on connect

- **WHEN** a console whose runtime differs from the one that built a kept page connects
- **THEN** it rebuilds that page and CG Bridge lists the rebuilt page in its place

#### Scenario: The signature check still runs

- **WHEN** a kept package no longer passes `verify`
- **THEN** no page is built from it, the old page stays listed, and the failure is reported

### Requirement: A rebuilt page SHALL never land under a page on a layer

A rebuilt page SHALL be stored as a new version at a new serve path (`<templateId>~<version>`). While
an ADD of the old page is in flight, or any row holding it may have it live (on air, playing, updating,
exiting, unconfirmed, unverified, in error, disconnected, or not known), CG Bridge SHALL hold the
rebuilt page back and change nothing any channel's list names. A row that is `idle`, or `loaded` —
stopped with its page still on the layer, or cued — SHALL NOT hold it back (`RUN-NEXT-VERSION-02` Q11,
the owner). The first row change that frees the old page SHALL swap every list that names it over to
the rebuilt page. The old page SHALL stay stored and served while any row holds it, and a stopped row
keeps playing its resident page until its next ADD.

#### Scenario: An on-air page is not rebuilt until it is stopped

- **WHEN** a rebuilt page arrives for a template whose row is on air
- **THEN** the channel's list, the served path and the page on air are unchanged
- **AND WHEN** the row is stopped, its page still on the layer
- **THEN** the list names the rebuilt page at a new path, the stopped page is untouched and still served, and after a Clear the next take loads the rebuilt page

#### Scenario: A page on no layer is swapped at once

- **WHEN** a rebuilt page arrives for a template no row has on a layer
- **THEN** every list naming the old page names the rebuilt page at a new path

### Requirement: A failed rebuild SHALL keep the old page and tell the operator once

When a console cannot build a page, it SHALL report why. CG Bridge SHALL keep the old page listed,
record the failure on it, and SHALL NOT offer it again to the same runtime. The console SHALL tell the
operator once per pass, in one sentence naming each template, that it plays as before and must be
imported again.

#### Scenario: A failure is said once and not retried

- **WHEN** a rebuild fails
- **THEN** the old page stays listed, a failed `template-rebuild` audit row is written, the operator reads one sentence naming the template, and the same runtime does not try it again

### Requirement: The Library SHALL name, once, the templates that cannot be rebuilt

The template picker SHALL show one line, "Re-import these N templates" (or "Re-import 1 template"),
for the templates on its channel's list that this runtime cannot rebuild — imported before packages
were kept, or whose rebuild failed — each name isolated and its id only on hover. Nothing else about
those templates SHALL change: they stay listed and selectable, with no chip.

#### Scenario: An old template is listed once

- **WHEN** the picker opens on a channel that lists a template imported before packages were kept
- **THEN** one line names it, once, and the template is still listed

#### Scenario: Nothing to re-import, no line

- **WHEN** every page on the channel's list is current or rebuildable
- **THEN** no re-import line is shown

### Requirement: Every rebuild SHALL write one audit row

CG Bridge SHALL write one `template-rebuild` audit row per rebuild that takes effect, naming the
template and the old and new runtime, as the console that built it even when the swap lands during
another request. A failure SHALL write one `failed` row with the reason. The Log SHALL show the
releases (`0.11.6 → 0.12.0`) and carry the runtime fingerprints on hover.

#### Scenario: One row per rebuild

- **WHEN** a held-back rebuild is swapped in after its row is stopped
- **THEN** exactly one `template-rebuild` row records it, naming the template and both runtimes

### Requirement: An import refusal names the file and what is wrong, in the operator's words

An import of a `.vcg` that cannot be used SHALL be refused, registering nothing, with a sentence naming the file and
what is wrong in the operator's words, never the zip library's text. An empty file SHALL read
`"<file>" is empty (0 bytes); the export did not finish. Export it again from the Designer.`
A file that is not a readable package, holds no
CG template, or whose bytes changed since export SHALL read `"<file>" is damaged or not a CG template.`, with the
technical text written to the log only. A template whose page would not fit CG Bridge's frame SHALL be refused BEFORE
anything is kept or sent, with its size:
`"<file>" is too large for CG Bridge: its page is <N> MB, and one template can be at most 64 MB. Export it again from the Designer with fewer or smaller pictures.`
A template that parses wrong (it may be a newer build's) keeps its technical sentence.

#### Scenario: The owner's empty file

- **WHEN** the operator imports a `.vcg` of 0 bytes
- **THEN** nothing is registered, and the picker reads:
  `"telavat.vcg" is empty (0 bytes); the export did not finish. Export it again from the Designer.`

#### Scenario: A damaged file

- **WHEN** the operator imports a file that is not a zip, or a package cut short
- **THEN** the picker reads `"<file>" is damaged or not a CG template.`, the zip library's text is in the log, and
  nothing is registered

#### Scenario: A book too large for CG Bridge is refused with its size, and the bridge stays connected

- **WHEN** the operator imports a book whose page would be 180 MB
- **THEN** nothing is sent, the console stays connected to CG Bridge, and the picker reads:
  `"<file>" is too large for CG Bridge: its page is 180 MB, and one template can be at most 64 MB. …`
