## MODIFIED Requirements

### Requirement: Orphan-layer warning surface with per-layer Clear

The Runtime UI SHALL split the bridge's orphan-layer set by observed producer kind, because the two
kinds mean opposite things to a graphics operator (R-015), and SHALL speak only for the layers
inside CG's bands (`FIELD-FIXES-01` L).

A layer BELOW CG's bands (1–49) carrying a producer this system did not place is the Playout's, and
normal: it SHALL raise no strip and no mark on its channel's tab, and it SHALL be listed on the
Station layers tab, as before.

An orphaned **`html`** layer inside the bands SHALL surface in a strip with `role="alert"` and the
accessible name "HTML producers outside your stack". Each row SHALL name the channel-layer, report
that it has an HTML producer outside the operator's stack and ask the operator to check Program
before clearing. The reported fact is producer occupancy. Output visibility and producer origin
are unknown. The row SHALL remain visible while the orphan persists or until the operator dismisses
the strip. Each html row SHALL offer an explicit Clear control gated by a confirmation. On confirm,
the UI issues `layers.clear` for that layer, surfaces a failure via the command-error channel and
treats the row's disappearance (the bridge's observed-empty resolution) as success. The UI SHALL
never clear a layer without the operator's explicit confirmation.

A **non-`html`** layer inside the bands — a video, a plate or any other producer that nothing in this
station's ledger holds — SHALL surface as NEUTRAL information: a separate strip in the surface's normal
text tones (never amber, never the on-air red), without `role="alert"`, naming the channel-layer and the
observed producer kind and saying it was placed by another system. Unrecognised producer kinds SHALL be
presented exactly as video. `RELEASE-091-01` (DELTA B, B3, `B-292`) — because a layer in 50–99 is ours
to manage (plates this system seats are not `html`, and one left behind by another station, a lost ledger
or a crashed session has no other surface), each such row inside 50–99 SHALL offer a Clear control gated
by a confirmation, exactly as an html row's; a non-`html` row above 99 SHALL offer none and SHALL say it is
not clearable from here. The console and the bridge SHALL read ONE predicate for "inside 50–99"
(`inAnyLayerBand`). Each strip that lists two or more layers inside 50–99 SHALL offer CLEAR ALL LISTED:
one confirmation naming every layer it will clear, then one `layers.clear` per layer, in turn. Neither
SHALL ever reach a layer outside 50–99, send a channel-wide `CLEAR`, or clear a layer this station's
ledger holds or a stack item's layer (neither is listed, and the bridge refuses them regardless). Single and
batch Clear confirmations SHALL name the affected layers, describe removal of their producers and
ask the operator to check Program before clearing.

Each strip SHALL carry a dismiss control inside its box. A dismissal SHALL record, per channel and
per strip, the layers and producers the strip showed; the strip SHALL stay dismissed until it holds
a layer or a producer the dismissal did not record — a new layer, or a different producer on a layer
— and SHALL NOT return because a layer left it or because the same set was observed again. A
dismissal SHALL belong to the browser it was made in and SHALL survive a reload. A channel's tab
SHALL carry the warning mark while any strip of that channel stands — either orphan strip, or the
cleared-outside strip — and not while all are dismissed.

Both surfaces SHALL subscribe to the pushed orphan set, load the initial state on mount, and render
NOT AT ALL when their subset is empty — no idle noise.

#### Scenario: html orphans appear as warnings; idle is quiet

- **WHEN** the bridge publishes orphans inside CG's bands whose producer kind is `html` **THEN** the
  warning strip identifies each channel-layer and its HTML producer outside the stack, and asks
  the operator to check Program before clearing
- **WHEN** the orphan set is empty **THEN** no orphan surface of either kind is rendered

#### Scenario: Confirm-gated Clear on an html orphan

- **WHEN** the operator clicks an html row's Clear **THEN** the confirmation names the layer and
  describes removal of its producer
- **WHEN** the operator confirms **THEN** the UI issues
  `layers.clear` for exactly that layer, and the row disappears when the bridge resolves it on
  observed empty
- **WHEN** the operator cancels the confirmation **THEN** nothing is sent

#### Scenario: A layer left in our band is listed and clearable

- **WHEN** the bridge publishes an orphan inside CG's bands whose producer kind is not `html` (e.g. an
  `ffmpeg` plate on layer 61 that no ledger record holds) **THEN** it renders in the neutral strip — normal
  text tones, no `role="alert"` — naming the layer and kind, with a Clear control
- **WHEN** the operator confirms that Clear **THEN** exactly one `layers.clear` is issued for that layer,
  and the row goes when the bridge resolves it; a cancelled confirmation sends nothing
- **WHEN** the strip lists 1-70, 1-71, 1-72 and 1-120 and the operator confirms CLEAR ALL LISTED
  **THEN** the confirmation names 1-71 and 1-72 (after 1-70 was cleared on its own), one `CLEAR` goes to
  each, in turn, and none to 1-120 or to the channel
- **WHEN** a non-`html` layer is above the bands (1-120) **THEN** its row offers no Clear and says it is not
  clearable from here (the control)
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
