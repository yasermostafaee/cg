# designer-video-element — delta (media-phases-follow-composition, 2026-08-13)

Video phases gain a `source` field (they had none — manual was the only possibility) and the same
third source as the Lottie: `'composition'`. Units are NOT unified: video stays in the clip's own
milliseconds, and the shared comp-side derivation (`followWindowMs`) is consumed directly because
milliseconds are already its native space — the Lottie is the kind that needs a unit adapter.

## ADDED Requirements

### Requirement: Video phases gain a source, and the composition source derives the window

`VideoPhasesSchema` SHALL gain an optional `source` (`'manual' | 'composition'`); an absent
`source` SHALL be exactly manual-equivalent, so every stored scene round-trips unchanged. An
optional `holdAt` (ms) SHALL be meaningful only under `'composition'` and ignored otherwise.
Under `'composition'`, stored `introEnd`/`outroStart` are IGNORED but remain present (the Detach
landing slot), and the element's window through the clip SHALL be derived exactly as the Lottie's
— same anchors, same hold-time model, same clamps, through the SAME `followWindowMs` helper — with
one kind-specific resolution: a `loop` hold with NO authored idle range resolves to a FREEZE at
`H` under follow (looping the whole clip would abandon the held look follow promises to keep); an
authored idle range keeps looping. The stored `holdBehavior` is untouched; only the resolved hold
reads this way, and the Playout checklist's `infinite` mirror agrees with it.

#### Scenario: Absent source is manual-equivalent

- **WHEN** a stored scene carries video phases with no `source`
- **THEN** it parses and plays exactly as before this change, and re-saves unchanged

#### Scenario: The owner's case holds for video

- **WHEN** a 5 s clip (`durationMs` 5000) follows a 2 s composition whose content starts at 1 s
  with a 0.5 s OUT segment, with `holdAt` 3000
- **THEN** the derived window is intro `[2000 → 3000]`, hold at 3000, outro `[3000 → 3500]` —
  in the clip's own milliseconds, through the same helper the Lottie adapter delegates to

#### Scenario: A follow video with no idle range freezes at the hold time

- **WHEN** a follow-source video with `holdBehavior: 'loop'` and no authored idle range reaches
  its hold
- **THEN** it freezes at `H` and its hold COMPLETES (it can close a content-driven hold), and the
  Playout checklist does not mark it infinite

#### Scenario: A follow video with an authored idle range loops it

- **WHEN** a follow-source video with `holdBehavior: 'loop'` carries an authored idle range
- **THEN** the hold loops that range (never completing), and the checklist marks it infinite

#### Scenario: Follow scenes survive save/reload/export with the relationship intact

- **WHEN** a follow-source video scene is saved, reloaded, and exported
- **THEN** the stored phases still carry `source: 'composition'` and `holdAt` — the relationship,
  not baked numbers — and every surface derives the same window from it

### Requirement: The video Inspector presents follow exactly as the Lottie's

`VideoSections` SHALL present the same phase-source affordances as the Lottie Inspector: a
"Follow composition" choice, the derived window read-only (ms plus comp equivalents), ONE editable
"hold at" input (seeded from the shared poster midpoint on first set, clearable), Detach baking
the derived values to `manual`, and the no-lifecycle explanation. The at-rest poster
(`data-cg-poster-ms`) SHALL show the derived `H` for a follower.

#### Scenario: Video parity in the Inspector

- **WHEN** the operator selects "Follow composition" on a video element
- **THEN** the same controls, hints, clamp flags, and Detach behaviour appear as for a
  follow-source Lottie, in the clip's ms units

#### Scenario: The poster shows the held look

- **WHEN** a follow-source video is at rest on the canvas
- **THEN** its poster seeks to the derived `H` (falling back to `holdAt`, then the clip midpoint,
  before the runtime refines it), so the design surface shows the look the composition will hold
