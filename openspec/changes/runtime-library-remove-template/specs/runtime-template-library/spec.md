# runtime-template-library Specification (delta)

## ADDED Requirements

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
