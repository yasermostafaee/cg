## MODIFIED Requirements

### Requirement: A connection check that runs again starts clean

The console SHALL clear every line of the connection check the moment a check is pressed — and when
first-run checks by itself with nothing yet shown — showing each line's subject in a neutral
checking state and no verdict until that check's own reply arrives (`CHECK-RERUN-01`); `R-081` —
every line, the console's own lines among them. One check SHALL run at a time: no check SHALL start
while another runs, so a sign-in during a check SHALL read that check's reply rather than start its
own, and a reply SHALL always belong to the check on screen. A check SHALL run when CHECK is pressed;
by itself, the console SHALL check once when a `station-admin` signs in during first-run with nothing
yet shown, once when a sign-in form opens with nothing shown (`DELTA-MULTI-CHANNEL-01-B` B2), and —
`R-081` — once when a station admin opens Station setup's Servers pane with nothing shown; and it
SHALL re-run at most ONCE while a line still waits (`DELTA-MULTI-CHANNEL-01-A` A2). That re-run SHALL
touch only the waiting lines — each its subject, checking, in place, while every other line keeps its
verdict — and SHALL ask the bridge to hold the AMCP line until the Playout lets this machine in or
names the approval. Nothing else SHALL start a check. While a check runs, CHECK SHALL stay disabled
and the address read-only. A line not checked (`skip`) and a line checking SHALL wear the quiet inks,
never the error ink, and the surface SHALL carry no explanatory prose.

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

- **WHEN** a check shows lines waiting for sign-in and a station-admin signs in **THEN** the check
  runs once more by itself, the waiting lines alone checking and every other line keeping its
  verdict, and asks the bridge to hold the AMCP line **AND** its reply fills in those lines only, and
  the check runs no more by itself — twice in all
- **WHEN** CHECK is then pressed **THEN** the check runs, starting clean
- **WHEN** no station-admin signs in **THEN** nothing runs by itself

#### Scenario: Station setup runs it for an admin

- **WHEN** a station admin opens Station setup's Servers pane **THEN** the check runs once, by
  itself **AND** for anyone else it runs only when CHECK is pressed

#### Scenario: Neutral is not red

- **WHEN** a line is not checked or checking **THEN** it is drawn in a quiet ink with its own mark
  **AND** a failed line is still drawn in the error ink

### Requirement: Not-on-air states are loud, and test mode can never be mistaken for air

The Runtime SHALL make it impossible for the operator to believe a graphic is on air when
it is not. A single pill among several is NOT sufficient: the failure this prevents was an
amber "OFFLINE (mock)" pill sitting beside a green "PRIMARY A HEALTHY", where the
reassuring claim won.

**Disconnected.** When the bridge link is not live, the Runtime SHALL show a persistent
full-width `role="alert"` banner stating that the Runtime is not connected, that nothing
can reach air, and that commands are refused. The banner SHALL offer a retry (and, inside CG
Control, a way to set the station up again). `R-087` (the owner, 2026-10-04): it SHALL NOT offer
a way into test mode, and no operator surface SHALL. On-air controls SHALL be disabled while
disconnected, with the reason surfaced — the UI SHALL mirror the bridge's refusal rather than
inviting a command it knows will be refused.

**Test mode.** Test mode SHALL never be entered automatically; since `R-087` only a test harness
enters it (the harness flag). While in test mode the Runtime SHALL show a persistent, visually
distinct, full-width TEST MODE banner stating that nothing is on air and no command reaches
CasparCG, and SHALL offer an explicit way to leave. Leaving or entering test mode SHALL NOT swap
the backend underneath a running session.

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

#### Scenario: The NOT CONNECTED banner offers no test mode

- **WHEN** the bridge is unreachable **THEN** the banner offers `Retry connection` (and, inside CG
  Control, `Set up again`) **AND** nothing on the page names test mode
- **WHEN** `Retry connection` is pressed **THEN** the console starts again

#### Scenario: On-air controls are disabled while disconnected

- **WHEN** the link is not live **THEN** the stack row's PLAY control is disabled and the
  reason is surfaced, so the operator is not invited to issue a command that would be refused

#### Scenario: Test mode is unmistakable

- **WHEN** the console is in test mode **THEN** a persistent full-width TEST MODE banner
  states that nothing is on air, and it is visible regardless of where the operator is
  looking in the app

#### Scenario: A simulated item is never badged as real air

- **WHEN** an item is "played" in test mode **THEN** its badge reads as simulated, visually
  distinct from the broadcast-red ON AIR badge a real on-air item carries

#### Scenario: The mock never claims a healthy server

- **WHEN** the app is in test mode **THEN** no CasparCG server is reported or shown as
  healthy — the server surface states that there is no server and the state is simulated

### Requirement: The audit log is read in the operator's terms

