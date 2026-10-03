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
separate server.` — and nothing else of explanation. Once the console has connected, the connection check
SHALL carry `CG Bridge found at <host>:<port>` — the address this console dialled.

#### Scenario: The question, and where it was found

- **WHEN** CG Control asks its first question **THEN** the CG Bridge field is empty, reads `Found
automatically`, and has the one hint line **AND WHEN** first-run shows the check **THEN** it reads `CG Bridge
found at 127.0.0.1:<port>`

### Requirement: The connection check SHALL be shown in four groups, in the order things happen

The connection check SHALL be shown, in first-run and in Station setup alike, as four visibly headed groups in
this order — **Reachable** (VPN or proxy, the route, the Playout's API, CG Bridge's address as dialled, this
station's ports), **Versions** (CG Bridge's version against this console's), **Sign-in** (whether this console
can sign in, this console's sign-in, CG Bridge's own Playout session), **After sign-in** (CasparCG through CG
Bridge, OSC, the CG license, the channels, where the Playout and CasparCG run) — so the sign-in reads as the
gate between them. Before any sign-in every line of the last group SHALL wait, neutral, saying what it waits
for. The order SHALL come from one constant both the bridge and the console read. Station setup SHALL run the
same check for a station admin on its Servers pane.

#### Scenario: Before and after the sign-in

- **WHEN** first-run opens on a Playout that answers **THEN** the groups read Reachable, Versions, Sign-in,
  After sign-in, and every line of After sign-in waits **AND WHEN** a station admin signs in **THEN** the
  CasparCG line passes in its group

#### Scenario: Run again from Station setup

- **WHEN** a station admin presses Check in Station setup → Servers **THEN** the same four groups run again

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

The LOG dialog SHALL ask CG Bridge for the audit 100 rows a page, newest first, following the page's cursor as
the list is scrolled to its end, and SHALL render only the rows in view (a virtualised list). Its filters —
channel, user, action, result — and its search SHALL be sent to CG Bridge and applied there. A row written
while the dialog is open SHALL appear at the top when it matches the filters.

#### Scenario: A long audit

- **WHEN** the audit holds 50,000 rows **THEN** the dialog shows its first rows within 1 s of being opened,
  with no more than 100 rows in the document **AND** scrolling to the end brings the next page, and a filter
  brings only matching rows

#### Scenario: Live

- **WHEN** a take is made while the dialog is open **THEN** its row appears at the top
