## MODIFIED Requirements

### Requirement: Remove a template from the library, refused while it is referenced

The Runtime SHALL let the operator remove a registered template from the library via a per-row
control on the Library row, confirmed before it acts (removal is destructive and is not undoable —
the package must be re-imported). A removed template SHALL disappear from the Library and from
`templates.list`, its registry entry (metadata AND retained HTML) SHALL be dropped, and its served
`GET /template/<id>` endpoint SHALL stop resolving.

> 🔴 **CORRECTED by `STALE-CLAIMS-02` §2 (2026-09-07) — the previous text named Remove-All as an
> unblock path, and TWO separate decisions had already falsified it.** `B-212` (2026-09-04) rebuilt
> this refusal so that **Remove-All is not mentioned at all**: the wording is one function
> (`describeTemplateReferences`), and each reference is offered its own remedy — _Show &lt;row&gt;_
> for an item a row displays, _Remove item_ for one no row shows. The owner had pressed Remove-All
> looking for two items on layers 60/61 that nothing on screen named. Then wave 1 of this change
> made Remove-All REFUSED while anything is on air, so in the case where the referencing item is
> live it is not a path at all. **The spec was the side that was wrong on both counts** — the code
> implements two deliberate, argued decisions and simply outran the document.
>
> ⚠ **CLEAR-ALL is NOT the substitute here, and this is the trap worth naming.** It is the
> sanctioned unblock for a blocked APPLY, and it is useless for THIS refusal: Clear-All leaves
> every row on the stack, so every reference survives it and the removal would go on being refused
> for ever. Task `1b.1` deleted the phrase _"the same unblock path R-010 uses"_ from
> `templates.ts` and `caspar-runtime.ts` for exactly this reason. The two remedies genuinely
> differ, and a reader who harmonises them re-introduces the bug.

Removal SHALL be **refused while any stack item references the template**, regardless of that
item's status. The bridge SHALL be authoritative for the refusal: it counts the referencing items,
returns a refusal carrying a reason, an operator-readable message naming the count, and the
LOCATION of each referencing item, and the UI SHALL surface that message rather than pre-judging
the outcome itself.

**The remedy SHALL be per-ITEM, and SHALL be named per reference rather than in the aggregate.**
Each referencing item SHALL be reachable from the refusal: an item a row displays SHALL offer a
way to that row, and an item no row displays SHALL offer its own removal, naming its layer. The
refusal SHALL NOT name a BULK control as the remedy — neither Remove-All, which is itself refused
while anything is on air, nor Clear-All, which empties air without dropping the rows and so leaves
every reference standing.

Where the remedy is a per-item removal that the bridge would itself refuse, the refusal SHALL say
so in the bridge's own words rather than offering an action that fails. An on-air item that sits
on a DECLARED OPERATOR ROW SHALL be taken off air first (STOP for a graceful outro, or CLEAR) and
then removed.

> ⚠ **AND THE EXEMPTION IS PART OF THE RULE, not an omission from it.** An item on a layer OUTSIDE
> the declared bank has no row, so there is no STOP and no CLEAR to press; `R-017`'s refusal
> therefore exempts it on a STRUCTURAL question about the slot, and the picker's per-item removal
> genuinely does work on air there — which is what keeps `B-212`'s own incident from having no
> remedy at all. This paragraph was drafted the other way round and corrected against
> `#removeRefusal` before it was written down: the exemption is measured behaviour, and a spec
> that flattened it would forbid the one path that incident left open.

The refusal is not a courtesy — it prevents an invisible break. Removing a referenced template
does NOT take the graphic off air (CasparCG has already fetched the self-contained HTML), so
nothing appears to go wrong; but the item's next out→take cycle resolves against a missing template
and the row can never be brought back. A referenced template SHALL therefore never be removable,
and the Library SHALL NEVER leave a silently unloadable stack row behind.

Removal of an id that is not registered SHALL be refused with a distinct reason rather than
silently reporting success.

A removed template SHALL NOT be resurrected by reconnect-reconciliation. The client retains each
delivered import payload and re-delivers the set on every reconnect to heal the bridge's in-memory
registry; a confirmed removal SHALL prune that retained payload, so a subsequent reconnect does not
re-register what the operator deleted. A **refused** removal SHALL leave the retained payload
intact.

The offline mock SHALL apply the same predicate against its own stack, so removal behaves
identically with and without a live bridge.

#### Scenario: An unreferenced template is removed

- **WHEN** the operator removes a template that no stack item references **THEN** it disappears
  from the Library and from `templates.list`, and its retained HTML and served `/template/<id>`
  endpoint no longer resolve

#### Scenario: Removing a referenced template is refused with a reason

- **WHEN** the operator removes a template that a stack item references — whether that item is on
  air or merely idle/loaded — **THEN** the removal is refused, the template stays registered and
  loadable, and the operator sees a message naming how many items reference it

#### Scenario: The refusal names each item's place, not a bulk control

- **WHEN** a removal is refused **THEN** every referencing item is named with its own location and
  its own remedy, and NO bulk control is offered as the way forward — not Remove-All, which is
  refused while anything is on air, and not Clear-All, which leaves every reference standing

#### Scenario: Removing an unregistered template is refused, not silently accepted

- **WHEN** a removal names a `templateId` that is not registered **THEN** it is refused with a
  distinct reason rather than reporting success

#### Scenario: A removed template does not come back on reconnect

- **WHEN** a template has been removed and the client subsequently reconnects to the bridge
  **THEN** reconnect-reconciliation does NOT re-deliver it, and it stays absent from the library

#### Scenario: A refused removal keeps the template intact across a reconnect

- **WHEN** a removal is refused and the client subsequently reconnects **THEN** the template is
  still re-delivered and remains loadable — a refusal removes nothing
