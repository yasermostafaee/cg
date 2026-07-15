# runtime-template-library Specification (delta)

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

## ADDED Requirements

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

On every (re)connection of the SPA↔bridge WebSocket, the Runtime SHALL deliver the
browser-local library's templates (each template's metadata + produced HTML) to the bridge
so the bridge can serve them to CasparCG when an on-air command later needs them. This
reconciliation SHALL generalize the existing reconnect re-delivery: the local library is
the retention set, and its entries are delivered BEFORE the stack/health/lock snapshot
re-pull (single-socket FIFO ordering), so a load issued right after reconnect resolves
against a populated bridge registry.

The conflict policy SHALL be **local-wins**: the browser library is the source of truth, so
reconciliation makes the bridge reflect it (delivering/overwriting the bridge's copies with
the local ones). A template registered locally while disconnected SHALL be delivered to the
bridge on the next connect without any operator action.

A confirmed **removal** SHALL NOT be undone by reconciliation (the removed template is no
longer in the local library, so it is not delivered); a **refused** removal SHALL leave the
template in the local library and therefore still delivered on reconnect.

#### Scenario: A template imported offline is delivered on reconnect

- **WHEN** a template is imported while the bridge is down and the link later comes up
  **THEN** the runtime delivers that template (metadata + HTML) to the bridge without
  operator action, so a subsequent on-air load of it resolves against a populated registry

#### Scenario: Re-delivery precedes the snapshot re-pull

- **WHEN** the link reconnects with a non-empty local library **THEN** every template
  re-delivery frame is sent before the stack / health / lock snapshot pulls

#### Scenario: A confirmed removal is not resurrected by reconcile

- **WHEN** a template is removed (confirmed) and the link later reconnects **THEN** the
  removed template is NOT re-delivered to the bridge, while every remaining template is

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
