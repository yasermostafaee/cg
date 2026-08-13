# designer-lottie-element — delta (media-phases-follow-composition, 2026-08-13)

The phase mapping gains a third source: `'composition'`. The element stores the RELATIONSHIP —
"my intro settles at the composition's content start; my outro fits its OUT segment" — and the
values are DERIVED wherever phases are resolved, so a marker drag moves them with no re-sync.

## MODIFIED Requirements

### Requirement: Phases come from bodymovin markers, else manual marking

The element's phase mapping SHALL be read from a valid bodymovin `markers` set when present — the
intro-end and outro-start frames (plus an optional idle segment), in the animation's own frame space —
and SHALL otherwise fall back to manual marking, where the operator sets those frames by hand in the
Inspector against the animation's own frame space. A valid marker set SHALL satisfy
`ip ≤ introEnd ≤ outroStart ≤ op`; an incomplete or out-of-range set SHALL be treated as no markers.

A THIRD source, `'composition'`, SHALL make the element FOLLOW the composition's lifecycle: its
window through the clip is DERIVED from the composition's anchors (see the follow requirement
below) and the stored `introEnd`/`outroStart` values are IGNORED while it is active — they remain
present so a Detach has somewhere to land without a shape change. An optional `holdAt` (animation
frames) SHALL be meaningful only under `'composition'` and ignored otherwise. Both additions SHALL
be strictly additive: every stored scene round-trips unchanged.

#### Scenario: Markers drive the phase mapping

- **WHEN** the imported JSON carries recognised `intro-end` / `outro-start` markers (and optionally an
  idle pair) with in-range, ordered frames
- **THEN** the element's phase mapping is read from them and marked as marker-sourced

#### Scenario: No usable markers falls back to manual marking

- **WHEN** the imported JSON has no markers, or a marker set that is incomplete or out of range
- **THEN** the operator marks intro-end / outro-start (and optionally the idle segment) by hand in the
  Inspector, clamped to `ip ≤ introEnd ≤ outroStart ≤ op`

#### Scenario: The composition source ignores the stored frame values

- **WHEN** an element's phases carry `source: 'composition'` alongside stored
  `introEnd`/`outroStart` values
- **THEN** the stored values are ignored and the window is derived from the composition's
  lifecycle anchors, and the scene round-trips with the stored values intact

#### Scenario: Scenes authored before this change round-trip unchanged

- **WHEN** a stored scene carries `markers`/`manual` phases, or none
- **THEN** it parses, renders, and re-saves byte-identically in behaviour — the third source and
  `holdAt` are additive

## ADDED Requirements

### Requirement: A follow-source Lottie derives a continuous window anchored at the hold time

Under `source: 'composition'`, the element's window through the clip SHALL be derived from the
composition's anchors — `active.in`, the effective content start, `lifecycle.outPoint`,
`active.out` — as a CONTINUOUS window anchored at the hold time `H`:

- `H` = `holdAt` (animation frames) when authored, else clip start + entrance span — the default
  degenerates exactly to "play the clip from its head".
- intro = `[max(clipStart, H − entranceSpan) → H]`: the clip reaches its hold look EXACTLY at the
  effective content start, skipping as much of the clip's head as the entrance cannot fit.
- hold = freeze at `H`; an AUTHORED idle range keeps working and composes with `H`; idle is never
  derived — absent means freeze.
- outro = `[H → min(H + outSpan, clipEnd)]` — continuous from the held frame, so there is no
  hold→outro pop by construction.
- `speed` is NEVER touched: the window changes WHICH frames play, never the rate.

The derivation SHALL exist ONCE (comp-side math in `followWindowMs`, the Lottie frames↔ms
conversion in `lottieFollowWindow`), and SHALL run where phases are resolved (`createRuntime`), so
the canvas re-derives on every scene replace and preview/export/air run the same code on the same
scene — no surface bakes a copy. Clamped cases (`H` smaller than the entrance span; `H + outSpan`
past the clip end; `H` past the clip end; a clip shorter than the entrance under default `H`;
**a zero-length OUT segment — the out point at, or on a legacy scene past, `activeRange.out` —
which derives NO outro**) SHALL clamp as stated and be surfaced through the EXISTING hint
machinery. The zero-OUT-segment case in particular SHALL NEVER be silent (session V,
owner-observed 2026-08-13): the shape is reachable by ordinary authoring, and an unexplained
frozen outro reads as a defect — the window carries a `noOutSegment` clamp flag and the Inspector
explains it and names the way out (move the out point, or extend the active range).

