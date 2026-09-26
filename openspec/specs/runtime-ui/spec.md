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

The Runtime UI SHALL split the bridge's orphan-layer set by observed producer kind, because the two
kinds mean opposite things to a graphics operator (R-015), and SHALL speak only for the layers
inside CG's bands (`FIELD-FIXES-01` L).

A layer BELOW CG's bands (1–49) carrying a producer this system did not place is the Playout's, and
normal: it SHALL raise no strip and no mark on its channel's tab, and it SHALL be listed on the
Station layers tab, as before.

An orphaned **`html`** layer inside the bands — plausibly this system's own graphic riding through a
dead bridge session — SHALL surface as a warning strip: one row per orphan naming the channel-layer
("Layer 1-60 is on air but not on your stack"), rendered with `role="alert"`, visible while the
orphan persists until the operator dismisses the strip. Each html row SHALL offer an explicit Clear
control gated by a confirmation; on confirm the UI issues `layers.clear` for that layer, surfaces a
failure via the command-error channel, and treats the row's disappearance (the bridge's
observed-empty resolution) as success. The UI SHALL never clear a layer without the operator's
explicit confirmation.

A **non-`html`** layer inside the bands — a video or any other producer this system does not place —
SHALL surface as NEUTRAL information: a separate strip in the surface's normal text tones (never
amber, never the on-air red), without `role="alert"`, naming the channel-layer and the observed
producer kind and saying it was placed by another system and is not clearable from here. A non-html
row SHALL offer NO Clear control — the affordance does not exist, rather than being disabled or
confirm-gated harder. Unrecognised producer kinds SHALL be presented exactly as video ("not html"
fails safe).

Each strip SHALL carry a dismiss control inside its box. A dismissal SHALL record, per channel and
per strip, the layers and producers the strip showed; the strip SHALL stay dismissed until it holds
a layer or a producer the dismissal did not record — a new layer, or a different producer on a layer
— and SHALL NOT return because a layer left it or because the same set was observed again. A
dismissal SHALL belong to the browser it was made in and SHALL survive a reload. A channel's tab
SHALL carry the warning mark while either strip of that channel stands, and not while both are
dismissed.

Both surfaces SHALL subscribe to the pushed orphan set, load the initial state on mount, and render
NOT AT ALL when their subset is empty — no idle noise.

#### Scenario: html orphans appear as warnings; idle is quiet

- **WHEN** the bridge publishes orphans inside CG's bands whose producer kind is `html` **THEN** the
  warning strip appears naming each channel-layer
- **WHEN** the orphan set is empty **THEN** no orphan surface of either kind is rendered

#### Scenario: Confirm-gated Clear on an html orphan

- **WHEN** the operator clicks an html row's Clear and confirms **THEN** the UI issues
  `layers.clear` for exactly that layer, and the row disappears when the bridge resolves it on
  observed empty
- **WHEN** the operator cancels the confirmation **THEN** nothing is sent

#### Scenario: A video layer reads as normal and offers no Clear

- **WHEN** the bridge publishes an orphan inside CG's bands whose producer kind is not `html` (e.g.
  `ffmpeg`) **THEN** it renders in the neutral strip — normal text tones, no `role="alert"` —
  naming the layer and kind, with NO Clear control present in the row
- **WHEN** an orphan carries an unrecognised producer kind **THEN** it is rendered exactly as a video
  layer (fail-safe: "not html" is not ours)

#### Scenario: Below CG's bands another system's layer is normal

- **WHEN** the bridge publishes an `ffmpeg` producer on layer 5 **THEN** no strip and no tab mark
  appear, and the Station layers tab lists the layer
- **WHEN** the same producer is on layer 90 **THEN** the neutral strip names it and the channel's tab
  carries the mark

#### Scenario: A dismissal holds until the strip's set changes

- **WHEN** the operator dismisses the strip naming layer 90 and the console reloads **THEN** the strip
  and its mark stay dismissed
- **WHEN** a foreign producer then appears on layer 91 **THEN** the strip returns naming layers 90 and
  91, and the mark returns with it
- **WHEN** a layer leaves the strip, or the same set is observed again **THEN** it stays dismissed

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

On a station that declares two or more channels, Clear-All SHALL act on the channel on screen:
it SHALL send `stack.clear-all` carrying that channel, and only that channel's on-air items
come off air. A channel narrows WHICH items are cleared, never HOW — still one per-layer
`CLEAR <channel>-<layer>` per item, never a channel-level `CLEAR <channel>`. With one declared
channel it SHALL be sent bare, as before.

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

#### Scenario: Clear-All on one of two channels

- **WHEN** Clear-All is confirmed on channel 2's view of a two-channel station **THEN** one `stack.clear-all` carrying channel 2 is sent, `CLEAR 2-99` reaches the wire, and channel 1's graphic stays on air

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

### Requirement: An unverifiable row says WHY it cannot be verified

A row that cannot be verified SHALL say which cause applies. A row can become unverifiable for
reasons that call for opposite operator responses, and it MUST NOT describe one as if it were the
other.

When a LINK has dropped, the item's fate is unknown and restoring the link is the remedy. When
the link is UP but the controller has never received any occupancy signal from the playout
server, nothing was sent for the item and the graphic is most likely still on air, untouched —
here restoring the link is not the remedy, and describing the graphic in the past tense
misstates what the operator is looking at. Both mis-readings push toward the unsafe response:
treating a live graphic as gone, and sending an engineer to restart a playout server that is
working.

An unverifiable row SHALL therefore carry wording that matches its cause. It SHALL keep the same
muted presentation in both cases — never the broadcast-red on-air treatment, and never a
different tone that would fragment a vocabulary the operator has already learned — so that only
the words differ. The wording for the never-heard-from case SHALL read as an open question
rather than a past-tense claim, and SHALL name the missing occupancy signal and its remedy
rather than a reconnect.

#### Scenario: A row unverifiable from a missing occupancy signal reads as a question

- **WHEN** an item is unverifiable because the controller has never received an occupancy signal
- **THEN** the row asks whether it is on air rather than stating that it was, and explains that
  nothing was sent and that the graphic is likely still on air

#### Scenario: A row unverifiable from a dropped link keeps its own wording

- **WHEN** an item is unverifiable because a link dropped
- **THEN** its existing wording is unchanged, naming the link that dropped and the reconnect

#### Scenario: Both causes share one muted presentation

- **WHEN** a row is unverifiable for either cause
- **THEN** it renders in the same muted state, never the broadcast-red on-air treatment

### Requirement: A server that answers commands but cannot be heard SHALL say so

The operator surface SHALL distinguish a server that is DOWN from a server that is UP but whose
observation channel is not reaching the controller. The two are identical on the command axis and
call for OPPOSITE remedies — one is a configuration fix on the server, the other is a dead server —
so presenting them alike sends the operator to the wrong one, and the wrong one is the remedy that
interrupts air.

While the controller is connected and a declared server is answering commands, but nothing has ever
been observed from that server on its observation channel, the status surface SHALL show a distinct
indicator saying so. It SHALL be presented in the caution tone — never the treatment reserved for
air claims or for a server that is genuinely down — and SHALL sit ALONGSIDE that server's health
reading rather than replacing it, so both facts are legible at once.

