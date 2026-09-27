# route-plates — seat live plates from the Playout's holder channel by contract v1.3

Prompt: `ROUTE-PLATES-01` (v3), run inside `DAY-RUN-02` (v2). PRD: `C-045` (`docs/prd/caspar.md`), filed
beside `C-044`. It builds on `LOOK-SWITCH-01` (v3, `fa574bbb`: the one seat step, hide → `PLAY` → reveal)
and `PLAYOUT-SOURCES-01` (v5, `a96f2fa9`: D10/D11, rule 2's audio, and the route gate this removes).

## Why

Contract v1.3 (`docs/integration/playout/PLAYOUT-CG-RESPONSE-HOLDER-v1.md` §3, completed by their
`PLAYOUT-CG-RESPONSE-V13-STATE-v1.md` §3 and accepted in `CG-CONTROL-REPLY-V13-STATE-2026-09-27.md`)
brings every exclusive input as a D10 `route` to the Playout's holder channel. `PLAYOUT-SOURCES-01` listed
those inputs and held them back behind one gate ("Not supported yet."), because seating one safely needs
what the core team measured:

- a cold `PLAY … route://` can put one black, silent frame on air, and a `LOADBG`-ed route holds the frame
  from the moment it was loaded — so `LOADBG`, then 40–200 ms, then the bare `PLAY`;
- "showing" is `OPACITY`, not `PLAY`: hide and mute first, then play, then reveal in ONE
  `MIXER <ch> COMMIT`; `BEGIN…COMMIT` is not same-frame on their core, and the `DEFER` list is shared;
- mixer state belongs to the layer number, and a core restart resets it to visible and loud;
- a route kept playing at `OPACITY 0` stays live for hours; `PAUSE` does not;
- a holder number from another epoch connects, without an error, to whatever holds it now.

## What Changes

- **Rule 4 (C2, as corrected).** Every seating of a Playout route — take, look switch, swap, restore — is
  `LOOK-SWITCH-01`'s one seat step: hide and mute (`OPACITY 0`, `VOLUME 0`, the fit, as `DEFER`) in one
  committed `MIXER <ch> COMMIT`; `LOADBG <ch>-<L> "route://H-L"`; the bare `PLAY` at least 40 ms after the
  `LOADBG`'s reply and at most 200 ms after it left (else one fresh `LOADBG`); the reveal (`OPACITY 1`) one
  or two ticks after the last `PLAY`, in one `COMMIT`. A held route stays playing at `OPACITY 0`, muted;
  showing it again is the reveal alone. The clock is injectable.
- **Rule 5 (C3).** Every seated route records the epoch it was resolved from. After an AMCP reconnect, on
  an epoch change and before any route is seated, D10 is re-read within 1.5 s; a route of another or
  unknown epoch is never sent, the plate stays empty, and the row says
  `Bed 59 · Plate 1: waiting for the Playout's input list.` The epoch is read digit for digit (a 64-bit
  integer). The send seam refuses any route line whose epoch is not the current, confirmed one.
- **Rule 1.** A route is seated only on a channel its `compatibleChannels` names (none named is none);
  otherwise the take, switch or swap is refused before any AMCP:
  `Bed 59 · Plate 1: “ورودی ۴” can't be shown on CH 2.` The picker disables it with `Not available on CH n`.
- **Rule 3 and C5 — one guard at the AMCP send seam.** Refused, and nothing sent: a command to a channel
  this station does not declare (the holder and guard channels never are); `CLEAR ALL`, `CHANNEL_GRID`,
  `CLEAR <ch>`, `MIXER <ch> CLEAR`, `SWAP`, `SET … MODE`, a consumer `ADD`/`REMOVE`; `CLEAR <ch>-<L>` outside
  our own layers (50–99); `MIXER <ch>-<L> CLEAR` under a seated plate; a Playout route with no layer.
- **C4.** A route line reaches the PRIMARY only — never mirrored, never journaled, and never sent to a backup
  promoted by a failover. A row whose seats include one says `Backup: live boxes not mirrored.` while a
  backup is declared. Every other plate mirrors as before.
- **The gate is removed (§1.G), last.** `routeInputGate()` and `ROUTE_NOT_SUPPORTED_YET` are gone; a route
  with a layer is an ordinary bindable input.
- **The fakes (§1.H).** The AMCP mock accepts `LOADBG`, promotes the background on a bare `PLAY` and stamps
  every received line with an injectable clock; the fake Playout simulates a core restart (a new epoch,
  renumbered holders, a dropped AMCP connection) and can send a 64-bit epoch literal.

Out of scope, and unchanged: the page's take order, `B-174`'s hole/fill order, the wire of every plate not
bound to a D10 input (byte-identical), `FIELD-FIXES-01-A`, the bank and channel fences, and the lock.

## Capabilities

### Modified Capabilities

- `runtime-playout-sources`: the v1.3 requirement stops forbidding route seats; rule 1 is asked of one
  predicate for Playout routes.
- `runtime-caspar-bridge`: route seating, the epoch, the send-seam guard, and the backup line.

## Impact

- `tools/caspar-bridge`: `caspar-runtime.ts`, new `route-plates.ts` and `amcp-guard.ts`,
  `command-builder.ts`, `live-plate-assignment.ts`, `live-layers.ts` (`epoch` on a record, additive),
  `playout-sources.ts` (`confirmInputs`), `refusal-cleanup.ts` (the `loaded` outcome), `bridge.ts`.
- `packages/caspar-client`: `SendOptions.mirror: false` (primary only, not journaled).
- `packages/shared-ipc`: the lossless epoch, `isPlayoutRoute`, `sourceShowableOn`, `notShowableWords`,
  `SourceCatalog.inputsEpoch`; the gate removed.
- `packages/shared-schema`: `StackItemState.backupUnmirrored` (published, never retained).
- `apps/runtime`: the two row lines, the backup line, the error-code sentences, the picker.
- `tools/amcp-mock`: `LOADBG`, the bare `PLAY` (acked with nothing loaded, as CasparCG 2.5.0 answers it —
  measured), the command log.
