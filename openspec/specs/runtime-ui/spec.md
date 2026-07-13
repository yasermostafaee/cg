# runtime-ui Specification

## Purpose

TBD - created by archiving change polish-runtime-controls. Update Purpose after archive.

## Requirements

### Requirement: Interactive controls express their state

The Runtime SHALL visibly express the interaction state of every interactive
control — buttons, text inputs, textareas, selects, checkboxes, and clickable
rows — across default, hover, active-pressed, visible focus-visible, and disabled.
Transitions between states SHALL NOT shift layout (the focus ring is drawn outside
the box model and busy/success/error affordances reserve their space). The dark
broadcast-console look and the sacred air-state colors SHALL be preserved.

#### Scenario: Hover, press, and focus are visible

- **WHEN** the operator hovers, presses, or keyboard-focuses a control **THEN** it
  shows a distinct hover, a pressed (active) state, and a visible focus-visible
  ring — with no layout shift between states

#### Scenario: A disabled control reads as disabled

- **WHEN** a control is disabled **THEN** it is visibly de-emphasized, shows a
  not-allowed cursor, and does not respond to hover or press

### Requirement: Bridge-round-trip buttons show async feedback

A button whose action is a bridge round-trip SHALL, on activation: give instant
pressed feedback; enter a busy state for the duration of ITS OWN request —
disabled and `aria-busy`, guarded against double-fire, showing a spinner (or a
static busy affordance under reduced motion) ONLY if the request exceeds ~150 ms
and, once shown, for at least ~300 ms; show a brief success affordance when the
request resolves accepted; and show a visible error beside the control (an
accessible message, never console-only) when the request is rejected or not
accepted. The busy state SHALL be keyed to the request's own acknowledgement,
decoupled from the longer-lived B-044 pending-update badge — a fast
acknowledgement MAY clear the button's busy while the stack badge is still
settling.

#### Scenario: A slow request shows busy, then success

- **WHEN** a bridge-round-trip button is activated and its request is still in
  flight past ~150 ms **THEN** the button shows a busy affordance (disabled +
  `aria-busy`), and on an accepted resolution shows a brief success affordance and
  returns to rest

#### Scenario: A fast local ack does not flicker

- **WHEN** the request resolves in well under ~150 ms **THEN** no spinner is shown
  (the pressed + success affordance is enough), avoiding a flicker

#### Scenario: A double click does not double-fire

- **WHEN** the operator clicks a busy button again **THEN** the second click is
  ignored while the first request is in flight

#### Scenario: A rejected command shows an error at the control

- **WHEN** a bridge-round-trip button's request is rejected or not accepted (e.g.
  the bridge link is down) **THEN** a visible, accessible error is shown beside
  that control (not only in the console)

#### Scenario: Button busy is decoupled from the stack badge

- **WHEN** an Update's acknowledgement clears the button's busy state **THEN** the
  stack badge MAY still show `UPDATING` until the B-044 lifecycle settles — the
  two signals are distinct and both legible

### Requirement: Status and badge states have a coherent visual language

The stack item badge SHALL render every status that exists — ON AIR, READY,
IDLE, UPDATING (transient), UNCONFIRMED, ERROR, EXIT, TAKING — plus the R-003
dirty-dot and `● draft` chip, each with an icon-plus-label (never hue alone) and
adequate dark-theme contrast. Connection/link indicators SHALL share the same
visual language.

#### Scenario: Every badge state is legible and distinct

- **WHEN** a stack item is in any status **THEN** its badge shows a colored icon
  and a word (never color alone), and the transient (UPDATING/TAKING),
  attention (UNCONFIRMED), and settled (ON AIR/READY/IDLE) states read as
  distinct

#### Scenario: Dirty state is visible

- **WHEN** an item has staged-but-unapplied edits (R-003) **THEN** a dirty-dot on
  the field and a `● draft` chip on the row + Inspector are shown in the dirty hue

### Requirement: Keyboard access and reduced motion are honored

All controls SHALL be keyboard reachable with a visible focus-visible ring, and
SHALL honor `prefers-reduced-motion`: when set, spinners and transitions are
replaced by a static busy affordance with no animation.

#### Scenario: Reduced motion replaces animation

- **WHEN** `prefers-reduced-motion: reduce` is set and a button is busy **THEN** a
  static busy affordance is shown instead of an animated spinner, and state
  transitions do not animate

### Requirement: The primary on-air action is labelled PLAY

The stack row's play action SHALL be labelled **PLAY** (display text and
`aria-label`), visually the primary on-air action distinct from the neutral and
destructive actions. The underlying intent, IPC channel, and API names SHALL be
unchanged.

#### Scenario: The play button reads PLAY

- **WHEN** the operator views a stack row **THEN** the play action reads "PLAY"
  and is styled as the primary on-air action, while it still dispatches the same
  take intent over the same channel

