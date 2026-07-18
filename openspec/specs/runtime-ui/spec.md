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

### Requirement: Right-click opens a row's own actions

An operator SHALL be able to reach a row's actions by right-clicking it — a stack row offers
its playout actions (play, update, clear, remove), a library row offers its template actions
(load, remove). The browser's own context menu is suppressed across the operator surface (its
entries navigate away from a running show), so right-click MUST either open the app's own menu
or do nothing; it SHALL NOT leave the operator with browser chrome over a playout console.

The menu is an **alternate entry point**, never a new capability. For every item:

- it SHALL be disabled exactly when the equivalent button on that row is disabled, including
  the link-down refusals — a menu MUST NOT offer a command the row's own button refuses;
- choosing it SHALL run the same action the button runs, with the same effect — there SHALL NOT
  be a second command path for the same action;
- a refusal SHALL reach the operator with the same wording the button's refusal produces, on
  the transient command surface rather than pinned inline.

Right-clicking a row SHALL NOT change the selection: the menu acts on the row that was pointed
at, and must not silently retarget the Inspector under the operator's staged edits.

The menu SHALL dismiss on an outside click, on Escape, on scroll, and after running an action.
It SHALL be positioned fully within the viewport even when opened at an edge, and it SHALL be
navigable and dismissable from the keyboard, with disabled items skipped rather than focused.

Fields the operator TYPES in — text inputs, textareas, and rich-text hosts — are EXEMPT from
the native-menu suppression: cut/copy/paste and the browser's BiDi/spelling services are
editing affordances the Persian copy workflow depends on, and none of the dangerous native
entries apply inside a focused text box.

#### Scenario: A stack row offers its own actions on right-click

- **WHEN** the operator right-clicks a stack row
- **THEN** a menu opens listing that row's play, update, clear and remove actions

#### Scenario: A library row offers its own actions on right-click

- **WHEN** the operator right-clicks a library template row
- **THEN** a menu opens listing that row's load and remove actions

#### Scenario: A menu item is disabled exactly when its button is

- **WHEN** a row's action button is disabled for any reason — including the bridge link being
  down for the on-air verbs and for removing a stack item
- **THEN** the matching menu item is disabled too, and choosing it does nothing

#### Scenario: A menu action runs the row's own handler

- **WHEN** the operator chooses an enabled menu item
- **THEN** the row's existing action runs, with the same effect as pressing its button

#### Scenario: A refused menu action is reported like a refused button

- **WHEN** an action issued from the menu is refused
- **THEN** the reason appears on the transient command surface, worded as the button's refusal
  would be, and nothing is pinned inline in the row

#### Scenario: Right-click does not move the selection

- **WHEN** the operator right-clicks a row that is not selected
- **THEN** the menu acts on that row and the current selection is unchanged

#### Scenario: The menu dismisses and stays on screen

- **WHEN** the menu is open and the operator clicks outside it, presses Escape, scrolls, or
  runs an action
- **THEN** the menu closes; and a menu opened near a viewport edge is positioned fully on
  screen

#### Scenario: Text entry keeps the browser's own menu

- **WHEN** the operator right-clicks inside a text input, textarea or rich-text field
- **THEN** the browser's own context menu appears, so cut/copy/paste remain available

### Requirement: Command feedback is transient, never pinned inline

The outcome of an operator command SHALL be reported on the shared transient command surface
(the toast), and SHALL NOT be rendered as text pinned into the panel or row that issued it.
This holds for every command control on the operator surface — library, stack and Inspector
alike — so the operator has ONE place to look for "did that work?" rather than a different
answer per panel. A message pinned into a tight layout also wraps, and a wrapped message bloats
or breaks the row it sits in.

A refusal SHALL be reported EXACTLY ONCE. Where the action's shared handler already reports for
itself, the control SHALL suppress its own copy rather than adding a second — one refusal
speaking twice, in two places, is the failure this rule exists to prevent. Where the handler
does not report, the control SHALL be the reporter.

The message WORDING is unchanged by where it appears: a refusal carries the same
machine-readable-reason mapping whether it is issued from a button, a menu, or any other entry
point to the same action. After a refusal the control SHALL return to its idle state rather than
holding a persistent error.

Text that is NOT the outcome of a command is out of scope and SHALL remain in place — a
persistent explanation of why a control is disabled, and state markers such as an
unapplied-edits indicator, are readable for as long as the condition holds and have no
transient event to fire on.

#### Scenario: A refused Inspector command shows a toast and pins nothing in the panel

- **WHEN** an Inspector command is refused (for example applying a position the bridge rejects)
- **THEN** the refusal appears on the command toast, no inline error is rendered in the panel,
  and the control returns to idle

#### Scenario: A refusal that the shared handler already reported is not doubled

- **WHEN** a command whose shared handler reports its own failure is refused
- **THEN** exactly one message reaches the operator, and the control adds neither a second toast
  nor an inline copy

#### Scenario: A persistent disabled-state explanation is not converted to a toast

- **WHEN** a control is disabled because the item is on air
- **THEN** the explanation remains readable beside that control for as long as it is disabled
