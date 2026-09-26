# runtime-ui

## ADDED Requirements

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

## MODIFIED Requirements

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