While a server is flagged this way its own health reading SHALL STOP ASSERTING CONFIDENCE — it
SHALL be presented in the same unverifiable treatment used when health cannot be read at all,
keeping the state word (which remains true on the command axis) while withdrawing the confident
presentation. Leaving a confident reading beside the warning would put two contradictory claims of
equal weight in one row, where the reassuring one wins — the failure this surface has already been
corrected for twice.

The flag SHALL be per SERVER and SHALL name which server it applies to: declared servers are
observed independently, so one can be inaudible while another is fine, and an unattributed warning
would send the operator to the wrong machine.

Its detail SHALL name the fault as a CONFIGURATION problem on the server side, SHALL state that the
server is up, SHALL say what the controller cannot do while it persists, and SHALL give the remedy.
It SHALL NOT imply that restarting or reconnecting the server is the fix.

The indicator SHALL be suppressed where it could only mislead: while the controller's own link is
down (nothing about the server is observable then, and that story belongs to the link), in
simulation mode (there is no server), and before the server has completed its connection handshake
(a cold start has legitimately observed nothing yet). It SHALL clear on its own once observations
begin arriving, without an operator action.

The indicator SHALL derive from the same evidence the restore safeguard uses, so the two can never
disagree about whether the server has been heard. It SHALL NOT be derived from per-layer
observations: a healthy server whose layers are all empty produces none, and an indicator keyed on
those would fire on every idle install.

This is an indicator only. It SHALL NOT change any decision, gate, or command the controller makes.

#### Scenario: A server answering commands with nothing heard from it is flagged

- **WHEN** the controller is connected, a declared server is answering commands, and nothing has
  ever been observed from it
- **THEN** the status surface shows the indicator alongside that server's health reading

#### Scenario: The flagged server's health reading stops asserting confidence

- **WHEN** a server is flagged as inaudible
- **THEN** its health reading is presented as unverifiable rather than confident, so the two
  readings in the row do not contradict each other

#### Scenario: The flag names which server is inaudible

- **WHEN** one declared server is inaudible and another is being observed normally
- **THEN** only the inaudible one is flagged, and the flag names it

#### Scenario: The indicator survives the server's own state changes

- **WHEN** the server's health reading changes while nothing is still being observed from it
- **THEN** the indicator remains shown, so the explanation is present at the moment the health
  reading looks alarming

#### Scenario: The detail points at the configuration, not at a restart

- **WHEN** the operator reads the indicator's detail
- **THEN** it identifies a server-side configuration fault, states the server is up, lists what is
  degraded, and gives the remedy — and does not suggest restarting or reconnecting the server

#### Scenario: An idle but healthy server is not flagged

- **WHEN** a server is being observed normally but no layer holds anything
- **THEN** the indicator is not shown

#### Scenario: It is suppressed where it could only mislead

- **WHEN** the controller's own link is down, or the session is in simulation mode, or the server
  has not yet completed its connection handshake
- **THEN** the indicator is not shown

#### Scenario: It clears once observations arrive

- **WHEN** observations begin arriving from the server
- **THEN** the indicator clears without an operator action

### Requirement: Persian/Arabic-Indic digits are accepted in numeric inputs and normalized to canonical digits

Every Runtime numeric input SHALL accept Persian digits (۰–۹) and Arabic-Indic digits
(٠–٩), normalizing them to canonical Latin digits (0–9) on input — typing and paste alike
— via ONE shared numeric-input primitive that reuses `@cg/text-shaping`'s `latinDigits`
(never a locally re-derived digit map). The primitive SHALL NOT be a browser
`type="number"` input (which drops non-Latin digits before script observes them). Stored
and transmitted values SHALL be canonical Latin digits. Numeric inputs that accept a
decimal value SHALL also normalize the Persian decimal separator ٫ (U+066B) to ".";
integer-only inputs SHALL leave ٫ for their validation to reject. Any pattern-shaped
numeric validation SHALL validate the normalized value, so a numeric pattern never
rejects Persian-typed digits. Text-type fields SHALL be untouched — their content is kept
verbatim, never digit-normalized.

#### Scenario: Persian-typed digits commit as canonical

- **WHEN** the operator types Persian digits (۰–۹) or Arabic-Indic digits (٠–٩) into any
  Runtime numeric input — the Inspector number field, the position offsets, a server
  port — **THEN** the digits are accepted and normalize on input, the control displays
  Latin digits, and the stored/transmitted value is canonical Latin digits

#### Scenario: A pasted non-Latin numeric value normalizes the same way

- **WHEN** a value containing Persian or Arabic-Indic digits is pasted into a Runtime
  numeric input **THEN** it normalizes exactly as typed input does

#### Scenario: Numeric validation sees canonical digits

