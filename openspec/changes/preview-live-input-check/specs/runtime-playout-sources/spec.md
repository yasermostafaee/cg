## ADDED Requirements

### Requirement: A live-input check SHALL resolve only a current catalogue source and SHALL change no binding

`Check input` SHALL carry only the selected source identity and channel. CG Bridge SHALL resolve both from its own
current Playout catalogue and SHALL send the accepted saved-input request to Playout; the console SHALL NOT supply a
kind, address, URL or credential. Ad-hoc sources outside D10 are not part of this capability.

A check SHALL be refused before the preview API when the source is absent, unusable, unavailable or incompatible
with the selected channel. The response SHALL use the canonical `SourceLabel` and Playout reason, never the source id
or address. This checkability rule SHALL NOT change whether an unavailable source can be stored in an off-air preset.

#### Scenario: A healthy listed source

- **WHEN** D10 currently lists `Studio A` as usable, available and compatible with channel 1 and the operator checks it
- **THEN** Bridge resolves the catalogue entry and asks Playout to preview that saved input on channel 1
- **AND** no source binding or default changes

#### Scenario: A listed but unavailable source

- **WHEN** D10 lists `Guest 2` as unavailable with reason `No signal`
- **THEN** `Check input` is refused with `Guest 2` and `No signal` before a preview request
- **AND** the same source remains eligible for the existing off-air preset workflow

### Requirement: Checking from Source defaults SHALL be independent of that dialog's commit model

Opening, replacing or stopping a live-input check from Source defaults SHALL NOT select the source for a plate, save
defaults, apply a row override, clear a dirty edit or close the dialog. The check SHALL use the row explicitly acted
on, not an uncommitted selection elsewhere in the dialog.

#### Scenario: Preview a source other than the draft

- **WHEN** Plate 1's draft remains `Studio A` and the operator presses `Check input` on `Guest 2`
- **THEN** the check targets `Guest 2`, Plate 1's draft remains `Studio A`, and no default is saved

### Requirement: The source label and availability shown in the check SHALL follow catalogue changes

The check card SHALL use the same canonical source label as look inputs, on-air readouts and refusals. If a catalogue
refresh removes the current source or marks it unavailable, Bridge SHALL end the check and publish that source and
reason; it SHALL NOT silently retain the last picture under an obsolete label.

#### Scenario: The checked input loses signal

- **WHEN** `Studio A` is live in the check and the next accepted catalogue says it is unavailable with reason
  `Holder disconnected`
- **THEN** the check ends, removes its picture and names `Studio A — Holder disconnected`
- **AND** existing saved bindings are retained under their established rules
