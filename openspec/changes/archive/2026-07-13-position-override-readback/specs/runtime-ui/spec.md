# runtime-ui (B-072 — the picker shows what is actually applied)

## MODIFIED Requirements

### Requirement: Per-item position picker with an on-air lock

The Runtime UI SHALL offer a per-loaded-item position picker — a 3×3
anchor grid plus x/y pixel-offset inputs — in the item Inspector. The
picker SHALL seed from the item's APPLIED position override when the item's
published state carries one, and ONLY from the template's manifest default
position (retained at `.vcg` import; centered when the template declares none)
when it does not — the same precedence the on-air boot script applies
(override, else manifest default, else centered), so the picker always displays
what the graphic will actually do. It SHALL send an explicit operator apply to
the bridge over `stack.set-position` (one request per apply, never per
keystroke). A bridge refusal surfaces via the command-error channel.

The picker SHALL NOT keep a renderer-local store of applied overrides: the
displayed override comes from the item's published state, so it survives a
reselect, a page reload, and a reconnect, and it disappears when the item is
removed — without the UI tracking any of that itself.

Consequently, re-applying the displayed value on a re-selected item SHALL send
that item's applied override — NEVER the manifest default. (Before this
requirement the picker re-seeded from the default on every reselect, so an
innocent re-Apply silently overwrote a correct on-air position.)

The picker SHALL be LOCKED — disabled with the reason visible — while the
item is on air or unsettled (pending, playing, on-air, updating, exiting,
or unconfirmed), mirroring the bridge's authoritative refusal: position is
fixed once taken (Option A cannot reposition on air without a re-serve
flash). It SHALL be editable while the item is loaded-not-taken and while
idle.

#### Scenario: Seeds from the applied override

- **WHEN** an item whose published state carries a position override is
  selected **THEN** the picker shows that override's anchor and offset, not
  the template's manifest default

#### Scenario: Seeds from the manifest default when there is no override

- **WHEN** an item with no override, of a template with a `defaultPosition`,
  is selected **THEN** the picker shows that anchor and offset
- **WHEN** the template declares no default **THEN** the picker shows
  centered with a zero offset

#### Scenario: The override survives deselect and reselect

- **WHEN** the operator applies a position, deselects the item, and reselects
  it **THEN** the picker still shows the applied override

#### Scenario: Re-applying an unchanged reselected item does not revert it

- **WHEN** the operator reselects an item with an applied override and presses
  Apply without editing anything **THEN** the `stack.set-position` carries the
  APPLIED OVERRIDE — never the manifest default or centered — so the on-air
  position is not silently reverted

#### Scenario: An apply reaches the bridge once

- **WHEN** the operator picks an anchor, edits the offset, and applies
  **THEN** exactly one `stack.set-position` carries the chosen
  anchor+offset for that item

#### Scenario: Locked on air, editable otherwise

- **WHEN** the selected item is on air or unsettled **THEN** the picker's
  controls are disabled and the lock reason is visible
- **WHEN** the item is loaded-not-taken or idle **THEN** the picker is
  editable
