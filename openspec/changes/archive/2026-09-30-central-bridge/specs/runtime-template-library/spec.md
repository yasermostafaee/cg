## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: The template library is browser-local and survives disconnect and reload

**Reason**: `CENTRAL-BRIDGE-01` (`B-294`) — the library is CG Bridge's, one for every console; a
console's browser-local copy is for display only. Its surviving properties (visible across a
disconnect and a reload, reads never refused while down, the on-air channels still refused) are in
"A console's template library is a display copy, and an import or a removal needs CG Bridge"; the
removed one — import and removal served locally while the link is down — is reversed there.

### Requirement: The bridge is reconciled to the local library on connect

**Reason**: `CENTRAL-BRIDGE-01` (`B-294`) — a console re-delivers nothing. With several consoles on
one bridge, each console's library was a claim on the truth, and local-wins let a stale copy replace
a newer version and bring a removed template back after a bridge restart. The bridge persists its own
library (`templates.import` from an operator is the one way in) and refuses a frame marked
`redelivery`.

### Requirement: Removing a template is a local operation, refused only while referenced

**Reason**: `CENTRAL-BRIDGE-01` (`B-294`) — a removal is the bridge's, decided where the true stack
is; with CG Bridge unreachable it is refused, not served from the display copy against a last-known
stack. The refuse-while-referenced rule stands, in "Remove a template from the library, refused
while it is referenced".
