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

The Runtime UI SHALL split the bridge's orphan-layer set by observed producer
kind, because the two kinds mean opposite things to a graphics operator
(R-015):

An orphaned **`html`** layer — plausibly this system's own graphic riding
through a dead bridge session — SHALL surface as a persistent warning strip:
one row per orphan naming the channel-layer ("Layer 1-60 is on air but not on
your stack"), rendered with `role="alert"`, visible while the orphan persists
(no auto-dismiss). Each html row SHALL offer an explicit Clear control gated
by a confirmation; on confirm the UI issues `layers.clear` for that layer,
surfaces a failure via the command-error channel, and treats the row's
disappearance (the bridge's observed-empty resolution) as success. The UI
SHALL never clear a layer without the operator's explicit confirmation.

A **non-`html`** layer — a video or any other producer this system does not
place — SHALL surface as NEUTRAL information, not a problem: a separate strip
in the surface's normal text tones (never amber, never the on-air red),
without `role="alert"`, naming the channel-layer and the observed producer
kind and saying it was placed by another system and is not clearable from
here. A non-html row SHALL offer NO Clear control — the affordance does not
exist, rather than being disabled or confirm-gated harder. Unrecognised
producer kinds SHALL be presented exactly as video ("not html" fails safe).

Both surfaces SHALL subscribe to the pushed orphan set, load the initial
state on mount, and render NOT AT ALL when their subset is empty — no idle
noise. (There is essentially always at least one video layer in play, so a
warning-toned video row would permanently imply a problem where none exists.)

#### Scenario: html orphans appear as warnings; idle is quiet

- **WHEN** the bridge publishes orphans whose producer kind is `html`
  **THEN** the warning strip appears naming each channel-layer
- **WHEN** the orphan set is empty **THEN** no orphan surface of either kind
  is rendered

#### Scenario: Confirm-gated Clear on an html orphan

- **WHEN** the operator clicks an html row's Clear and confirms **THEN** the
  UI issues `layers.clear` for exactly that layer, and the row disappears
  when the bridge resolves it on observed empty
- **WHEN** the operator cancels the confirmation **THEN** nothing is sent

#### Scenario: A video layer reads as normal and offers no Clear

- **WHEN** the bridge publishes an orphan whose producer kind is not `html`
  (e.g. `ffmpeg`) **THEN** it renders in the neutral strip — normal text
  tones, no `role="alert"` — naming the layer and kind, with NO Clear
  control present in the row
- **WHEN** an orphan carries an unrecognised producer kind **THEN** it is
  rendered exactly as a video layer (fail-safe: "not html" is not ours)

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

### Requirement: ON AIR display is honest when the SPA↔bridge link is down

The Runtime stack MUST NOT keep rendering a confident **ON AIR** for an item once the SPA↔bridge
link — the WebSocket to the local bridge, the SPA's only conduit to CasparCG — is down. While the
link status is `disconnected`, the renderer freezes the last stack snapshot (a disconnected bridge
publishes nothing, and the bridge-side `unverified` demotion of [[B-086]] cannot be sent by a dead
bridge), so an on-air row would otherwise stay frozen on the broadcast-red badge.

While the SPA↔bridge link is `disconnected`, each stack row whose frozen status is on-air (`on-air`,
or the `playing` fallback that renders identically) SHALL render in the muted **UNVERIFIABLE** state —
the same `unverified` presentation B-086 uses (never the broadcast red, never the amber of
`unconfirmed`), with an operator label conveying "was on air, cannot confirm now". A row that is not
on-air (e.g. `loaded`, `idle`) SHALL be unchanged. This is a **display mask** over the frozen
snapshot only: it changes no stored state and makes no restore-vs-reset decision.

On reconnect (link returning to `live`), the renderer re-pulls the authoritative stack snapshot and
the real status SHALL replace the mask automatically, with no operator action.

The `unverified` badge tooltip SHALL be accurate for both link-loss cases now that both render
`unverified`: when the SPA↔bridge link is down it SHALL name the **bridge** connection; when an item
is `unverified` from a CasparCG link-loss on a live bridge (B-086) it SHALL name the **CasparCG**
link. The visible badge label and icon SHALL be unchanged (muted "WAS ON AIR").

The on-air **refusal** is unchanged: while the link is down, `take`/`update`/`out` remain refused
(R-006). This requirement changes only the honesty of the on-air **display**, never what a command
does, and requires no bridge or schema change.

#### Scenario: An on-air row is masked when the bridge link drops

- **WHEN** a stack item is showing ON AIR and the SPA↔bridge link becomes `disconnected` (the bridge
  process died) **THEN** its badge renders the muted "WAS ON AIR" (`unverified`) state, not the
  confident red ● ON AIR and not IDLE

#### Scenario: The real status returns on reconnect

- **WHEN** the SPA↔bridge link returns to `live` **THEN** the renderer re-pulls the authoritative
  stack snapshot and the row shows its real current status (the display mask is gone), with no
  operator action

#### Scenario: A non-on-air row is untouched while the bridge link is down

- **WHEN** the SPA↔bridge link is `disconnected` and a row's frozen status is `loaded` or `idle`
  **THEN** its badge is unchanged — only the confident on-air/`playing` claim is masked

#### Scenario: The tooltip names the link that actually dropped

- **WHEN** a row is masked because the SPA↔bridge link is down **THEN** its `unverified` tooltip names
  the **bridge** connection; **WHEN** a row is `unverified` from a CasparCG link-loss on a live bridge
  (B-086) **THEN** its tooltip names the **CasparCG** link

#### Scenario: The on-air refusal is unchanged while the bridge link is down

- **WHEN** the SPA↔bridge link is down and the operator issues `take`/`update`/`out` **THEN** the
  command is still refused (R-006) — the display mask changes no command outcome

### Requirement: Not-on-air states are loud, and test mode can never be mistaken for air

The Runtime SHALL make it impossible for the operator to believe a graphic is on air when
it is not. A single pill among several is NOT sufficient: the failure this prevents was an
amber "OFFLINE (mock)" pill sitting beside a green "PRIMARY A HEALTHY", where the
reassuring claim won.

**Disconnected.** When the bridge link is not live, the Runtime SHALL show a persistent
full-width `role="alert"` banner stating that the Runtime is not connected, that nothing
can reach air, and that commands are refused. The banner SHALL offer a retry and an
explicit way to enter test mode. On-air controls SHALL be disabled while disconnected, with
the reason surfaced — the UI SHALL mirror the bridge's refusal rather than inviting a
command it knows will be refused.

**Test mode.** Test mode SHALL be entered only by a deliberate operator action, never
automatically. While in test mode the Runtime SHALL show a persistent, visually distinct,
full-width TEST MODE banner stating that nothing is on air and no command reaches CasparCG,
and SHALL offer an explicit way to leave. Leaving or entering test mode SHALL NOT swap the
backend underneath a running session.

**Test mode SHALL NOT claim real success.** A simulated item SHALL NOT render the same
on-air badge a genuinely on-air item renders: the broadcast-red ON AIR treatment is
reserved for a graphic confirmed on air by a real server. A simulated item SHALL be badged
distinctly (e.g. "SIM ON AIR") so the claim reads as simulation at a glance. The mock SHALL
NOT report any CasparCG server as `healthy`; the server pills SHALL state that there is no
server and the state is simulated.

#### Scenario: An unreachable bridge is loud, not a pill

- **WHEN** the app boots and the bridge is unreachable **THEN** a full-width alert states
  the Runtime is not connected and that commands will not reach air, and no server is shown
  as healthy

#### Scenario: On-air controls are disabled while disconnected

- **WHEN** the link is not live **THEN** the stack row's PLAY control is disabled and the
  reason is surfaced, so the operator is not invited to issue a command that would be refused

#### Scenario: Test mode is unmistakable

- **WHEN** the operator is in test mode **THEN** a persistent full-width TEST MODE banner
  states that nothing is on air, and it is visible regardless of where the operator is
  looking in the app

#### Scenario: A simulated item is never badged as real air

- **WHEN** an item is "played" in test mode **THEN** its badge reads as simulated, visually
  distinct from the broadcast-red ON AIR badge a real on-air item carries

#### Scenario: The mock never claims a healthy server

- **WHEN** the app is in test mode **THEN** no CasparCG server is reported or shown as
  healthy — the server surface states that there is no server and the state is simulated

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

### Requirement: The per-item off-air action is labelled CLEAR

The stack row's off-air action SHALL be labelled **CLEAR**, because `CLEAR` is what it sends.

It was labelled **OUT**, which reads like the authored outro — an animated exit. It is not:
it dispatches a `CLEAR <channel>-<layer>`, a hard cut that destroys the producer. An operator
choosing between "OUT" and "REMOVE" had no way to tell that the gentle-sounding one was the
abrupt one. The label now matches the wire, and matches the Clear-All beside it.

This is a LABEL change only. The underlying intent, IPC channel, API names and AMCP command
SHALL be unchanged — the button still dispatches the same `stack.out`. An animated-out STOP
(playing the authored outro before removing) is a separate, future capability and is NOT what
this control does.

#### Scenario: The off-air button reads CLEAR

- **WHEN** the operator views a stack row **THEN** the off-air action reads "CLEAR", distinct
  from the destructive "REMOVE" beside it

#### Scenario: The rename changes nothing on the wire

- **WHEN** the operator presses CLEAR **THEN** the same `stack.out` intent is dispatched over
  the same channel and the same `CLEAR <channel>-<layer>` reaches CasparCG