- **WHEN** a numeric input with pattern-shaped validation (the port inputs' integer rule)
  receives Persian-typed digits **THEN** validation runs against the normalized value and
  does not reject them as non-numeric

#### Scenario: Decimal inputs accept the Persian decimal separator

- **WHEN** the operator types ٫ (U+066B) into a numeric input that accepts a decimal
  value **THEN** it normalizes to "." and the value commits as the decimal it denotes

#### Scenario: Text fields stay verbatim

- **WHEN** the operator types Persian digits into a text-type field **THEN** the content
  is kept verbatim — no digit normalization is applied

#### Scenario: A Persian-typed lock PIN matches

- **WHEN** a lock PIN is engaged with digits typed in one digit set and released with the
  same digits typed in another (۱۲۳۴ then 1234, or the reverse) **THEN** the release
  succeeds — digits in the PIN normalize identically at engage and at release, while
  non-digit PIN characters pass through verbatim

### Requirement: A text-carrying field can take its value from a text file (manual reload)

The Inspector SHALL offer a "from file" affordance on every text-carrying field (text /
multiline / list): the operator picks a text file, whose content becomes the field's value
through the EXISTING field-update path — staged like a hand edit on pick, and re-read +
re-applied on an explicit RELOAD. The file is an input method for field values, never a second
content pipeline.

Content is VERBATIM: never trimmed (split mode's per-entry trim is the one opt-in exception),
never digit-normalized (numeric-input normalization is for typed numeric fields, not broadcast
copy), never otherwise transformed — UTF-8 Persian/RTL content survives byte-for-byte.

By DEFAULT split is OFF and the ENTIRE file content is the value: on a `list` field it becomes
ONE item's text, so a ticker crawl renders the typist's own embedded separators exactly as
typed. With SPLIT enabled the operator defines a free-text delimiter (sensible suggestions
offered; `\n` means one entry per line) and the content splits into a list value — entries are
trimmed and entries empty after trimming are SKIPPED. The split default is per-TARGET, resolved
from the scene's bindings at import: a field consumed by a SEQUENCE defaults split ON; a field
consumed by a ticker — or whose consumer is unknown or ambiguous — defaults OFF (verbatim is
the safer default) and the operator can flip it. While split is OFF on a list field the UI
SHALL say explicitly that the whole text becomes ONE item.

If the file is missing or unreadable at (re)load, the CURRENT value SHALL be KEPT — nothing is
staged or applied — and the operator SHALL see a legible error naming the file. Where the
browser cannot provide a re-readable file handle (no File System Access API), the affordance
SHALL degrade to a disabled control with a legible reason — never a broken control.

#### Scenario: Whole-file verbatim is the default, staged like a hand edit

- **WHEN** the operator chooses "from file" on a text field with split OFF **THEN** the entire
  file content is staged as the field's draft value verbatim, and applying with Update sends
  it through the normal `stack.update` — a live item updates exactly as a hand-edited field
  would

#### Scenario: A ticker's list field with split OFF becomes ONE item

- **WHEN** the target is a `list` field with split OFF **THEN** the staged value is a single
  item whose text is the entire file content, so a crawl renders the typist's own embedded
  separators exactly as typed, and the UI states that the whole text becomes ONE item

#### Scenario: Split ON produces a trimmed list, empties skipped

- **WHEN** the operator enables split and defines a delimiter **THEN** the content splits into
  a list value with one item per entry, entries trimmed, and entries empty after trimming
  skipped
- **WHEN** the field's sole consumer is a SEQUENCE **THEN** split defaults ON; **WHEN** the
  consumer is a ticker, unknown, or ambiguous **THEN** split defaults OFF

#### Scenario: RELOAD re-reads the file and re-applies the field

- **WHEN** the operator triggers RELOAD **THEN** the file is re-read (each reload sees the
  file's CURRENT content) and the field re-applies through the same `stack.update` path the
  Update button uses, scoped to this field — the operator's unrelated staged edits are not
  carried to air

#### Scenario: Persian/RTL content survives verbatim

- **WHEN** the file holds UTF-8 Persian/RTL content — including Persian digits — **THEN** the
  value is byte-for-byte identical to the file content: no digit normalization, no trimming,
  no transformation

#### Scenario: A missing or unreadable file keeps the current value

- **WHEN** a reload's read fails (file deleted, share unavailable) **THEN** nothing is staged
  or applied — the current, possibly on-air value is KEPT — and a legible error naming the
  file is shown at the field and via the command-error channel

#### Scenario: No File System Access API — legible degrade

- **WHEN** the browser lacks `showOpenFilePicker` **THEN** the "from file" control renders
  disabled with the reason visible — never a broken or silently absent control

### Requirement: The Runtime shows a startup splash from the first paint until it is ready

The Runtime SHALL present a startup splash screen — the APASAI company mark, the **CG CONTROL**
product wordmark, a named phase readout, and a progress rail — that is painted on the FIRST
FRAME, before any application JavaScript has run, and that stays on screen until the application
is genuinely ready.

The splash markup and its critical CSS SHALL live inline in the application's HTML document so
that neither the JavaScript bundle nor any network request is required to paint it. A build in
which the splash element is absent SHALL boot normally: every call into the splash from
application code is null-safe.

The splash SHALL remove itself from the DOM after dismissing, so no full-screen overlay outlives
it.

All splash copy SHALL be English. The splash SHALL NOT use red anywhere: red is the Runtime's
sacred air-state colour and decorative red is already forbidden across this UI, so the splash
accent is the existing sky accent.

#### Scenario: The splash paints before application JavaScript

- **WHEN** the Runtime page is opened **THEN** the splash is visible on the first painted frame,
  with no dependency on the JavaScript bundle, a network fetch, or a web font

#### Scenario: The splash removes itself once dismissed

- **WHEN** the splash has faded out **THEN** its element is removed from the DOM and the operator
  surface beneath it is fully interactive

#### Scenario: No red on the first frame

- **WHEN** the splash is rendered **THEN** no part of it is red — not the mark, the rail, the
  readout, or the frame

### Requirement: The phase readout names real boot steps and advances by completed phase

The splash SHALL show a named phase for each REAL step of the Runtime's boot — initialization,
the bridge probe, and interface start — advanced by the application at the point that step
actually occurs, never on a simulated schedule. Each label SHALL name the work happening NOW.

There SHALL be exactly THREE labels for three work steps, and NO TERMINAL "READY" LABEL. When
boot completes the label SHALL FADE OUT (opacity only, ~350 ms), leaving the left side of the
readout empty; the step counter carries the remaining hold alone. A terminal label is forbidden
because a fast cold boot completes roughly a second in while the hold keeps the door shut until
5000 ms — so "READY" would be the thing on screen for most of the splash at exactly the moment
the operator still cannot use the app.

The progress rail SHALL advance by COMPLETED PHASE (three phases → 33 / 67 / 100 %), and the
readout SHALL show a STEP COUNTER (e.g. `2 / 3`). It SHALL NOT show a percentage, which would
claim measured progress that nothing here measures.

#### Scenario: Each phase is announced when it happens

- **WHEN** the application begins probing for the bridge **THEN** the readout names that step, and
  **WHEN** the bridge selection resolves and the interface starts **THEN** the readout names that
  step in turn

#### Scenario: The rail advances by completed phase, with a step counter

- **WHEN** two of the three phases have completed **THEN** the rail is at 67 % and the readout
  shows `2 / 3` — never a percentage

#### Scenario: The label leaves when boot completes

- **WHEN** boot completes **THEN** the phase label fades out and the readout's left side is empty,
  while the rail stays at 100 % and the step counter remains for the rest of the hold

#### Scenario: No terminal label exists anywhere

- **WHEN** the splash's markup, styles and script are inspected **THEN** the word `READY` does not
  appear in any of them

### Requirement: The splash hold has a cold floor, a warm floor, and a hard ceiling

The splash SHALL be dismissed at `min(max(firstPaint + floor, bootDone), firstPaint + 20000 ms)`,
where the floor is **5000 ms on a cold start** and **600 ms on a warm reload**.

Cold versus warm SHALL be decided by a `sessionStorage` marker — absent means cold — because
session storage survives a reload in the same tab and is empty in a new tab or new browser. It
SHALL NOT be decided by a wall-clock timestamp heuristic. A browser that refuses session storage
SHALL be treated as a cold start rather than failing boot.

Boot-done SHALL be defined narrowly as **bridge selection resolved** — `live`, `offline-mock` and
`disconnected` ALL count as resolved — **plus the first React commit of the application shell**.
Snapshot pulls (stack, health, lock) SHALL NOT be part of the gate.

The 20000 ms ceiling is ABSOLUTE: at the ceiling the splash dismisses regardless of boot state, so
that a stuck boot never leaves the operator without a door into the application. Signalling
boot-done more than once SHALL be idempotent.

#### Scenario: A cold start holds for at least five seconds

- **WHEN** the Runtime is opened in a browser context with no session marker **THEN** the splash
  remains visible for at least 5000 ms from first paint, even if boot completed sooner

#### Scenario: A warm reload dismisses quickly

- **WHEN** the page is reloaded in the same tab and boot completes quickly **THEN** the splash
  dismisses once boot completes and no earlier than 600 ms from first paint — well under the cold
  floor

#### Scenario: A slow boot extends the hold

- **WHEN** boot completes AFTER the applicable floor has elapsed **THEN** the splash stays until
  boot completes — it never hides a boot that is still running

#### Scenario: The ceiling dismisses a boot that never completes

- **WHEN** 20000 ms have elapsed since first paint and boot has not completed **THEN** the splash
  dismisses anyway and the application's own DISCONNECTED / error surface is shown

#### Scenario: A refused bridge still reaches the operator surface

- **WHEN** the bridge connection is refused **THEN** the splash still dismisses and the application
  shows its own NOT CONNECTED surface — the splash is never permanent

#### Scenario: Boot-done twice is idempotent

- **WHEN** boot completion is signalled more than once **THEN** the dismissal is scheduled from the
  first signal only, and the later signals change nothing

### Requirement: The splash carries one build stamp from a single source

The splash SHALL display a build stamp identifying the running build exactly — the short commit
SHA and the build date — in the form `sha · YYYY-MM-DD`.

The stamp SHALL be computed ONCE at build time and fed to BOTH consumers from that one value: the
HTML document (which the splash paints from, before the bundle exists) and a compile-time global
for any later in-application surface. Computing the SHA SHALL NEVER fail the build: when the git
metadata is unavailable the stamp falls back to a literal marker.

The stamp SHALL NOT print a version number while the project's package version is a placeholder.

#### Scenario: The stamp identifies the running build

- **WHEN** the splash is shown **THEN** its foot reads the short commit SHA and the build date, and
  those values are the same ones any in-application build surface would read

#### Scenario: A build without git metadata still builds

- **WHEN** the application is built from a source tree with no git metadata **THEN** the build
  succeeds and the stamp reads the fallback marker in place of a SHA

### Requirement: The splash can be bypassed by an init-script global, never by a URL

The Runtime SHALL skip the splash entirely when `window.__CG_SPLASH_DISABLED__` is set before
application JavaScript runs — the splash element is removed immediately and no hold is applied.

The bypass SHALL NOT be reachable through a URL query parameter, which an operator can reach by
bookmark or typo. When the global is absent the splash behaves normally.

#### Scenario: The automated suite is not taxed by the hold

- **WHEN** the test harness sets the bypass global before application JavaScript **THEN** no splash
  is shown and boot is not delayed

#### Scenario: The bypass is off by default

- **WHEN** no bypass global is set **THEN** the splash appears and holds normally

### Requirement: The splash honours reduced motion

The splash SHALL respect `prefers-reduced-motion: reduce`: no entrance animation, no rail
transition, and no fade — the splash appears in its settled state and is removed without a
transition.

#### Scenario: Reduced motion renders the settled splash

- **WHEN** the operator's system requests reduced motion **THEN** the splash renders with its mark,
  wordmark, rule, company line, tagline, rail and foot all fully visible and unanimated

### Requirement: PVW renders every element kind the retained page carries, video included

The Runtime's PVW (PREVIEW) panel SHALL render every element kind the retained single-file page
carries, including `video`. PVW exists so an operator can check what air will show BEFORE taking it
to air, so a PVW that silently omits an element is a correctness failure, not a cosmetic one: an
operator MUST never be able to believe PVW is showing the real picture when it is not.

Because the rehearsal frame is an `<iframe srcDoc>`, its document INHERITS the embedding page's
Content-Security-Policy, which is enforced IN ADDITION to the policy the artifact declares for
itself — the intersection governs. The embedding page's CSP SHALL therefore admit every resource
scheme the exporter can emit. In particular it SHALL declare `media-src` admitting `data:`, since
`@cg/single-file-export` inlines a packaged video as a base64 `data:video/webm` URI; without that
directive media falls back to `default-src` and every video in PVW is refused while images, fonts
and scripts still load.

That policy SHALL be no wider than the need: schemes the application never produces SHALL NOT be
admitted merely to match another application's policy. Parity with a sibling application is NOT a
reason to widen a policy — the Designer admits `blob:` media because it plays video off object URLs,
and this application creates none. A scheme SHALL be added only by a change that needs it, and that
change SHALL carry a test demonstrating the need.

#### Scenario: A video-bearing template rehearses and its video plays in PVW

- **WHEN** a template whose retained page carries a base64 `data:video/webm` element is put ON PVW
- **THEN** the `<video>` in the rehearsal frame loads its media (it reaches at least
  `HAVE_METADATA`) and no Content-Security-Policy violation is raised against `media-src` or
  `default-src` for that media

#### Scenario: The embedding page's own policy is what admits the media

- **WHEN** the Runtime page's Content-Security-Policy is read
- **THEN** it declares a `media-src` directive admitting `data:`, rather than relying on
  `default-src`, and it does NOT admit `blob:` media, which this application never creates

### Requirement: A console the lock does not reach does not present itself as locked

The console SHALL derive how much of it an engaged lock covers from the lock's `channels` and the principal's `permittedChannels`: the lock screen and the status bar's `LOCKED` SHALL appear only when the lock covers every channel the console holds, or carries no `channels`. A console holding none of the covered channels SHALL show neither, and SHALL NOT offer the Lock control while any lock is engaged. With partial overlap, each covered channel's tab SHALL read `CHANNEL n · LOCKED` and the others SHALL not; a covered channel's view SHALL present as locked — a card reading `Channel n locked`, with the PIN field and `Unlock`, in place of that channel's view, its verbs absent rather than offered and refused — and every uncovered channel's view SHALL stay live. The every-channel PANIC SHALL be absent while any lock covers one of the console's channels.

#### Scenario: The engager's console is locked and the other channel's is not

- **GIVEN** two consoles signed in as the channel-1 and the channel-2 operator
- **WHEN** the channel-1 operator engages the lock
- **THEN** the channel-1 console shows the lock screen and `LOCKED`
- **AND** the channel-2 console shows neither, and no Lock control

#### Scenario: Partial overlap names the covered channels

- **WHEN** a lock covers some but not all of a console's channels
- **THEN** only the covered channels' tabs read `LOCKED`, and no console lock screen is shown

#### Scenario: A covered channel's view is locked and an uncovered one is live

- **GIVEN** a console holding channels 1 and 2, and a lock covering channel 1
- **WHEN** channel 1 is on screen **THEN** its view is the `Channel 1 locked` card and none of its verbs is on screen **AND** the PIN typed into the card releases the lock
- **WHEN** channel 2 is on screen **THEN** its rows and its verbs are there
- **WHEN** the lock is engaged **THEN** the every-channel PANIC is absent **AND** it returns on release

### Requirement: The channel strip lists the station's channels under the Playout's names

The channel strip SHALL list the channels the bridge's discovery answer marks `declared`, once that answer has arrived, and SHALL fall back to the fixed bank and channel settings until it has, or when it declares none. A channel the answer names but the station does not declare SHALL NOT be on the strip, whatever the principal is granted. A listed channel that a catalogue row names SHALL be labelled with that name, isolated in its own `<bdi>` with any read-only or locked suffix outside it, and SHALL carry its channel number on the tab's title. An unnamed channel SHALL keep its `CHANNEL <n>` label.

#### Scenario: The station's channel under the catalogue's name

- **GIVEN** a station on channel 2 whose catalogue names channel 2
- **WHEN** an operator of channel 2 signs in
- **THEN** the strip's one tab reads the catalogue's name, not `CHANNEL 2`, with `Channel 2` as its title

#### Scenario: The Playout's programme channel is not offered

- **GIVEN** the same station, a catalogue also naming channel 1, and a principal granted channels 1 and 2
- **WHEN** that principal signs in
- **THEN** the strip carries channel 2 under its name, and no tab for channel 1

#### Scenario: A read-only suffix stays outside the name

- **WHEN** a viewer sees the station's named channel
- **THEN** its tab reads the name followed by ` · READ ONLY`, and only the name is inside the isolate

#### Scenario: No catalogue, no change

- **WHEN** no catalogue name has arrived
- **THEN** the tab reads `CHANNEL <n>` exactly as before

### Requirement: An installed station walks through first-run on one screen

The console SHALL show first-run, in place of the sign-in gate, while the bridge advertises a
first-run phase: the Playout's address and the connection check, whose AMCP line waits; a sign-in;
the connection check again, now judging AMCP (`DESKTOP-APPS-01-B`); the Playout's channels in that
account's grant, grouped by host when there is more than one; and the detected serve address — and
SHALL then write the CasparCG host and the chosen channel or channels through the existing doors: one
channel through `fixedLayers.set-config`, exactly as before, and two or more in one
`fixedLayers.set-banks`, each with first-run's own bank. The chosen channels SHALL be on one CasparCG
host. If the Playout's list never arrives it SHALL offer the CasparCG host, prefilled with the
Playout's host, and the channel. It SHALL carry no explanatory prose and no way out.

#### Scenario: First-run end to end

- **WHEN** an address is typed with no scheme or no port and checked **THEN** the field shows the
  address actually checked — `http://`, and `:8080` when no port was typed (`DESKTOP-APPS-01-C` C3)
- **WHEN** the address is checked **THEN** the AMCP line says "waiting for sign-in", neutral
- **WHEN** the address is connected **THEN** only the address is written
- **WHEN** an operator signs in before adoption **THEN** the bridge's "not set up yet" sentence shows
  **AND** AMCP still waits
- **WHEN** the sign-in step opens and the check says a sign-in cannot work — the Playout's keys or
  this console's CORS entry do not pass **THEN** the fields and Sign in are disabled with the check's
  one line, in English, and Check stays available (`DELTA-MULTI-CHANNEL-01-B` B2) **AND** only a
  wrong username or password marks a field
- **WHEN** a station-admin signs in **THEN** the check runs once more by itself, touching only the
  AMCP line, which the bridge holds until the Playout lets this machine in or names the approval
  **AND** only then do the channels appear
- **WHEN** the station-admin picks a channel **THEN** the station's connection and bank are written
  **AND** first-run ends

#### Scenario: Two channels in one write

- **WHEN** the station-admin picks two channels and presses `Use these channels` **THEN** one `fixedLayers.set-banks` declares both, each with first-run's bank **AND** a second press on a picked channel takes it back out
- **WHEN** two channels are offered and none is picked **THEN** the button reads `Use these channels` **AND** with one picked it reads `Use this channel` (`DELTA-MULTI-CHANNEL-01-A` A8)
- **WHEN** a channel is picked **THEN** its chip wears the console's chosen-not-on-air fill, and an unpicked one does not
- **WHEN** a channel on another CasparCG host is picked **THEN** the set starts again on that host

### Requirement: A bridge that does not answer is said in the operator's words

The console SHALL say that the bridge did not answer in time — never an internal request name —
whenever a request to the bridge goes unanswered, and SHALL wait for `setup.check` longer than the
check's slowest line, the wait derived from the same constant as the line bound
(`DESKTOP-APPS-01-C` C2).

#### Scenario: A silent bridge

- **WHEN** a request is not answered **THEN** the error reads "The bridge did not answer in time."
  and names no channel
- **WHEN** `setup.check` is not answered within the old 8 s **THEN** the console is still waiting,
  and it gives up only after the derived wait

### Requirement: A link waiting for a station admin is said, not alarmed

The console SHALL show a primary link that is down while the bridge's health carries
`amcpAwaitsSignIn` as one sentence in the notice tone — "Waiting for a station admin to sign in." —
and not as the link alarm; without that fact the same link SHALL alarm as before.

#### Scenario: Before and after the fact

- **WHEN** the primary is disconnected and the health says AMCP awaits a sign-in **THEN** the banner
  is a notice with that sentence and no dismiss
- **WHEN** the same primary is disconnected without that fact **THEN** the banner is the alarm

### Requirement: Station setup shows the Playout and its connection check

Station setup SHALL show, under Servers, the Playout's address as a fact with a CHECK that runs the
connection check, and a CHANGE that exists only inside CG Control and only for a station admin.

#### Scenario: Outside CG Control

- **WHEN** the console runs in a browser **THEN** there is no CHANGE control at all

### Requirement: The console renders Persian from its own fonts

The console SHALL load its UI fonts from its own origin and SHALL make no font or stylesheet request
to any other host.

#### Scenario: A LAN-only machine

- **WHEN** every other host is unreachable **THEN** no font request leaves the machine **AND** the
  Arabic-range Vazirmatn face is loaded

### Requirement: A channel's view shows only that channel

Every count, notice, alarm and bulk verb of a channel's view SHALL read only what concerns that channel (the owner's rule, 2026-09-23: a channel's messages never appear in another channel's view). On a station that declares two or more channels this SHALL hold for every channel-scoped message — the program output alarm, the raster mismatch, "did not come back", foreign content and occupied owned layers, a refusal raised while that channel was on screen, the on-air counts and the per-channel lock — while station-wide messages — the bridge link and its version, the servers and the backup, the Playout link, sign-in and first-run, and the station lock — SHALL appear whatever channel is selected. A notice that concerns several channels SHALL show each view only its own part, and SHALL offer a station-wide action such as DISMISS only in a view that holds all of it. With one declared channel nothing SHALL be filtered.

#### Scenario: Channel 1's logo in the channel-2 view

- **WHEN** a channel-1 item is on air and a channel-1 row did not come back **THEN** the channel-2
  view reads `0` on air and shows no notice about `1-99` **AND** an on-air row on channel 2 counts
  once

#### Scenario: A refusal stays in the view it was raised in

- **WHEN** a refusal is raised while channel 2 is on screen and the operator switches to channel 1 **THEN** channel 1's view does not show it **AND** back on channel 2 it is there

#### Scenario: One declared channel is exactly as before

- **WHEN** one channel is declared and a notice is raised **THEN** it shows, and no tab is marked

### Requirement: Station setup offers a station-admin the channel-scope controls

The Channel section SHALL offer a station-admin **Change channel…**, the editor of the station's channel SET — first-run's own channel list and warning, opening on the channels the station declares, each press adding or removing a channel — declaring one channel through `fixedLayers.set-config` and two or more through `fixedLayers.set-banks`: a kept channel keeps its own bank, an added channel gets first-run's bank, and a one-for-one replacement carries the station's bank to the new channel. A declared channel the Playout's list does not name SHALL still be listed, as `CH n`, so it can leave the set. The card SHALL state the set in force (`CH 1 · CH 2`). The section SHALL also offer **On air on another channel**, each stray's template, channel and layer with one action, **Take off air**, after a one-line confirmation. For any other principal both SHALL be absent, never disabled. For a station-admin the section's legend SHALL say the channel is reported by the server and that Change channel… sets the channels, and its footer that Change channel… applies on its own; for anyone else the section SHALL read as read-only, as before.

#### Scenario: An idle change, and a refused one

- **WHEN** a station-admin picks channel 2 **THEN** the bank is declared on channel 2 **AND WHEN** the
  bridge refuses **THEN** its sentence is shown

#### Scenario: Adding and removing a channel

- **WHEN** a station-admin on a channel-1 station adds channel 2 **THEN** one `fixedLayers.set-banks` carries channel 1's bank unchanged and channel 2 with first-run's bank
- **WHEN** a station-admin on a two-channel station removes channel 2 **THEN** channel 1's bank is written, untouched, through `fixedLayers.set-config`
- **WHEN** ours is on air on a channel leaving the set **THEN** the bridge's sentence is shown as it comes

#### Scenario: Taking a stray off air

- **WHEN** a station-admin confirms Take off air on `ارم روی انتن · CH 1 · layer 99` **THEN** exactly
  `{ casparChannel: 1, layer: 99 }` is sent

#### Scenario: Absent for an operator

- **WHEN** an operator opens the Channel section **THEN** neither control is present

#### Scenario: The legend says what is true for the reader

- **WHEN** a station-admin opens the Channel section **THEN** the legend says Change channel… sets the channels, not that the section is read-only **AND** anyone else reads it as read-only

### Requirement: Choosing a channel warns before declaring one already on air

First-run's channel step SHALL preselect nothing, SHALL name each channel and its number, and, after putting the connection in force, SHALL read the occupancy of each channel being added; each channel already on air SHALL earn one line — its name, `CH n` and the layers — and the set SHALL be declared only on a second press, reading `Use this channel anyway` or `Use these channels anyway`. An empty channel SHALL get no warning. Station setup's Change channel… SHALL apply the same step, opening on the declared set, reading the occupancy only of the channels it adds.

#### Scenario: The programme channel

- **WHEN** the admin picks channel 1 carrying `1-5` **THEN** "آپاسای · CH 1 is already on air —
  another system is playing on layer 5." is shown and nothing is declared until "Use this channel
  anyway" is pressed

#### Scenario: Two picked, one on air

- **WHEN** the admin picks channels 1 and 2 and only channel 1 is on air **THEN** one line is shown, about channel 1 alone

### Requirement: A row's number and default name are its AMCP layer

The Layers table's `#` and a row's default name SHALL carry the row's real CasparCG layer
(`Layer 99`, `Bed 59`); a configured name SHALL be kept.

#### Scenario: The top row

- **WHEN** the bank is 80–99 with beds 50–59 **THEN** the top row reads `99` and `Layer 99` **AND** a
  row named `CLOCK` keeps its name

### Requirement: A connection check that runs again starts clean

The console SHALL clear every line of the connection check the moment a check is pressed — and when
first-run checks by itself with nothing yet shown — showing each line's subject in a neutral
checking state and no verdict until that check's own reply arrives (`CHECK-RERUN-01`). One check
SHALL run at a time: no check SHALL start while another runs, so a sign-in during a check SHALL read
that check's reply rather than start its own, and a reply SHALL always belong to the check on
screen. A check SHALL run when CHECK is pressed; by itself, the console SHALL check once when a
`station-admin` signs in during first-run with nothing yet shown, and SHALL re-run at most ONCE
while a line still waits (`DELTA-MULTI-CHANNEL-01-A` A2). That re-run SHALL touch only the waiting
line — its subject, checking, in place, while every other line keeps its verdict — and SHALL ask the
bridge to hold the AMCP line until the Playout lets this machine in or names the approval. Nothing
else SHALL start a check. While a check runs, CHECK SHALL stay disabled and the address read-only. A
line not checked (`skip`) and a line checking SHALL wear the quiet inks, never the error ink, and
the surface SHALL carry no explanatory prose.

#### Scenario: A re-check

- **WHEN** a check has finished and CHECK is pressed again **THEN** every line shows its subject,
  checking, and no pass or fail mark until the new reply arrives **AND** the new reply then fills
  the lines in
- **WHEN** the bridge does not answer the re-check **THEN** no line is left checking and none of
  the last run's lines is shown

#### Scenario: A sign-in during a check

- **WHEN** a station-admin signs in while a pressed check is still running **THEN** no second check
  starts **AND** that check's reply is what the sign-in reads
- **WHEN** the console opens already signed in **THEN** it checks once

#### Scenario: The check does not loop

- **WHEN** a check shows the AMCP line waiting for sign-in and a station-admin signs in **THEN** the
  check runs once more by itself, the AMCP line alone checking and every other line keeping its
  verdict, and asks the bridge to hold that line **AND** its reply fills in that line only, and the
  check runs no more by itself — twice in all
- **WHEN** CHECK is then pressed **THEN** the check runs, starting clean
- **WHEN** no station-admin signs in **THEN** nothing runs by itself

#### Scenario: Neutral is not red

- **WHEN** a line is not checked or checking **THEN** it is drawn in a quiet ink with its own mark
  **AND** a failed line is still drawn in the error ink

### Requirement: The PROGRAM monitor shows the programme return, and says so when it cannot

The PROGRAM pane SHALL show the programme return of the channel on screen, served by the bridge
same-origin, and SHALL show the picture ONLY while the bridge reports that channel `live` over a
live bridge link. Otherwise the pane SHALL hide the picture and say, in the signal strip and on
the screen, **"No return signal"** (connecting, unreachable or unavailable) or **"Return feed
stalled"** (the feed stopped delivering frames) — never a frozen frame as if it were live. The
pane SHALL carry no explanatory prose; the strip keeps the rows-on-air count beside the signal, so
"no return signal" is never read as "nothing on air".

#### Scenario: The live picture appears

- **WHEN** the monitors are shown and the bridge relays frames for the channel on screen
- **THEN** the PROGRAM pane shows the picture, and its strip no longer reads "No return signal"

#### Scenario: A stalled feed hides the picture and says so

- **WHEN** the feed stops delivering frames
- **THEN** the picture is hidden and the pane reads "Return feed stalled"; and when frames resume
  the picture returns and the notice clears

#### Scenario: No feed reads "No return signal"

- **WHEN** the bridge cannot reach the feed, or the console runs without a relay (test mode)
- **THEN** no picture is shown and the pane reads "No return signal"

### Requirement: The PROGRAM return is requested only while the PROGRAM pane is shown

The console SHALL request the programme return only while the PROGRAM pane is rendered, and SHALL
release it when the pane is hidden or its channel changes, so a console with the monitors hidden —
the boot state — pulls nothing. It SHALL do so in every build of the console: a development build —
the one the dev station's Vite serves, where React's StrictMode mounts each component twice — SHALL
request the picture exactly as a production build does.

#### Scenario: Hiding the monitors releases the return

- **WHEN** the console boots with the monitors hidden
- **THEN** the feed sees no connection; showing the monitors connects it (the positive control),
  and hiding them again closes it within 2 s

#### Scenario: The dev station shows the return through Vite

- **WHEN** the console is served by the dev station's Vite and PROGRAM is shown for channel 2
- **THEN** the relay has a viewer and the picture keeps arriving through Vite's proxy **AND WHEN**
  the feed stops **THEN** the pane reads "No return signal"

### Requirement: Selecting a channel switches the whole console to it

The console SHALL, on a station that declares two or more channels, show and send everything that belongs to a channel for the channel selected on the strip: the layers table's rows and their names, the Inspector's selection, both monitors, the live plates, the playout rows, the bulk verbs' scope — REMOVE ALL, CLEAR ALL and STOP ALL each act on that channel's items and are sent carrying it, and REMOVE ALL is withheld only while that channel holds air — and PANIC. A gate about the whole station SHALL keep reading every channel: the Servers Apply stays blocked while anything is on air or unsettled on any channel, because a server change reaches all of them. The selection SHALL be a channel id held for the session only and written nowhere; the console SHALL open, and a reload SHALL reopen, on the lowest declared channel. With one declared channel every verb SHALL be sent exactly as before — bare — and nothing SHALL be filtered.

#### Scenario: A switch moves the table and both monitors

- **GIVEN** two declared channels, and row 84 named on channel 2 only
- **WHEN** the operator selects channel 2 **THEN** the table's rows are channel 2's, row 84 carries channel 2's name, both monitors read `CH 2`, and the bulk scope reads `CH 2` **AND WHEN** channel 1 is selected again **THEN** all of them are channel 1's

#### Scenario: The Inspector is the channel's too

- **WHEN** a channel-1 row is selected and the operator switches to channel 2 **THEN** the Inspector does not edit the channel-1 row under channel 2's tab

#### Scenario: A bulk verb names the channel on screen

- **WHEN** CLEAR ALL is confirmed on channel 2's view **THEN** exactly one `stack.clear-all` carrying channel 2 is sent, and channel 1's row stays on air **AND** the same press on channel 1's view names channel 1

#### Scenario: A reload opens on the first declared channel

- **WHEN** the operator has chosen channel 2 and the console reloads **THEN** it opens on the lowest declared channel, and the choice was written to no storage
- **WHEN** the station declares channels 2 and 3 **THEN** the console opens on channel 2

#### Scenario: One declared channel is exactly as before

- **WHEN** one channel is declared and CLEAR ALL is confirmed **THEN** `stack.clear-all` is sent with no argument

### Requirement: PANIC on a channel's view silences that channel, and a separate control silences every channel

The console SHALL, on a station that declares two or more channels, make the LIVE PLATES toolbar's PANIC the per-channel verb for the channel on screen — `stack.silence-channel-live-plates` carrying only that channel — labelled `Silence all plates · CH n`, with the accessible name `Silence all boxes on channel n — set every live plate the bridge has seated on channel n to zero` and a tooltip that says no other channel is touched. It SHALL offer a separate every-channel control in the app header beside the channel strip, never beside the per-channel one, reading `SILENCE ALL PLATES · EVERY CHANNEL` with the accessible name `Silence all boxes on every channel — set every live plate the bridge has seated to zero, whichever channel it is on`, calling `stack.silence-all-live-plates` bare. The every-channel control SHALL be present only for a principal holding the operator role and SHALL be absent while a lock covers any of the console's channels; the per-channel PANIC SHALL be present only where the principal can operate the channel on screen. With one declared channel there SHALL be no every-channel control and the toolbar's PANIC SHALL be exactly A16's — `Silence all plates`, the accessible name `Silence all boxes on every channel — …`, one bare `stack.silence-all-live-plates`. The report of what a PANIC did SHALL name its scope — ` · CH n` or ` · every channel` — and SHALL never read a press that reached nothing as a success.

#### Scenario: Channel 2's PANIC names channel 2

- **GIVEN** two declared channels and a plate live on channel 2
- **WHEN** channel 2 is on screen **THEN** the plates toolbar's PANIC reads `Silence all plates · CH 2` on its face, its accessible name and its tooltip **AND** one press sends exactly one `stack.silence-channel-live-plates` carrying channel 2, and its report names `CH 2`

#### Scenario: The every-channel control sits with the channels

- **WHEN** two channels are declared **THEN** the header carries `SILENCE ALL PLATES · EVERY CHANNEL`, the plates toolbar does not, and a press sends `stack.silence-all-live-plates` with no argument

#### Scenario: One declared channel keeps A16's PANIC

- **WHEN** one channel is declared **THEN** there is no every-channel control, and the toolbar's PANIC carries A16's every-channel wording and sends the bare verb

#### Scenario: Absent, never greyed

- **WHEN** the principal does not hold channel 2 **THEN** channel 2's PANIC is absent **AND** for one who does it is present
- **WHEN** the principal does not hold the operator role **THEN** the every-channel control is absent **AND** for an operator it is present

### Requirement: The playout tab shows the channel on screen

The playout tab SHALL list, on a station that declares two or more channels, only the playout rows of the channel on screen, each channel's rows under that channel; with one declared channel it SHALL list every row, as before.

#### Scenario: Each channel's rows under that channel

- **WHEN** both channels have a playout row and channel 1 is on screen **THEN** the playout tab lists channel 1's row and not channel 2's **AND** on channel 2 it lists channel 2's

### Requirement: Station setup's subtitle names the channel as the Playout does

Station setup's subtitle SHALL name the selected channel by its number and, when the Playout's catalogue names it, by that name in its own `<bdi>` isolate; with no catalogue name the line SHALL be exactly what it was.

#### Scenario: The catalogue's name follows the number

- **WHEN** the catalogue names channel 1 `خبر سراسری` **THEN** the subtitle reads `Channel 1 · خبر سراسری`, the name in its own isolate **AND** with no catalogue name the line is exactly what it was

### Requirement: A Station setup pane shows values to a principal who cannot apply them

Every Station setup pane whose apply route is `station-admin` — Servers, Channel, Live sources, Text file delimiters and Layers — SHALL show a principal who is not a station-admin the values in force as values: no field, no switch, no Add, Edit, Remove or Reset, no Apply and no Revert, and no standing notice about when Apply is available. Such a pane's legend and footer SHALL say it is read-only for this sign-in; the Channel pane, whose one control is a station-admin's, keeps its own read-only legend. A station-admin SHALL see the inputs and Apply exactly as before. A row's own Remove in the Layers table is an operator verb and SHALL follow the operator's permission, not this rule.

#### Scenario: An operator sees values, and a station-admin sees inputs

- **WHEN** an operator opens Servers, Live sources, Text file delimiters or Layers **THEN** each shows its values with no input, no Apply and no Revert **AND** a station-admin opening the same pane sees its inputs and its Apply

#### Scenario: Layers, the owner's case

- **WHEN** an operator opens Layers **THEN** each row reads Shown or Hidden and its name as text, and there is no switch, no name field, no `Apply layers` and no `Revert`

### Requirement: Another channel's warning or alarm is a mark on its tab

On a station that declares two or more channels, a channel whose view holds a warning SHALL carry an amber mark on its strip tab, and one whose view holds an alarm a red mark, spoken as "This channel has a warning" or "This channel has an alarm"; an alarm SHALL win over a warning. The mark SHALL be the only sign of that message outside its channel's view. With one declared channel no tab SHALL be marked.

#### Scenario: Foreign content on channel 2, read from channel 1

- **WHEN** foreign content sits on a channel-2 layer and channel 1 is on screen **THEN** channel 1's view carries no notice about it and channel 2's tab carries the amber mark **AND** on channel 2 the notice is there

#### Scenario: An alarm on channel 2

- **WHEN** channel 2's program output is missing **THEN** its tab carries the red mark and its alarm banner is only in channel 2's view

### Requirement: Persian in the chrome is drawn in Vazirmatn, and Latin keeps its font

The console's chrome SHALL draw every Persian glyph in the self-hosted Vazirmatn, from a chrome-only family of Vazirmatn's Arabic faces limited by `unicode-range` to the Arabic ranges and leading the page's font stack, so that any other character falls through to the stack exactly as before and Latin keeps the font it used. It SHALL be declared outside `fonts.css`, which is inlined into every exported template. This SHALL be measured in a real browser by the platform font the engine used, never by reading CSS.

#### Scenario: A Persian row name and a Latin one

- **WHEN** a row's Persian name and a row's Latin name are measured with CDP `CSS.getPlatformFontsForNode` **THEN** the Persian one is drawn in Vazirmatn **AND** the Latin one in exactly the font the previous stack gives it at the same weight and size

### Requirement: A refusal reads one line, in the operator's words

The console SHALL show a refused change as ONE line in its own words, naming what was refused and
what became of it (`DELTA-MULTI-CHANNEL-01-A` A5). An operator surface SHALL NOT show the bridge's
own `message` beneath a sentence of its own — that message is written for the record — and a fact
the sentence needs SHALL come as data, as the layer does on a refused hide. A refusal that carries
no code SHALL show the bridge's sentence as its one line. The Audit panel, a diagnostic surface,
MAY quote a failure beneath its sentence.

#### Scenario: Hiding a row with no CasparCG

- **WHEN** a station-admin hides layer 99 while what is on it cannot be verified **THEN** the
  refusal reads "Refused — what is on layer 99 cannot be verified right now, so it stays shown."
  and nothing else, with none of the bridge's words **AND** the row stays shown

#### Scenario: Hiding a row that is not empty

- **WHEN** layer 71 is not empty and a station-admin hides it **THEN** the refusal reads
  "Refused — layer 71 is not empty, so it stays shown."

#### Scenario: A Live sources refusal

- **WHEN** a live source's stream URL is refused **THEN** the rule is the one line **AND** the
  bridge's own sentence is not shown

### Requirement: A silence control SHALL be live only while its scope holds a live plate

`SILENCE ALL PLATES · EVERY CHANNEL` and each channel's `Silence all plates · CH n` SHALL be shown
disabled, in the neutral style and at the same size, while the live-layers ledger holds no seat in
their scope — any channel, or that channel — and amber and live as soon as it does. Their state
SHALL come from the predicate the bridge answers "nothing to silence" from (`ledgerChannels`), and a
ledger that has not arrived SHALL leave them live. The verbs themselves are unchanged.

#### Scenario: Nothing to silence

- **WHEN** no declared channel holds a live plate
- **THEN** the every-channel control is disabled and neutral, the same height, titled _"Nothing to
  silence — no channel holds a live plate."_

#### Scenario: Keyed to the channel

- **WHEN** one live plate is seated on channel 2
- **THEN** the every-channel control and channel 2's are live, and channel 1's is not

### Requirement: A new channel's bank SHALL show five rows of each band

A bank made for a NEW channel — at first-run, and for a channel Change channel… adds — SHALL show five
rows of each band, the highest of each (templates 99–95, beds 59–55), and hide the rest, once the
channel's occupancy read is known. A row whose layer the read reports carrying anything SHALL stay
shown, and with no reading or an unknown one every row SHALL be shown. When the bridge refuses the
bank for a hidden row (its own reading occupied or unknown), the console SHALL declare the channel
with every row shown instead. A channel already in the set SHALL keep its bank untouched.

#### Scenario: A new station shows five and five

- **WHEN** first-run declares two channels the tap reads
- **THEN** each shows templates 99–95 and beds 59–55, and the rest are hidden
- **AND** at 1920 × 1080 the ten rows fit with the beds in sight

#### Scenario: A row carrying something stays shown

- **WHEN** layer 90 of a channel carries a producer at the read
- **THEN** that channel's new bank shows row 90 as well

#### Scenario: Unknown is never hidden

- **WHEN** the channel cannot be read
- **THEN** the new bank shows every row

### Requirement: An AMCP refusal SHALL be said in the operator's words, from one mapping

The console SHALL turn a server reply (`amcp-NNN`) into the operator's words in ONE place, tailored
by what the refused command was for: a `DECKLINK` play refused with 403 or 404 SHALL read _"The
server has no DeckLink input n, or it is in use."_; a 404 on a media or stream play SHALL read _"The
server cannot find the file …"_; every other reply SHALL read its code's generic line (a channel
the server does not have, a setting it refused, what it cannot find, a failure while running it).
No operator surface SHALL show "AMCP" or the reply's number; the code and the command go to the log.

#### Scenario: A DeckLink play refused with 403 or 404

- **WHEN** the refused command is `PLAY 2-60 DECKLINK DEVICE 1` and the reply is 403, or 404
- **THEN** the words are _"The server has no DeckLink input 1, or it is in use."_

#### Scenario: A file that is not there

- **WHEN** the refused command is a media play and the reply is 404
- **THEN** the words are _"The server cannot find the file <name>."_, not the DeckLink line

#### Scenario: No surface shows the number

- **WHEN** any reply code from 400 to 503 is worded, with or without its command
- **THEN** neither the sentence nor the clause contains "AMCP" or the code

### Requirement: A refused take SHALL be said on its row and in its Inspector, in one line

A take the bridge refused and carries on the row SHALL be said in ONE line naming the row, the
refused source and the input it named, then what the refusal means (the one mapping): _"Bed 59 ·
studio1 (DeckLink 1): the server has no such input, or it is in use."_ The line SHALL appear on the
row and in its Inspector, in that channel's view only; another channel's view SHALL show only the
mark on that channel's strip tab. No banner SHALL repeat it. It SHALL go when the row is next taken
successfully, or cleared.

#### Scenario: The refused row says it, and nothing else does

- **WHEN** the take of the TICKER row is refused on its DeckLink plate
- **THEN** the row reads ERROR with the line, and its Inspector shows the same line
- **AND** no banner appears, and "AMCP" appears nowhere on the page

#### Scenario: Another channel's view shows only the mark

- **WHEN** the operator views the other channel
- **THEN** neither the line nor a banner is shown, and the refused row's channel tab carries a mark

#### Scenario: A take that lands clears it

- **WHEN** the row is taken again and the take lands
- **THEN** the line leaves the row and the Inspector, and the mark leaves the strip

### Requirement: The Inspector SHALL say a look is on air only when the server confirmed it

The Inspector's look badge SHALL read `ON AIR NOW` only while the row itself claims air — the row's
own green ON AIR mark: `on-air`, or a take the server acknowledged. A row in error (a refused take),
unconfirmed, unverified, or with its take still in flight SHALL NOT have its look said to be on air,
and neither SHALL the section's notes about what is actually on air.

#### Scenario: A refused take does not put its look on air

- **WHEN** the row's take was refused and the row reads ERROR
- **THEN** its selected look's badge does not say `ON AIR NOW`

#### Scenario: A take that lands does

- **WHEN** the row is taken and the server acknowledges it
- **THEN** the badge says `ON AIR NOW`

### Requirement: A row's PLAY SHALL be unavailable while the bridge would refuse its take

A row's PLAY SHALL be disabled while the bridge would refuse its take — the row is on air or
unsettled, or the published live-layers ledger holds a seat for it; the same `ownsLiveSeats` the
bridge refuses with — naming the row: _"<row> is already on air — take it out first."_ A take
the bridge refuses with `already-on-air` (a race, or another console's take) SHALL be reported in the
same sentence, in the row's own name. PLAY SHALL be available again once the row has left air or its
take has resolved as refused.

#### Scenario: An unconfirmed row does not offer PLAY

- **WHEN** a take's reply is overdue and the row reads `unconfirmed`
- **THEN** PLAY is disabled, is not lit in the air colour, and its title is the row's sentence

#### Scenario: A row whose plates are seated does not offer PLAY

- **WHEN** the ledger holds a seat for a row whose status reads loaded (adopted at a bridge restart)
- **THEN** PLAY is disabled with the row's sentence
- **AND** once CLEAR has taken the row out, PLAY is available

#### Scenario: A refused take can be tried again

- **WHEN** the row's take was refused and it reads ERROR
- **THEN** PLAY is available
