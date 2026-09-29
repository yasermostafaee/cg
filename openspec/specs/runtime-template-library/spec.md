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

Registration SHALL be a **local, browser-side** operation that does NOT require the
SPA↔bridge link. Verify, unpack, single-file HTML export, and registering the template in
the browser-local library are all local work; none of them commands CasparCG. Import
SHALL therefore succeed with the bridge process fully unreachable — the imported template
SHALL appear in the Library and be listed by `templates.list` immediately, and the
operator SHALL NOT see a "Bridge disconnected — command rejected" refusal for an import.

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

#### Scenario: Import succeeds while the bridge is unreachable

- **WHEN** the operator imports a valid `.vcg` while the SPA↔bridge WebSocket is down
  **THEN** the template is verified, unpacked, exported, and registered in the
  browser-local library, appears in the Library and in `templates.list`, and NO
  "Bridge disconnected — command rejected" error is shown — nothing was sent to CasparCG
  because a local registration sends nothing to CasparCG

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

### Requirement: The template library is browser-local and survives disconnect and reload

The Runtime template library SHALL be owned by **browser-local, file-based storage**
(`@cg/storage`), not by the bridge process, for the live backend. `templates.list`,
`templates.get`, `templates.import`, and `templates.remove` SHALL be served from this
local store and SHALL NOT be refused because the SPA↔bridge WebSocket is down — none of
these operations commands CasparCG.

The local library SHALL **persist** each registered template's metadata (`TemplateInfo`)
and its produced self-contained HTML, keyed by `templateId`, so the library survives a
page reload: a template imported in a previous session SHALL still be listed, displayed,
inspectable, and removable after reload, with the bridge fully down.

The library SHALL **survive a mid-session disconnect** without emptying: a disconnect
SHALL NOT clear the displayed library, and the library SHALL NOT require the link to
repopulate.

The transport guard that refuses commands while the link is down SHALL continue to refuse
the on-air channels (`stack.take` / `update` / `out` / `setPosition` / `load` /
`clearAll` / `removeAll`) — the narrowing applies ONLY to the library/registry channels,
which no longer round-trip the bridge to succeed.

#### Scenario: The library survives a mid-session disconnect

- **WHEN** the SPA↔bridge WebSocket drops while the Library holds templates **THEN** the
  Library keeps showing them, and `templates.list` keeps returning them

#### Scenario: The library survives a page reload

- **WHEN** the operator reloads the page after importing templates **THEN** the Library
  re-displays those templates from local storage, even with the bridge process down

#### Scenario: Registry channels are not refused while the link is down

- **WHEN** the link is `disconnected` and the operator lists, inspects, imports, or removes
  a template **THEN** the operation is served from local state and is NOT rejected, while an
  on-air command (Take / Update / Out) issued in the same state is STILL refused

### Requirement: The bridge is reconciled to the local library on connect

On every (re)connection of the SPA↔bridge WebSocket, the Runtime SHALL deliver the browser-local
library's templates (each template's metadata + produced HTML) to the bridge so the bridge can serve
them to CasparCG when an on-air command later needs them. This reconciliation SHALL generalize the
existing reconnect re-delivery: the local library is the retention set, and its entries are delivered
BEFORE the stack/health/lock snapshot re-pull (single-socket FIFO ordering), so a load issued right
after reconnect resolves against a populated bridge registry.

`CHANNEL-TEMPLATES-01` — the local library SHALL record the CHANNEL each template was imported on, and
each record SHALL be re-delivered to that channel only. A record written before the per-channel lists
SHALL be re-delivered naming no channel, which the bridge SHALL read as "restore this if no channel lists
it" and never as a replacement of a version a channel holds. A record for a channel the signed-in
principal does not hold SHALL NOT be sent. A record written before the per-channel lists that a removal
on ONE channel has acted on SHALL stay this browser's copy for every other channel (its offline list and
its PVW page), hidden on the channel that removed it, and SHALL NOT be re-delivered after that.

The conflict policy SHALL be **local-wins, per channel**: the browser library is the source of truth for
the channel a record names, so reconciliation makes that channel's entry reflect it
(delivering/overwriting that channel's copy with the local one). A template registered locally while
disconnected SHALL be delivered to the bridge on the next connect without any operator action.

A confirmed **removal** SHALL NOT be undone by reconciliation (the removed template is no longer in the
local library for that channel, so it is not delivered there); a **refused** removal SHALL leave the
template in the local library and therefore still delivered on reconnect.

#### Scenario: A template imported offline is delivered on reconnect

- **WHEN** a template is imported while the bridge is down and the link later comes up **THEN** the
  runtime delivers that template (metadata + HTML) to the bridge without operator action, so a
  subsequent on-air load of it resolves against a populated registry

#### Scenario: Re-delivery precedes the snapshot re-pull

- **WHEN** the link reconnects with a non-empty local library **THEN** every template re-delivery frame
  is sent before the stack / health / lock snapshot pulls

#### Scenario: A confirmed removal is not resurrected by reconcile

- **WHEN** a template is removed (confirmed) and the link later reconnects **THEN** the removed template
  is NOT re-delivered to the bridge, while every remaining template is

#### Scenario: Each record returns to its own channel

- **WHEN** a template was imported at one version on CH 1 and another on CH 2, and the bridge comes back
  with an empty registry **THEN** reconnect re-delivers each version to its own channel, and neither
  channel receives the other's

#### Scenario: A removal on CH 2 leaves a pre-change record on CH 1

- **WHEN** this browser's only copy of a template was written before the per-channel lists and the
  template is removed from CH 2 **THEN** CH 2 no longer lists it, CH 1 still lists it offline and PVW
  still has its page there, both survive a reload, and the record is not re-delivered on reconnect

### Requirement: Removing a template is a local operation, refused only while referenced

Removing a template from the library SHALL be served from the browser-local store and SHALL
NOT be refused because the SPA↔bridge WebSocket is down. The **refuse-while-referenced**
invariant (R-005) SHALL be preserved: a template SHALL NOT be removable while any stack item
references it, regardless of that item's status.

While the link is **live**, the bridge SHALL remain authoritative for the refusal (it holds
the true stack); a confirmed removal SHALL also drop the template from the local store. While
the link is **disconnected**, the refusal SHALL be evaluated against the last-known stack
snapshot — which is exact, because the bridge is the sole mutator of the stack and cannot
change it while unreachable — and an unreferenced template SHALL be removable offline.

#### Scenario: An unreferenced template is removed offline

- **WHEN** the operator removes a template that no stack item references while the bridge is
  down **THEN** it disappears from the Library and from `templates.list`, with no
  "Bridge disconnected" refusal

#### Scenario: A referenced template is still refused offline

- **WHEN** the operator removes a template that a (last-known) stack item references while the
  bridge is down **THEN** the removal is refused with the referenced-count message and the
  template stays in the library

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
