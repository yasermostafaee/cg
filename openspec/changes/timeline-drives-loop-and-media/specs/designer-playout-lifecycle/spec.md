# designer-playout-lifecycle — delta (D-133, 2026-08-12)

Encodes the LOOP RANGE: what it is in the shipped lifecycle model, what wrapping at its end does,
and — the part that is the item — what wrapping must NOT do. The owner's answers to `design.md`
§9.1 and §9.2 are folded in: an inert range MUST explain itself, and the loop range does NOT create
an out-point as a side effect.

## ADDED Requirements

### Requirement: The loop range IS `[contentStart → outPoint]` — no new lifecycle mode

The loop range SHALL be expressed with the SHIPPED lifecycle markers: `contentStart` is the loop
START and `outPoint` is the loop END. Looping SHALL be a RENDERING OF THE EXISTING HOLD, not a new
lifecycle phase and not a new `PlayoutMode`. No new lifecycle mode SHALL be introduced by this
feature.

The mapping is exact rather than approximate. A content-driven hold today parks the timeline on the
single `outPoint` frame while the scope's content drivers run on their own clocks; looping replaces
that frozen frame with a repeating render of `[contentStart → outPoint]`. The hold's START
condition, its END condition and the OUT phase that follows are all unchanged.

#### Scenario: The loop range is the two existing markers

- **WHEN** a composition has a `lifecycle` with `contentStart` and `outPoint`
- **THEN** the timeline's loop range is `[contentStart, outPoint]`, with no additional stored field

#### Scenario: No new playout mode appears

- **WHEN** a composition carries a loop range
- **THEN** its `playout.mode` is one of the shipped values and no new mode value exists

### Requirement: The loop range is authorable on ANY composition that has an out-point

The loop option SHALL be offered on EVERY composition that has an out-point, with NO further
condition. Authoring a loop range SHALL NOT require a content-driven element to be present: it
SHALL be authorable with nothing but shapes on the scene. The existing "Pin content start"
affordance SHALL be at most a SHORTCUT to the loop range, never the only path to it.

The condition that is removed is the CONTENT condition — a composition containing a ticker, a
sequence or a countdown clock. The condition that REMAINS is the out-point, and it remains for a
reason that is not convenience: `contentStart` is schema-constrained to
`[activeRange.in, outPoint]`, so a loop range cannot exist without one, and creating an out-point is
not a marker edit — it moves the composition out of `static`, giving it an animated OUT segment
where it previously hard-cut on stop. **Authoring a loop range SHALL NOT create an out-point as a
side effect.** The out-point remains an explicit, separately-authored step through the shipped
"Add out point" affordance, which is on the same panel.

Because the loop range is therefore not offered on a composition with no out-point, the "never the
only path" guarantee is discharged by the loop range being **present by default** for a composition
that loops or holds (see the next requirement), not by the removal of the content gate alone.

No backward compatibility is owed to the conditional affordance: nothing has been delivered to the
client, so the compatibility floor is unset.

#### Scenario: A shapes-only scene can author a loop range

- **WHEN** the main scene has an out-point and contains no ticker, sequence or countdown clock
- **THEN** the loop option is still offered and the loop range is authorable

#### Scenario: A Lottie-held composition can pin its content start

- **WHEN** a composition's only hold driver is a Lottie with `drivesHold: true`
- **THEN** its content start is authorable, exactly as it is for a ticker-held composition
- **NOTE** this holds TODAY and is kept as a REGRESSION GUARD, not as a fix: the affordance's gate
  already counts an opted-in Lottie or video, so removing it does not change this case

#### Scenario: Authoring a loop range does not create an out-point

- **WHEN** a composition has no out-point
- **THEN** authoring a loop range is not offered as an action that would create one, and the
  composition's playout mode is unchanged by anything the loop-range surface does

### Requirement: The loop range renders on the timeline with full-height markers

The timeline SHALL show the loop range with start and end markers whose indicator lines extend the
FULL timeline height, present BY DEFAULT for a composition that loops or holds rather than being
hand-added each time.

The timeline already carries a TRANSPORT `loop` toggle (an authoring convenience that wraps the
playhead across the active region) and the playout model already carries a `loop-cycle` mode. This
loop range is a THIRD thing, and the surface SHALL make the three distinguishable rather than
labelling more than one of them "loop".