### Requirement: Server settings panel and Remove-All

The Runtime UI SHALL provide a server settings panel (opened from the status
bar) that edits the CasparCG connection: primary host / AMCP port / OSC port,
an optional backup section (add/remove backup), the redundancy strategy, and
the auto-failover toggle. The panel SHALL load the current values from the
bridge, refresh when any client applies a new config, validate its inputs
(non-empty host, integer ports in range) before submitting, and apply via
`connections.set-config`.

Apply SHALL be pre-disabled with a visible reason while the stack indicates
anything on air or unsettled (mirroring the bridge's authoritative gate), and
the panel SHALL surface the bridge's refusal reason when a race slips
through. WHEN any entered host is non-loopback the panel SHALL show a warning
that template serving and OSC listening will use a LAN address while control
stays on `127.0.0.1`, and SHALL confirm the actual exposure from the apply
response.

The stack panel SHALL provide a Remove-All control in its header (destructive
zone) that, after an explicit confirm, OUTs and REMOVEs every stack item —
clearing air and emptying the list — the sanctioned path to unblock a server
switch.

#### Scenario: Apply is gated on air with the reason shown

- **WHEN** any stack item is on air or unsettled **THEN** the panel's Apply
  is disabled and shows why (clear first / Remove All)
- **WHEN** the stack is clear **THEN** Apply is enabled and submits the
  edited config

#### Scenario: Remote host shows the exposure warning

- **WHEN** the operator enters a non-loopback primary or backup host **THEN**
  the panel warns about LAN exposure of template serve + OSC (control stays
  loopback) before Apply, and reports the confirmed exposure after

#### Scenario: Remove-All confirms, clears, and unblocks

- **WHEN** the operator invokes Remove-All and confirms **THEN** every item
  is OUTed and REMOVEd, the stack empties, and a previously blocked Apply
  becomes available
- **WHEN** the operator cancels the confirm **THEN** nothing is removed

### Requirement: Orphan-layer warning surface with per-layer Clear

The Runtime UI SHALL surface the bridge's orphan-layer set as a persistent
warning strip: one row per orphan naming the channel-layer ("Layer 1-60 is on
air but not on your stack"), rendered with `role="alert"`, visible while the
orphan persists (no auto-dismiss), and rendered NOT AT ALL when the set is
empty — no idle noise. The surface SHALL subscribe to the pushed orphan set
and load the initial state on mount.

Each row SHALL offer an explicit Clear control gated by a confirmation; on
confirm the UI issues `layers.clear` for that layer, surfaces a failure via
the command-error channel, and treats the row's disappearance (the bridge's
observed-empty resolution) as success. The UI SHALL never clear a layer
without the operator's explicit confirmation.

#### Scenario: Orphans appear and are named; idle is quiet

- **WHEN** the bridge publishes a non-empty orphan set **THEN** the warning
  strip appears naming each channel-layer
- **WHEN** the orphan set is empty **THEN** no warning surface is rendered

#### Scenario: Confirm-gated Clear

- **WHEN** the operator clicks a row's Clear and confirms **THEN** the UI
  issues `layers.clear` for exactly that layer, and the row disappears when
  the bridge resolves it on observed empty
- **WHEN** the operator cancels the confirmation **THEN** nothing is sent

### Requirement: Owned-slot occupancy warning surface without a direct Clear

The Runtime UI SHALL surface the bridge's owned-slot occupancy warnings as a
persistent warning strip DISTINCT from the R-009 orphan rows: one row per
warning naming the channel-layer AND the item it was raised for, rendered
with `role="alert"`, visible while the warning persists (no auto-dismiss),
and rendered NOT AT ALL when the set is empty — no idle noise. The surface
SHALL subscribe to the pushed warning set and load the initial state on
mount.

An owned-slot row SHALL offer NO direct Clear control — the remedy is
Out/Remove of the named item (the bridge refuses `layers.clear` on owned
layers), and the row text SHALL say so. The row disappears only when the
bridge resolves the warning (a CLEAR provably landing on the primary, the
item's removal, or a server reconfiguration).

#### Scenario: Warnings appear naming layer and item; idle is quiet

- **WHEN** the bridge publishes a non-empty owned-slot warning set **THEN**
  the warning strip appears naming each channel-layer and its item, with the
  Out/Remove remedy
- **WHEN** the warning set is empty **THEN** no owned-slot warning surface
  is rendered

#### Scenario: No Clear button on an owned-slot row

- **WHEN** an owned-slot warning row is rendered **THEN** it contains no
  Clear control (unlike an R-009 orphan row, whose confirm-gated Clear is
  unchanged)

#### Scenario: Out/Remove of the named item resolves the row

- **WHEN** the operator removes (or outs, with the CLEAR landing on the
  primary) the named item and the bridge publishes the resolution **THEN**
  the row disappears

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
