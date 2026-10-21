# A per-row mute for a template's own sound (RUN-NEXT-VERSION-02 Q9)

## Why

`D-165` gave templates sound (an audio element, heard from the take through the exit) and CG Control a speaker mark
on a row whose template makes sound — a fact, with no control: "what the operator can do about it (a mute per row) is
the owner's decision, not built". `REPORT-RUN-NEXT-VERSION-01` Q9 asked; the owner accepted: a toggle beside the
speaker mark.

## What Changes

- **The page:** a `__cg.sound` control member (`{ muted }`) reaches the page's HOST mute (`setSoundMuted`, the master
  gain PVW and the Designer's preview already use), on both doors a payload arrives through (`update`, and `play`
  before the entrance sounds start). Absent means unchanged.
- **CG Bridge:** `stack.set-sound-muted` — a CONFIGURATION verb (golden rule 10) with `stack.set-pass-timing`'s shape:
  gated by `#ownsLiveSeats`; off air it records the choice and sends nothing, and every take carries it on both routes
  into air (`#takeControl`: the ADD payload and the resident tell); a row owning live seats gets one `CG UPDATE`
  carrying only `__cg.sound`. A refused set records nothing. Published (`StackItemState.soundMuted`) and retained
  (`RetainedStackItemSchema.soundMuted`); audited (`set-sound-muted`, its value in the Log).
- **CG Control:** the speaker mark states the fact (sound on / muted); an icon toggle beside it names the action
  (Mute / Unmute), `aria-pressed`, gated by the operate permission like every row verb. The offline mock records it.

## Why the page and not CasparCG's mixer

`MIXER <layer> VOLUME 0` would also silence the layer, but its persistence across a producer's re-ADD and a CLEAR is
CasparCG's, and unmeasured here; the page's host mute is the page's own, already the design's "host's switch", and
reaches air through the same `__cg` road the timing and the look already ride.

## Impact

- **Specs:** `runtime-ui` (ADDED × 1), `runtime-caspar-bridge` (ADDED × 1).
- **Code:** `@cg/shared-schema` (control member, row and retained fields, audit action/value), `@cg/shared-ipc` (the
  channel), `@cg/template-runtime`, CG Bridge (verb, command, take control, publish/restore/forget, channel scope,
  route), CG Control (bridge contract, WebSocket, mock, the row, the Log). A wire change: a new optional `__cg`
  member; a page from an older build ignores it (`readCgControl` drops unknown members).
