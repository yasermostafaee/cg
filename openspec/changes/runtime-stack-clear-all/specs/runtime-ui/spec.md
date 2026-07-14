# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: Clear-All takes every on-air item off air and keeps it on the stack

The stack panel SHALL provide a **Clear-All** control alongside Remove-All. Clear-All SHALL
take every ON-AIR item off air and SHALL LEAVE every item on the stack, idle and re-takeable.

The two controls SHALL remain distinct, because confusing them is expensive in opposite
directions:

- **Remove-All** clears air AND empties the list. Recovering means re-importing the templates
  and re-typing every staged field.
- **Clear-All** clears air ONLY. The rows stay exactly where they were.

Clear-All SHALL introduce **no new AMCP verb**. It SHALL issue, per on-air item, the SAME
`out()` the row's own Clear control sends — a `CLEAR <channel>-<layer>` on the urgent
(air-safety) lane — carrying the same CLEAR-destroys-the-producer semantics, so that a
subsequent take re-ADDs onto the item's still-reserved slot. Clearing SHALL be sequential, not
a command burst, and a per-item failure SHALL NOT abort the rest: a stuck item must never
strand the graphics behind it on air.

**Broadcast safety — Clear-All SHALL be per-LAYER and SHALL NEVER be per-channel.** It SHALL
clear ONLY the layers this application itself allocated, addressing each on-air item's OWN
slot (`CLEAR 1-10`, `CLEAR 1-20`, …). It SHALL NOT, under any circumstance, emit a
channel-level `CLEAR <channel>`: that command wipes the entire channel — including the
program / background signal this application does not manage, did not place, and must never
touch. Taking our graphics off air SHALL leave the program feed on air, unchanged.

It SHALL therefore iterate only the stack items that actually HOLD a slot. An item with no
slot holds no layer of ours; there is nothing for us to clear and **no command SHALL be sent
for it**. An empty stack SHALL send no AMCP command at all — the channel SHALL NEVER be used
as a shortcut for "clear everything".

"On air" SHALL be ONE predicate, shared by the row's Clear gating and by Clear-All: every
status except `idle` and `loaded`. A `loaded` item has been `CG ADD`-ed but never PLAYed, so it
has nothing on air to clear; an item whose true state is UNKNOWN (`unconfirmed`) IS clearable,
because that is precisely the item an operator most needs to be able to clear. Clear-All
therefore means exactly "press Clear on every row where Clear is enabled".

The control SHALL be absent when no item is on air — there is nothing to clear — while
Remove-All remains available, since the rows can still be dropped. Clear-All SHALL be
confirmed before it acts, and the confirmation SHALL state the outcome: the items come off air
and stay on the stack.

The `stack.clear-all` channel SHALL be implemented on BOTH backends — the real bridge and the
offline mock — so the mock cannot present a bulk action the bridge does not have.

#### Scenario: Clearing all takes the graphics off air and keeps every row

- **WHEN** the operator confirms Clear-All with two items on air and one merely loaded
  **THEN** both on-air layers receive a `CLEAR <channel>-<layer>`, all three items remain on
  the stack, the two cleared items settle to `idle`, and the loaded item is untouched

#### Scenario: The program feed survives Clear-All

- **WHEN** a producer this app does not manage is on air on a layer it never allocated (the
  program / background feed) and the operator confirms Clear-All **THEN** every AMCP command
  sent is a per-layer `CLEAR <channel>-<layer>` targeting only this app's own item slots, no
  channel-level `CLEAR <channel>` is sent, and the program feed remains on air with its
  producer unchanged

#### Scenario: An empty stack sends no command at all

- **WHEN** no item holds a slot and Clear-All runs **THEN** NO AMCP command is sent — the
  channel is never used as a shortcut for "clear everything"

#### Scenario: Clear-All is not Remove-All

- **WHEN** the operator confirms Clear-All **THEN** no item is removed from the stack — the
  list is the same length it was, and nothing needs re-importing to recover

#### Scenario: A cleared item can be taken again

- **WHEN** a cleared item is taken again **THEN** the bridge re-ADDs it onto its still-reserved
  slot (the CLEAR destroyed the producer, not the row) and it renders on air

#### Scenario: Clear-All is offered only when something is on air

- **WHEN** no stack item is on air **THEN** the Clear-All control is not shown, while
  Remove-All remains available

#### Scenario: The count names only what is on air

- **WHEN** the stack holds one on-air item and two that are idle or loaded **THEN** the
  confirmation names ONE item, not three

#### Scenario: The mock cannot drift from the bridge

- **WHEN** the parity guard compares the two backends **THEN** `clearAll` is present on both,
  and the bridge routes `stack.clear-all` to it