The Audit log panel SHALL show each entry's time as the console's LOCAL wall-clock time to the second,
with the record's own UTC stamp in its details, and SHALL show the local date with the time in the row.
It SHALL name the layer an entry concerns as the Layers table names that row (the configured alias, else
the default `Layer N` / `Bed N`), or — for a layer outside the declared bank — as CasparCG names it with
the fact that it is not a row stated, and SHALL name the template as the picker names it. The table SHALL
keep operator-facing names, coordinate and outcome; selecting the row SHALL move its item id, template id,
actor id, hashes, command and other technical facts into the persistent details pane, complete and copyable.
Channel SHALL be the first column. Every heading SHALL align with its own row values, and Item content SHALL
remain contained before Result even while the details pane narrows the table. Pressing the selected row again
SHALL deselect it and close the details pane. Previous/Next SHALL remain centred in the dialog footer,
independent of the Close action. On a narrow console, the six-column ledger SHALL retain a readable minimum
width and scroll inside its own frame; Event details SHALL open as a right-side drawer over the table rather
than compressing or moving it, and the filters and footer SHALL reflow without widening the page.
The record on disk SHALL be unchanged.

#### Scenario: The incident stamp reads as the control room clock

- **WHEN** an entry stamped `2026-09-04T12:18:47.561Z` is shown on a console in `Asia/Tehran` **THEN**
  its row reads local date `2026-09-04` and time `15:48:47`, and its details carry the UTC stamp

#### Scenario: The row and the template are named

- **WHEN** an entry names layer 9 in a bank whose beds are 1–9 and the template whose file was
  `3ghab.vcg` **THEN** the row reads `Bed 1 · 3ghab`

#### Scenario: A layer no row shows is named as CasparCG names it

- **WHEN** an entry names layer 60 outside every half of the bank **THEN** the row reads
  `layer 60 (not a row)`

#### Scenario: Technical facts stay complete and copyable

- **WHEN** an entry is selected **THEN** the details pane shows every id it carries in full and a copy
  control writes the full value, while the table row does not expose those internal ids as its sentence

#### Scenario: The table stays readable with details open

- **WHEN** a row with a long item name is selected **THEN** Channel is the first column, every heading aligns
  with its value, Item does not overlap Result, and Previous/Next remain centred away from Close
- **WHEN** that selected row is pressed again **THEN** it is deselected and the details pane closes

#### Scenario: The ledger stays usable in a narrow window

- **WHEN** the Audit log is open at a 900 px viewport with Event details visible **THEN** details span the
  table height as a drawer attached to its right edge, the six columns scroll horizontally inside the table,
  Previous/Next remain centred, and the document itself has no horizontal overflow

#### Scenario: A refused command is shown beside its code

- **WHEN** an entry carries `errorCode: amcp-404` and a recorded `command` **THEN** its details show both
  the code and the command line

## ADDED Requirements

### Requirement: The Layers badge SHALL count current row errors only, list them, and let each be dismissed

The Layers header's `N in error` SHALL count the items in `error` that are ROWS of the view — an item with a
layer on the view's channel — and SHALL drop as soon as they are gone. A failed import SHALL never be counted:
it is reported once, where it happened, with its reason. Pressing the badge SHALL list those rows, each by its
operator name and layer with the error's reason in words, and each SHALL carry `Dismiss`, which clears the
row's error on CG Bridge for every console; the row then reads the status it settled to. With no row in error
the badge SHALL not be shown.

#### Scenario: A broken package

- **WHEN** a `.vcg` that cannot be imported is imported from the picker **THEN** the picker says why, once, and
  the badge stays absent

#### Scenario: A real row error counts, and clears

- **WHEN** a take of a loaded row is refused by CasparCG **THEN** the badge reads `1 in error` and its list
  names that row **AND WHEN** the error is dismissed, or the row is taken again successfully **THEN** the badge
  is gone

### Requirement: The source picker's tabs SHALL start where its rows start

The source picker's `Inputs` and `Media` tabs SHALL be inset from the panel's edge by the same spacing as the
panel's rows, from the shared spacing tokens, in every place the picker opens (Look inputs, Source defaults,
the on-air swap); no other tab strip SHALL change.

#### Scenario: Measured in a real engine

- **WHEN** the picker is open **THEN** the first tab's text starts at the same distance from the panel's left
  edge as the first row's text, and not at the edge

### Requirement: Every operator name SHALL be laid out in its own direction, in its own isolate

A name the console shows SHALL be drawn in its own inline isolate inside an LTR line — every source,
template, channel and user name, from the Playout or typed by a user — laid out right to left when it
contains any right-to-left letter and left to right otherwise, in the dropdown's value and options, the
picker's rows, the Inspector, the Layers rows and the sign-in messages. A label that wraps a name in English
words — `Default (…)`, `Use template assignment (…)` — SHALL carry the name apart from its words.