#### Scenario: Markers span the timeline height

- **WHEN** a composition's loop range is shown
- **THEN** its start and end indicator lines extend the full height of the timeline

#### Scenario: The three loops are distinguishable

- **WHEN** a composition has both a transport loop toggle available and a loop range authored
- **THEN** the surface names them distinctly, so neither reads as the other

### Requirement: At the loop end the playhead wraps and the driver's content DOES NOT RESET

WHEN a content-driven hold is running and playback reaches the loop end, the playhead SHALL wrap to
the loop start and the content drivers SHALL CONTINUE UNBROKEN across the seam. A ticker set to
repeat 3× SHALL keep flowing across the wrap; its text SHALL NOT restart, and its repeat count SHALL
NOT be consumed by the wrap.

🔴 **The wrap SHALL be a re-render of the COMPOSITION FRAME ONLY.** It SHALL NOT call `reset()`,
`start()`, or any lifecycle transition on any content driver. This is the item, not a detail of it:
"wrap the playhead, continue the content" is a different machine from "wrap the playhead, restart
the content", and a design that restarts the driver at the seam does not satisfy this requirement
even when the playhead behaviour is identical.

The mapping in the first requirement is chosen precisely because it makes the restart UNREACHABLE
rather than merely forbidden — the content drivers were never part of the held range, so there is
nothing connecting them to the wrap to reset.

#### Scenario: A ticker flows across the seam

- **WHEN** a ticker set to repeat 3× is driving the hold and playback reaches the loop end
- **THEN** the playhead wraps to the loop start
- **AND** the ticker's text keeps flowing unbroken, with no visible restart

#### Scenario: The wrap issues no driver lifecycle call

- **WHEN** playback wraps at the loop end
- **THEN** no content driver receives `reset()`, `start()` or any other lifecycle transition

#### Scenario: The wrap does not consume a repeat

- **WHEN** a ticker set to repeat 3× crosses two loop seams
- **THEN** it has consumed no repeats through the wraps themselves

### Requirement: When the driver completes, playback passes the loop end and the OUT phase runs

WHEN the content driver has completed its repeats, playback SHALL pass the loop end WITHOUT
wrapping and the OUT phase of the other elements SHALL run. The loop therefore ends when the DRIVER
ends — it is not counted by a wrap count, and it does not consume `playout.repeat`, which counts
whole `loop-cycle` open/close cycles and is a different axis.

#### Scenario: After N repeats the loop is left, not wrapped

- **WHEN** a ticker set to repeat 3× has completed its third pass and playback reaches the loop end
- **THEN** the playhead does NOT wrap
- **AND** the other elements' out phase runs

#### Scenario: An infinite driver never leaves the loop

- **WHEN** the hold's driver is infinite
- **THEN** playback keeps wrapping at the loop end until the composition is stopped

### Requirement: With a non-content-driven hold, an authored loop range is INERT — and the surface SAYS SO

WHEN the hold is NOT content-driven, an authored loop range SHALL have NO playback effect.
Authoring it is allowed; it is simply inert, and the timed hold continues to park on `outPoint` for
`holdMs` exactly as it does today.

**The surface SHALL state that the range is inert, and SHALL state what would make it active.** An
inert control with no explanation teaches the operator nothing, and the effective hold-driver
predicate is already resolved on this panel, so the explanation SHALL be EXACT — it names the
missing condition (this composition has no effective hold driver, so its hold is timed) rather than
offering generic text.

This is the item as filed, and it is settled (`design.md` §9.1). The alternative — a `timed` hold
LOOPING the range for `holdMs` — is rejected: it contradicts the item, it would change the
behaviour of every composition that has a driver but never touched the hold select (`holdSource`
defaults to `timed` even when drivers are present), and it has no defined duration at all under
`manual` or `static`, where `holdSource` is ignored entirely.

#### Scenario: A timed hold ignores the loop range

- **WHEN** a composition's hold resolves to `timed` and a loop range is authored
- **THEN** playback holds `outPoint` for `holdMs` and never wraps

#### Scenario: The surface explains why an authored range is inert

- **WHEN** a loop range is authored on a composition whose hold resolves to `timed`
- **THEN** the surface states that the range has no playback effect
- **AND** it states what would make it active — a content-driven hold with an effective driver
