# runtime-ui — delta (protect video layers, R-015)

## MODIFIED Requirements

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