#### Scenario: A Persian name that starts with a Latin word

- **WHEN** the input `NDI کانالِ ۱ (APASAI)` is shown as a plate's default, as a picker row, in the Inspector
  and on a Layers row **THEN** in each place it reads as the Playout shows it — `NDI` rightmost, `(APASAI)`
  leftmost — and the English around it stays where it was — control: `Studio 1` is laid out left to right

### Requirement: CG Control's first question SHALL say that CG Bridge's address may stay empty

The question CG Control asks with no station record SHALL show the `CG Bridge address` field empty with the
placeholder `Found automatically` and ONE hint line under it — `Leave empty unless CG Bridge runs on a
separate server.` — and nothing else of explanation. (Amended 2026-10-11, `SERVERS-SIMPLIFY-01`,
`openspec/changes/servers-simplify/`: the address is a `Host` and a `Port`, and once the Playout's host is
typed, that host is the CG Bridge host's placeholder — where it will be found.) Once the console has connected,
the connection check SHALL carry `CG Bridge found at <host>:<port>` — the address this console dialled.

#### Scenario: The question, and where it was found

- **WHEN** CG Control asks its first question **THEN** the CG Bridge field is empty, reads `Found
automatically`, and has the one hint line **AND WHEN** first-run shows the check **THEN** it reads `CG Bridge
found at 127.0.0.1:<port>`

### Requirement: The connection check SHALL be shown in four groups, in the order things happen

The connection check SHALL be shown, in first-run and in Station setup alike, as four visibly headed groups in
this order — **Reachable** (VPN or proxy, the route, the Playout's API, CG Bridge's address as dialled, this
station's ports), **Versions** (CG Bridge's version against this console's, and the Playout's own version —
`R-084`: CG Bridge asks `GET /api/v1/system/version` with no token and no `Origin`, reads `version` alone, and
says `not served` when the Playout does not answer it, which is never a refusal), **Sign-in** (whether this console
can sign in, this console's sign-in, CG Bridge's own Playout session), **After sign-in** (CasparCG through CG
Bridge, OSC, the CG license, the channels, where the Playout and CasparCG run) — so the sign-in reads as the
gate between them. Before any sign-in every line of the last group SHALL wait, neutral, saying what it waits
for. The order SHALL come from one constant both the bridge and the console read. Station setup SHALL run the
same check for a station admin on its Connection pane (named `Servers` until 2026-10-11, `SERVERS-SIMPLIFY-01`).

#### Scenario: Before and after the sign-in

- **WHEN** first-run opens on a Playout that answers **THEN** the groups read Reachable, Versions, Sign-in,
  After sign-in, and every line of After sign-in waits **AND WHEN** a station admin signs in **THEN** the
  CasparCG line passes in its group

#### Scenario: Run again from Station setup

- **WHEN** a station admin presses Check in Station setup → Connection **THEN** the same four groups run again

#### Scenario: The Playout's version

- **WHEN** the Playout answers `/api/v1/system/version` with `2.9.2` **THEN** the Versions group reads `Playout
2.9.2.` beside CG Bridge's release, the request carrying no token and no `Origin` — control: a Playout that does
  not answer it reads `The Playout's version: not served.`, and every other line of the check is unchanged

### Requirement: First-run's Sign in section SHALL show a blocker only once the check has a verdict

First-run's Sign in section SHALL show the check line that blocks a sign-in only when that line has a verdict
that blocks it; while the check is still running it SHALL show none, so no line of the check is ever drawn
twice.

#### Scenario: While the check runs

- **WHEN** first-run opens and the check is still running **THEN** the API line is drawn once, in the check

### Requirement: Every sign-in surface SHALL be one card, with the mark, the product name and the version

The Playout sign-in, CG Bridge's sign-in and first-run SHALL each be one centred card on the dark ground in the
splash's visual language, headed by the Apasai mark and the product name (`CG Control`), with the app's
version in small type at its foot; clear labels; a show/hide control on every password field, named `Show
password` / `Hide password`; Enter in any field submitting the form; and one error line in the message style.
They SHALL carry no explanatory prose, and SHALL use the shared primitives.

#### Scenario: The three surfaces

- **WHEN** the Playout sign-in, CG Bridge's sign-in or first-run is shown **THEN** it carries the mark, `CG
Control` and the version **AND** the password's show control reveals the password as text and hides it again
  **AND** Enter in the username field submits

### Requirement: The LOG dialog SHALL read the audit a page at a time from CG Bridge

The LOG dialog SHALL ask CG Bridge for the audit 25 rows a page, newest first, and SHALL expose Previous and
Next controls with the current page number. Its filters — channel, user, action, result — its search and an
inclusive local From/To date range SHALL be sent to CG Bridge and applied there; changing any of them SHALL
return to page 1. Selecting a row SHALL open a side pane that keeps its operator-facing outcome and complete
event facts visible, with full technical ids copyable there rather than filling the table row. A row written
while page 1 is open SHALL appear at the top when it matches the filters. While an older page is open, the
dialog SHALL announce that a new matching event exists without shifting that page. The table SHALL carry a
dedicated Channel column: the Playout catalogue name with `CH N` secondary, or `CH N` alone when no name is
published. The whole row SHALL be the details control and SHALL have a visible hover; it SHALL NOT repeat a
`View details` action inside the row. The footer SHALL show the exact total rows permitted by the console's
grant and matching the active filter, loaded independently so counting a long record does not delay page 1.

#### Scenario: A long audit

- **WHEN** the audit holds 50,000 rows **THEN** the dialog shows its first rows within 1 s of being opened,
  with no more than 25 event rows in the document **AND** Next brings the next 25 rows, Previous returns to
  the preceding 25, and a filter brings only matching rows on page 1

#### Scenario: Live

- **WHEN** a row is written while page 1 is open **THEN** it appears at the top without Refresh when it
  passes the filters, and does not appear when it does not
- **WHEN** a matching row is written while page 3 is open **THEN** page 3 does not move and the dialog offers
  the pending new event back on page 1

#### Scenario: Inspect one event

- **WHEN** the operator selects an event row **THEN** that row is visibly selected and a details pane shows
  its result, local and UTC time, actor, action, channel/layer when present, refusal or command facts when
  present, and full copyable item/template/actor ids when present

#### Scenario: Rows identify their channel and afford opening details

- **WHEN** a row on CH 2 is shown and the Playout names that channel `Sports` **THEN** its Channel cell reads
  `Sports` with `CH 2` secondary, hovering the row visibly highlights it, clicking anywhere on it opens the
  details pane, and no `View details` text is present
- **WHEN** the Playout publishes no name for CH 2 **THEN** the same cell reads `CH 2`

#### Scenario: The total is not the page size

- **WHEN** 250 permitted rows match while page 1 shows 25 **THEN** the footer shows 250 total events
- **WHEN** a filter leaves five permitted rows **THEN** the footer shows five total events, while the page
  remains independently usable if counting is still in progress

#### Scenario: Date range

- **WHEN** the operator chooses From `2026-11-01` and To `2026-11-02` **THEN** page 1 is requested with the
  console-local start of November 1 and end of November 2 converted to ISO instants
- **WHEN** From is later than To **THEN** the fields are marked invalid, the range is stated, and no audit
  page request is sent until the range is possible

### Requirement: The on-air swap dialog SHALL name plates and sources in the operator's words, and carry no paragraph

The on-air swap dialog SHALL label each plate `Plate N` — its place among the template's plates — with the
plate's id on the label's `title` only, as the Look inputs and the defaults dialog name a plate. Every source
it names — each plate's template assignment and every choice — SHALL go through the one choice label the
source pickers use: the Playout's name in its own direction, `none set` for no assignment, `Not listed` with
the id on its `title` for a source the catalogue does not know, and `Unavailable` for one the Playout no
longer offers. It SHALL carry no explanatory paragraph: its title states the scope, and each plate states
the assignment it returns to. Each plate's source picker SHALL be named `Live source for Plate N` — no plate
id in any accessible name in the dialog (`B-309`). What a swap sends SHALL NOT change.

#### Scenario: Names in the operator's words

- **WHEN** the swap dialog opens on an ON AIR row whose plates are assigned a Persian-plus-Latin source
  **THEN** each plate reads `Plate N`, the source reads in the name's own order, and no plate id appears in
  the dialog's text

#### Scenario: No paragraph

- **WHEN** the swap dialog opens **THEN** it carries no explanatory paragraph

#### Scenario: The wire is unchanged

- **WHEN** a plate is swapped to another source **THEN** CG Bridge sends exactly the AMCP lines it sent for
  the same swap before this change

#### Scenario: The picker's name

- **WHEN** the swap dialog opens on a template whose first plate is `guest-1` **THEN** that plate's picker is
  named `Live source for Plate 1`, and no accessible name in the dialog carries `guest-1`

### Requirement: A refused audio change on the Live plates tab SHALL name the plates it left alone as `Plate N`

When CG Bridge refuses part of an audio change made on the Live plates tab, the toast SHALL name each plate
that did not move `Plate N` (`plateLabelOf`, from the row's template), and SHALL count them when it has no
plate word — never name a plate by its id. The control pressed SHALL NOT replace that sentence with a generic
`Not accepted.` (`B-309`).

#### Scenario: Two plates refused

- **WHEN** a SOLO on a row's second plate is refused on its first and third **THEN** the one toast reads
  `Audio not applied to Plate 1 and Plate 3 — those plates are unchanged.`
