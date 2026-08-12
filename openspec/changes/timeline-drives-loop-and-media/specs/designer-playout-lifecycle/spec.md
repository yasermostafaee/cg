# designer-playout-lifecycle — delta (D-133 design phase, 2026-08-12)

Encodes the LOOP RANGE: what it is in the shipped lifecycle model, what wrapping at its end does,
and — the part that is the item — what wrapping must NOT do. Implementation is a later PR, gated on
`design.md` §9 — see this change's `tasks.md` §0.

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

### Requirement: The loop range is authorable UNCONDITIONALLY on the main scene

The main scene SHALL offer the loop option ALWAYS. Authoring a loop range SHALL NOT require a
content-driven element to be present: it SHALL be authorable with nothing but shapes on the scene.
The existing "Pin content start" affordance — gated today on a composition containing a ticker,
sequence or countdown clock — SHALL be at most a SHORTCUT to the loop range, never the only path to
it.

The gate being removed is also NARROWER than the hold rule it appears to serve: it counts only
ticker / sequence / countdown clock, while an opted-in Lottie or video also drives a hold. A
composition held by an opted-in Lottie therefore has a content-driven hold today and no way to pin
its content start. Removing the gate resolves that discrepancy; if any gate is retained in its
place, the discrepancy SHALL be fixed explicitly instead.

No backward compatibility is owed to the conditional affordance: nothing has been delivered to the
client, so the compatibility floor is unset.

#### Scenario: A shapes-only scene can author a loop range

- **WHEN** the main scene contains no ticker, sequence or countdown clock
- **THEN** the loop option is still offered and the loop range is authorable

#### Scenario: A Lottie-held composition can pin its content start

- **WHEN** a composition's only hold driver is a Lottie with `drivesHold: true`
- **THEN** its content start is authorable, exactly as it is for a ticker-held composition

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

### Requirement: With a non-content-driven hold, an authored loop range is INERT

WHEN the hold is NOT content-driven, an authored loop range SHALL have NO playback effect.
Authoring it is allowed; it is simply inert, and the timed hold continues to park on `outPoint` for
`holdMs` exactly as it does today.

> ⚠ **OPEN — `design.md` §9.1.** The alternative is that a `timed` hold LOOPS the range for
> `holdMs`. That is the more useful product and the more expensive decision: `timed` is the DEFAULT
> hold, so every existing shape-only composition carrying a `contentStart` would change what it
> does. This requirement states the item as filed; it is not settled until §9.1 is answered.

#### Scenario: A timed hold ignores the loop range

- **WHEN** a composition's hold resolves to `timed` and a loop range is authored
- **THEN** playback holds `outPoint` for `holdMs` and never wraps
