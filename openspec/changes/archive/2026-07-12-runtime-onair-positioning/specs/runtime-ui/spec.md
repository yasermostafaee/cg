# runtime-ui (R-011 — per-item position picker)

## ADDED Requirements

### Requirement: Per-item position picker with an on-air lock

The Runtime UI SHALL offer a per-loaded-item position picker — a 3×3
anchor grid plus x/y pixel-offset inputs — in the item Inspector. The
picker SHALL seed from the template's manifest default position (retained
at `.vcg` import; centered when the template declares none) and SHALL send
an explicit operator apply to the bridge over `stack.set-position` (one
request per apply, never per keystroke). A bridge refusal surfaces via the
command-error channel.

The picker SHALL be LOCKED — disabled with the reason visible — while the
item is on air or unsettled (pending, playing, on-air, updating, exiting,
or unconfirmed), mirroring the bridge's authoritative refusal: position is
fixed once taken (Option A cannot reposition on air without a re-serve
flash). It SHALL be editable while the item is loaded-not-taken and while
idle.

#### Scenario: Seeds from the manifest default

- **WHEN** an item of a template with a `defaultPosition` is selected
  **THEN** the picker shows that anchor and offset
- **WHEN** the template declares no default **THEN** the picker shows
  centered with a zero offset

#### Scenario: An apply reaches the bridge once

- **WHEN** the operator picks an anchor, edits the offset, and applies
  **THEN** exactly one `stack.set-position` carries the chosen
  anchor+offset for that item

#### Scenario: Locked on air, editable otherwise

- **WHEN** the selected item is on air or unsettled **THEN** the picker's
  controls are disabled and the lock reason is visible
- **WHEN** the item is loaded-not-taken or idle **THEN** the picker is
  editable
