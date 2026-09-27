# look-switch-all-or-nothing — a look switch airs all of its new look or none of it (`B-273`)

Prompt: `LOOK-SWITCH-01` (v2). Run overnight on 2026-09-27 **up to its §3 only**, by the owner's
instruction: establish, build nothing that waits for his measurement, hand him the measurement command.

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
