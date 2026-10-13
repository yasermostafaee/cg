# runtime-live-source-routing

## ADDED Requirements

### Requirement: A MONITOR / PFL channel lets an operator hear an input without touching programme

The installation SHALL be able to declare a **second CasparCG channel** as a MONITOR channel,
consuming `<system-audio/>` — and, for a multiview, `<screen/>` — fed per box by
`route://<pgm-channel>-<layer>`.

> 🔴 **GATED on `docs/recon/2026-08-23-audio-paths-walk.md` (W1, W2, W5, W6). Nothing here is
> built until that walk answers them on the production plant.**

An operator SHALL be able to select any live input and hear it on that channel **before and
while** it is on air, and doing so SHALL make **no change to the programme mix**: no `MIXER`
command SHALL be sent to the programme channel as part of monitoring.

Two constraints are recorded as part of this requirement because they bound what an
installation can be asked to configure:

- **`route://` requires the same `video-mode` / framerate on both channels.** A monitor channel
  at a different mode cannot carry a route from programme.
- **`<system-audio/>` always downmixes to STEREO.** A monitor channel is a listening path, not
  a multi-channel monitoring matrix.

#### Scenario: Monitoring an input that is already on air

- **WHEN** the operator selects a plate that is live on programme for monitoring
- **THEN** its audio is heard on the monitor channel and the programme channel's mix is
  unchanged — the plate's programme volume, and every sibling's, is exactly what it was

#### Scenario: Monitoring an input that is not on air

- **WHEN** the operator selects an input that no on-air row is currently showing
- **THEN** its audio is heard on the monitor channel, and nothing is seated on, or sent to, the
  programme channel

#### Scenario: A monitor channel declared at the wrong video mode is refused at the boundary

- **WHEN** an installation declares a monitor channel whose `video-mode` differs from the
  programme channel's
- **THEN** the configuration is refused where it is declared, naming the framerate constraint,
  rather than producing a silent monitor at playout

### Requirement: A box that is a template-internal video carries its own per-box gain

A box whose content is a `<video>` **inside the HTML template** SHALL carry a **per-box gain on
the existing look payload** to `@cg/template-runtime`, applied by the **`LookMediaPark` seam**
to that box's media element. CasparCG sees ONE audio stream for the whole html producer and
`MIXER` cannot reach inside it, which is why such a box cannot be addressed the way a Live
Source plate is.

> 🔴 **GATED on `docs/recon/2026-08-23-audio-paths-walk.md` (W3). Nothing here is built until
> that walk answers it on the production plant.**

The gain SHALL be applied through the same seam that already owns "is this member on screen",
so that a box hidden by the active look stays **silenced by the hold** regardless of its gain —
the park's silence half is not a policy and SHALL NOT become one.

The gain SHALL NOT be a second spelling of the plate volume: a template-internal box has no
CasparCG layer of its own, and a Live Source plate has no media element, so no box is addressed
by both.

#### Scenario: A template-internal box is turned down without touching its neighbours

- **WHEN** a per-box gain is set for a box that is a `<video>` inside the template
- **THEN** that element's volume changes and the other boxes in the same html producer are
  unaffected, with no `MIXER` command sent for any of them

#### Scenario: A hidden look's box stays silent whatever its gain says

- **WHEN** a per-box gain of full volume is set on a box inside a look that is not on screen
- **THEN** the element remains muted by the park, and the gain takes effect only when a look
  showing that box is entered

### Requirement: A master volume exists as the channel-wide fallback

`MIXER <channel> MASTERVOLUME <value>` SHALL be the channel-wide master.

> 🔴 **GATED on `docs/recon/2026-08-23-audio-paths-walk.md` (W4). This verb has never been sent
> on this plant. Nothing here is built until the walk shows it exists and takes.**

🔴 The PANIC control that ships in this change SHALL be built from **per-plate volume** and
SHALL NOT use `MASTERVOLUME`. A master that has never been exercised on this plant is not the
mechanism an emergency control may rest on.

#### Scenario: The master is set independently of per-plate volume

- **WHEN** the channel master is set to `0.5` while a plate's own intent is `1`
- **THEN** the plate's recorded intent is still `1` and the channel's output level is halved —
  the two are independent controls and neither rewrites the other

### Requirement: Every input can be metered, and the metering array IS the monitor array

Every live input SHALL be meterable, and the metering channel array SHALL be the SAME array as
the monitor channel array specified above — one feature, specified and costed once.

> 🔴 **GATED on `docs/recon/2026-08-23-audio-paths-walk.md` (W7, W8). Nothing here is built
> until that walk establishes what the plant actually emits.**

**THE CEILING, MEASURED, AND IT IS THE REASON FOR THIS DESIGN RATHER THAN A CAVEAT ON IT:**
`src/core/mixer/audio/audio_mixer.cpp` sets `state_["volume"]` to a `std::vector<int32_t>` of
**PEAKS — one per AUDIO channel (L/R), maximum across ALL mixed layers of that video channel** —
surfacing as `/channel/N/mixer/audio/volume`. There is **no per-layer variant**, and 2.3 removed
the older `…/audio/{n}/dBFS` addresses.

⇒ **A per-input meter CANNOT come from the programme channel's OSC.** Two paths SHALL be
provided, and no third is implied:

- **(a) Live Source plates → ONE CasparCG channel per metered input.** The MONITOR channel array
  specified above **IS** this metering array. They SHALL be specified, configured and costed as
  ONE feature; an installation SHALL NOT be asked to provision one set of channels for
  monitoring and another for metering.
- **(b) Template-internal `<video>` → a Web Audio `AnalyserNode`** inside
  `@cg/template-runtime`, pushed up the existing `__cg` seam. It SHALL involve no CasparCG
  channel and SHALL work on an installation with no monitor channel at all.

The wire extension points SHALL be the ones already in the tree: a new
**`osc.channel.audio.peak`** variant on `OscEventSchema`, and a **channel-only** case in
`OscInterestFilter.shouldEmit` alongside `osc.framerate` — which is today the only channel-only
case there.

**Pacing SHALL be a separate budget.** Meters need roughly **25 Hz with peak-hold and decay**,
and they SHALL NOT be pushed through the `OscRateLimiter` allowance that protects state events.
A meter that starves tally is worse than no meter.

🔴 **AN INTENT PILL IS NOT A METER.** "We asked for 100 %" and "sound is present" are different
claims. They SHALL be visually distinct wherever both appear, and SHALL NOT be merged into one
indicator.

#### Scenario: One routed input alone on a monitor channel

- **WHEN** exactly one live input is routed onto a monitor channel and nothing else is seated
  there
- **THEN** that channel's reported peak tracks that input and nothing else, which is what makes
  a per-input meter possible at all

#### Scenario: The programme channel's peak is not offered as a per-input meter

- **WHEN** four plates are on air on the programme channel
- **THEN** the console SHALL NOT present the programme channel's peak as any individual plate's
  level, because that value is the maximum across every mixed layer

#### Scenario: A template-internal video is metered with no monitor channel configured

- **WHEN** an installation has no monitor channel and a template-internal `<video>` box is
  playing
- **THEN** that box is still metered, from the `AnalyserNode` inside the template runtime

#### Scenario: Meters do not consume the state-event budget

- **WHEN** meters are running at their full rate
- **THEN** the delivery rate of layer and channel STATE events is unchanged, because meter
  events are paced on their own budget rather than through the state events' rate limiter

#### Scenario: Intent and level are shown as different things

- **WHEN** a plate's intent is full volume and its input is carrying silence
- **THEN** the intent indicator and the level indicator disagree visibly, and neither is drawn
  in a way that could be read as the other
