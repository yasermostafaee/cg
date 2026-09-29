# runtime-ui

## ADDED Requirements

### Requirement: PVW SHALL render the page the bridge stores for the row's channel

PVW SHALL render, for every rehearsing row, the page the bridge stores for the version the row's channel
lists — the same page `/template/<id>~<version>` serves CasparCG — read over the control socket
(`templates.page`), on any machine, in any browser or the installed app, with no import in that browser.
The browser's own copy of a page SHALL be used only when the bridge cannot be reached (the link is down,
the request fails in flight, or the bridge has no such route); a bridge that answers that it holds no page
SHALL be believed, and its answer shown. For a row whose page cannot be shown, PVW SHALL show one line in
words that names the template and the reason — the channel's list does not hold it, the bridge holds no
file for it, or the bridge cannot be reached and this browser holds no copy — while the rows that can be
drawn are drawn. PVW SHALL send nothing to CasparCG, and nothing stored SHALL be deleted.

#### Scenario: Another browser rehearses

- **WHEN** a template is imported in browser profile A **AND** a fresh profile B puts its row ON PVW
  **THEN** B renders the page, with no import in B

#### Scenario: The bridge holds no file

- **WHEN** the channel lists the template but the bridge's store has no file for its version **THEN** PVW
  shows one line naming the template and saying the bridge holds no page for it, and no frame

#### Scenario: The bridge cannot be reached

- **WHEN** the bridge cannot be reached **AND** this browser holds a copy **THEN** PVW renders that copy
- **WHEN** it cannot be reached **AND** this browser holds none **THEN** the one line says so

#### Scenario: The old sentence is gone

- **WHEN** a page cannot be shown **THEN** the words "re-import it in this browser" appear nowhere

### Requirement: A layer of ours cleared outside CG Control SHALL be said in the orphan strips' family

The console SHALL show a row off air, with one line in the orphan strips' family and their look, when the
bridge reports that a layer this station held on air was emptied by something else — another AMCP client,
the Playout, or CasparCG itself — per channel: `Layer <n> on CH <c> was cleared outside CG Control`.
The line SHALL be dismissible like the strips, and SHALL NOT offer any action that puts anything back.

#### Scenario: A foreign clear

- **WHEN** another AMCP client clears the page layer of a row on air **THEN** within 2 s the row reads off
  air and the line names its layer and channel

## MODIFIED Requirements

### Requirement: A new channel's bank SHALL show five rows of each band

A bank made for a NEW channel — at first-run, and for a channel Change channel… adds — SHALL show five
rows of each band, the highest of each (templates 99–95, beds 59–55), and hide the rest, once the
channel's occupancy read is known. A row whose layer the read reports carrying anything SHALL stay
shown, and with no reading or an unknown one every row SHALL be shown. When the bridge refuses the
bank for a hidden row (its own reading occupied or unknown), the console SHALL declare the channel
with every row shown instead. A channel already in the set SHALL keep its bank, with ONE exception
(`RELEASE-091-01` §7, the owner's decision of 2026-09-29): a bank that no operator has applied since
first-run declared it with every row shown — every template row an explicit `true`, which an operator's
Apply never writes — SHALL be brought once to the same five-row rule, by the bridge, as soon as the
channel's occupancy is known, keeping every occupied row shown. A bank an operator has applied SHALL
never be changed by this.

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

#### Scenario: A bank saved before the five-row default

- **WHEN** a station starts with a bank saved every-row-shown and the channel reads empty but for layer 90
- **THEN** it shows templates 99–95, row 90 and beds 59–55, and that bank is persisted
- **AND WHEN** the channel cannot be read **THEN** the bank is left as it is

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

A **non-`html`** layer inside the bands — a video, a plate or any other producer that nothing in this
station's ledger holds — SHALL surface as NEUTRAL information: a separate strip in the surface's normal
text tones (never amber, never the on-air red), without `role="alert"`, naming the channel-layer and the
observed producer kind and saying it was placed by another system. Unrecognised producer kinds SHALL be
presented exactly as video. `RELEASE-091-01` (DELTA B, B3) — because a layer in 50–99 is ours to manage
(plates this system seats are not `html`, and one left behind by another station, a lost ledger or a
crashed session has no other surface), each such row SHALL offer a Clear control gated by a confirmation,
exactly as an html row's, and the strip SHALL offer "Clear all listed", confirmed once, which clears every
layer the strip lists on that channel. Neither SHALL ever reach a layer outside 50–99, send a channel-wide
`CLEAR`, or clear a layer this station's ledger holds (the bridge refuses those regardless).

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

#### Scenario: A layer left in our band is listed and clearable

- **WHEN** the bridge publishes an orphan inside CG's bands whose producer kind is not `html` (e.g. an
  `ffmpeg` plate on layer 61 that no ledger record holds) **THEN** it renders in the neutral strip — normal
  text tones, no `role="alert"` — naming the layer and kind, with a Clear control
- **WHEN** the operator confirms that Clear, or "Clear all listed" **THEN** `layers.clear` is issued for
  each listed layer, and each row goes when the bridge resolves it
- **WHEN** a plate layer is held by this station's ledger **THEN** it is not listed (the control)

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