#### Scenario: The owner's case — 5 s clip, hold at second 3, 2 s composition

- **WHEN** a 5 s clip follows a 2 s composition whose content starts at 1 s with a 0.5 s OUT
  segment, with `holdAt` at clip-second 3
- **THEN** the intro plays clip `[2 s → 3 s]` during the entrance, the hold sits on second-3's
  look throughout, and the outro plays clip `[3 s → 3.5 s]` — head and tail deliberately unplayed

#### Scenario: Default hold time plays the clip from its head

- **WHEN** a follow-source element has no `holdAt`
- **THEN** the intro is `[clipStart → entranceSpan]` and the outro `[entranceSpan →
entranceSpan + outSpan]` — the simple case is the general rule at `H` = entrance span, not a
  separate branch

#### Scenario: Dragging a lifecycle marker moves the window with no re-sync step

- **WHEN** the composition's `outPoint` or `contentStart` is dragged after a follow-source element
  was configured
- **THEN** the next resolution derives the moved window from the same stored relationship — no
  stored value changed and no button was pressed

#### Scenario: Clamps flag through the existing hints

- **WHEN** `H` is smaller than the entrance span, or `H + outSpan` passes the clip end, or a stale
  `holdAt` sits past the clip end
- **THEN** the window clamps to the clip's bounds as specified and the Inspector's existing hint
  machinery flags it — no second warning surface

#### Scenario: A zero-length OUT segment is flagged, never silent

- **WHEN** the composition's out point sits at the end of the active range (`outSpan` 0), with a
  follow-source element on the scene
- **THEN** the derived window has NO outro (`outroEnd == H` — the held look persists through the
  exit, on the canvas and on air alike), the window's clamps carry `noOutSegment`, and the
  Inspector's hint says so and names the remedy — drag the out point earlier or extend the active
  range past it

#### Scenario: Shrinking the active window re-clamps the lifecycle markers

- **WHEN** the total duration or the active-region bar is pulled below the out point (or the
  content-start marker)
- **THEN** the markers ride the SAME clamp `setLifecycle` applies (`activeRange.in ≤ contentStart
≤ outPoint ≤ activeRange.out`) instead of stranding outside the active range — a stranded marker
  made the scene UNPARSEABLE (`refineLifecycle` rejects it, so a save could not re-load) and
  silently zeroed every follower's OUT segment

#### Scenario: An authored idle range composes with the hold time

- **WHEN** a follow-source `idle-loop` element carries an authored idle range
- **THEN** the hold idle-loops that range while the window (intro end, outro span) is unchanged

#### Scenario: A follower contributes nothing to the entrance settle

- **WHEN** a `source: 'composition'` Lottie sits in a composition whose content start is derived
  by the entrance-settle heuristic
- **THEN** it contributes `settleOffset: null` — the existing marker-less rule, reused — because a
  value derived FROM the effective content start must not vote on it

#### Scenario: A composition with no lifecycle behaves as marker-less, and says why

- **WHEN** a follow-source element sits in a composition with no `lifecycle`
- **THEN** the runtime behaves exactly as for a marker-less clip, and the Inspector explains that
  there is nothing to follow rather than silently disabling the mode

### Requirement: The Inspector offers Follow composition, one hold-at input, and Detach

The phase-source control SHALL offer "Follow composition" for the Lottie (and the video's
Inspector SHALL present the same). Under follow the derived window SHALL be shown READ-ONLY with
its comp-frame equivalents, plus ONE editable input — "hold at" (`holdAt`, clip time) — seeded on
first set from the SHARED poster/midpoint helper (the project's definition of the representative
settled look) and clearable back to the default. A **Detach** action SHALL bake the
currently-derived values into `source: 'manual'` and re-enable the manual inputs.

#### Scenario: Detach bakes exactly what was derived

- **WHEN** the operator detaches a follow-source element
- **THEN** the stored phases become `source: 'manual'` carrying the exact currently-derived
  window values, the element stops following, and the manual inputs edit from there

#### Scenario: The hold-at seed comes from the shared helper

- **WHEN** the operator first sets "hold at" on a follow-source element
- **THEN** the seeded value comes from the SAME midpoint helper the poster and the manual-phase
  seed already use — one definition, not a copy
