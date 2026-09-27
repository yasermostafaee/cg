# look-switch-all-or-nothing — a look switch airs all of its new look or none of it (`B-273`)

Prompt: `LOOK-SWITCH-01` (v2) ran overnight on 2026-09-27 **up to its §3 only**: it established §0 and pinned
two absences. `LOOK-SWITCH-01` (v3) built §1, and CC measured it on this machine's own CasparCG (the owner's
decision, 2026-09-27); it ships only if that measurement passes (`design.md` §3 v3).

## What v3 changes

- **A switch seats what its new look needs BEFORE the page is told** — hidden (`OPACITY 0` + `VOLUME 0` + the fit,
  committed), then `PLAY` — and is refused, with the page untouched, when a plate is refused; the row keeps its
  old look and says which source failed, in `FIELD-FIXES-01`'s line, with no banner.
- **Every plate is seated hidden and revealed in its action's one commit** — take, switch, swap and restore onto a
  layer nothing of ours is on; an in-place replace is never hidden.
- **After every AMCP reconnect the first `DEFER` set carries our full plate mixer state**, layers 50 and up only.
- **A plate layer's `MIXER CLEAR` only once its `CLEAR` landed.**
- **The harness's switch window starts at the page `UPDATE`**, so the freshly seated runs count toward `k`.

The rest of this file is v2's, kept as written.

## Why

`B-273`: a look switch tells the page the NEW look before its plates play. When a plate the new look needs
is not seated and its `PLAY` is refused, that box is a hole on air for a few frames, until the previous look
is put back. `FIELD-FIXES-01-A` made a take all-or-nothing; the owner decided (2026-09-27) a look switch is
too: if any plate the new look needs is refused, the page never moves and nothing on air changes; if every
plate is accepted, the switch lands at the same frame as today, or better.

The Playout's core team answered how to seat a plate invisibly on this core
(`docs/integration/playout/PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3.2): hide and mute with `MIXER … DEFER` +
one `MIXER <ch> COMMIT` before the `PLAY`, reveal with `OPACITY 1 DEFER` in the switch's one commit, never
`MIXER <ch> CLEAR`, never `BEGIN…COMMIT` for frame alignment, and re-send our full mixer state after a
reconnect because the `DEFER` list is one per channel and outlives a dropped connection.

## What changes in this session

- **§0 established** — all five answers, with anchors, in `design.md`: today's AMCP order for a 1 → 2 switch
  measured on the fake; which plates a pre-seat must seat; the hide/reveal pattern confirmed against the
  code and the stock 2.5.0 source; every `DEFER`, `COMMIT` and `MIXER CLEAR` the bridge sends; what the fake
  can prove and what needs real CasparCG.
- **Two things the bridge already never sends are pinned** (`tests/mixer-scope-pins.test.ts`): a
  channel-wide `MIXER <ch> CLEAR`, and an AMCP `BEGIN` batch. No wire changes.

## What does NOT change yet, and why

**The switch's success path and its refusal half ship together, after the owner's measurement.** They are
not independent (`design.md` §3): to refuse before the page moves the switch must seat the missing plates
BEFORE telling the page, and that seat — hide, `PLAY`, reveal in the one commit — IS the new success path.
A refusal-only variant that seated without hiding would put a full-frame, audible producer on air before the
switch (§0.1 case B), which is worse than `B-273`.

`B-273` stays open until the measurement in `design.md` §3 has passed.

## Impact

- `tools/caspar-bridge/tests/mixer-scope-pins.test.ts` (new).
- `openspec/changes/look-switch-all-or-nothing/` (this change); `docs/prd/bugs-runtime.md` `B-273` status.
