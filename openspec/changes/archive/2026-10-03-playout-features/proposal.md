# playout-features — adopt Playout `2.9.1`/`2.9.2`: the backup's own clip, `ownOutputOf`, the playlist output as a box source, the CG license, and PGM sound with a VU meter (`B-286`, `B-298`, `R-075`, `R-076`, `R-077`)

Prompt: `PLAYOUT-FEATURES-01` (v1), 2026-09-30, which replaces `SOURCES-FOLLOWUP-01` (never given). Order:
after `CENTRAL-BRIDGE-01` (v3) + `DELTA-CENTRAL-BRIDGE-01-A`, archived at `a8b59df5`. Sources, adopted into
`docs/integration/playout/`: `PLAYOUT-CG-RESPONSE-ROUTE-ON-DONE-v1.md` (`2.9.1`, on `.111`: parts A and B),
`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` (`2.9.2`: parts C and E) and `PLAYOUT-CG-RESPONSE-LICENSE-v1.md`
(`2.9.2`: part D). `2.9.2` is not on `.111` yet; the build follows the letters, and the fake Playout models
every shape.

## Why

The Playout team built five things we asked for. Each closes a gap the owner has met or asked about:

- **A — `B-286`.** A media plate sends the PRIMARY's `clip` path to the backup core too, and that path may not
  exist there — on the failover, which is the moment the backup exists for.
- **B — `B-298`.** An NDI input that is a channel's own output can be taken on that channel: a feedback loop,
  and nothing in the console tells an operator which NDI name is which channel.
- **C — `R-075`.** The owner wants the running playlist inside a CG box (a squeeze-back).
- **D — `R-077`.** CG Control is licensed through the Playout's dongle; the bridge must refuse takes where CG
  is not licensed, and never clear anything because of it.
- **E — `R-076`.** The owner wants the programme's sound in CG Control, and a VU meter like the Playout's.

## What changes

- **A — the backup gets its own clip.** D11 items carry `source` and `fingerprint` (`2.9.1`). The bridge looks
  each bound clip's fingerprint up in the BACKUP Playout's own D11 (`?fingerprint=`), before any take, and
  caches it; a media `PLAY` then goes to server A with A's `clip` and to server B with B's own. No
  fingerprint, no copy, a backup older than `2.9.1`, or a backup list that cannot be read: server B is sent
  nothing for that plate, and the row says so in one line. A take never waits on the lookup. The redundancy
  adapter gains a per-server line (`backupLine`) that the journal keeps, so no failover replay or corrective
  resend can carry a primary path to the backup.
- **B — `ownOutputOf`.** An NDI input marked as a channel's own output is shown disabled on that channel
  ("Own output of CH n (would loop)") and a take naming it there is refused; every other channel, and an
  unmarked input, is unchanged. Nothing is guessed from a name.
- **C — the playlist output as a box source.** D10's `pl-<code>` rows (`route://N-L`, `playlistOf`) are
  bindable in the Inputs tab under the Playout's own name. The box is ALWAYS at `VOLUME 0`: every audio
  control is disabled for it ("Programme sound is already on air") and the bridge refuses a raise. The send
  guard now refuses ANY command to a layer below 50 that the station does not own — `PLAY`, `STOP` and
  `MIXER` as well as `CLEAR` — and never lets a line reach the playlist's layer L; a route line with
  `NEXT`, `BACKGROUND` or `BUFFER` is refused. The reveal waits at least two frames of the channel's rate
  after `PLAY`.
- **D — the CG license.** The bridge reads `GET /api/cg/license` beside D9 (every 60 s, the last value kept
  when the Playout cannot be reached) and D4's `cgLicensed`, and pushes both to every console. A take on a
  channel where CG is not licensed is refused with the Playout's message; clears and stops still work, and
  nothing on air is cleared by us. The channel strip marks such a channel; an admin sees one line in
  `grace`; a layer cleared while D4 says `unlicensed` is named "Cleared by the Playout: its license". The
  loopback AMCP limit (their §5) is filed, not built around.
- **E — PGM sound and a VU meter.** CG Bridge relays the core's `/audio.wav` (ticketed, one upstream per
  channel, the well-behaved-client rule) and the Playout's `GET /api/cg/meters` (read once with its own
  session, filtered per console by its token). The console plays the sound by the Playout client's method
  (`fetch` + `ReadableStream`, an adaptive 30–90 ms buffer, a 150 ms cap), off by default behind a speaker
  toggle that is remembered per console, and draws their `VuMeterTall` beside the PGM monitor (8 bars and
  the scale, fixed gradient under `clip-path`, written straight to the DOM) with a short-term loudness badge.

## Not changed

The primary's take wire, except part C's route form and its volume rule. The send guard's existing refusals
(it only gains refusals). Nothing on air is cleared by a license state. The console never talks to CasparCG
(the sound goes through CG Bridge like the picture). No token in any URL, log or `/health`.
