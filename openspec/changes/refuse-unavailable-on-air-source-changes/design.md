# Design — refuse-unavailable-on-air-source-changes (B-355)

## Context and established behavior

`sourceBindable` and `sourceSeatable` answer different questions. A Playout input that is still listed with
`available: false` is bindable so an operator can prepare tomorrow's or another look's composition, but it is not
seatable. The source picker therefore keeps it selectable and marks it `Unavailable`; globally disabling that row
would remove the required off-air workflow rather than fix the air boundary.

The bridge already has both atomic boundaries needed here:

- `#applyBindingTransaction` refuses, writes, reconciles, rolls back on failure, then publishes;
- `setActiveLook` plans and pre-seats before its page-tell hook, and records the target look only after success.

The defect is in preflight. `#refuseBindingChange` rejects a newly introduced loop or channel-incompatible source but
does not ask whether it is seatable. The live planner subsequently removes unavailable entries from its resolving
catalogue. Its permissive `already-live` scope excuses an unresolved plate that is already punched, and the apply
correctly preserves that old record rather than clearing a working picture. The combination produces an accepted
transaction with the previous picture still visible.

The look-switch variant is narrower than the held/new-plate case already covered by tests. In the owner's exact
single → two-box route, look A binds shared `l1` to the Playlist output and shows it full-screen; look B binds the same
`l1` to unavailable source Y and shows a second, valid plate. `punchedAlready` sees only `l1`, so planning the switch
as `already-live` excuses B's unresolved frame even though Playlist is not Y. The old Playlist remains full-screen
while the other valid frame is applied. In the inverse arrangement — shared `l1` stays on Playlist and the newly
shown/held plate is unavailable — that new plate is not in `punchedAlready`, so the existing switch refusal is already
correct.

## Decisions

### 1. Reuse the source predicates; do not add a status spelling

The prospective-binding gate SHALL call `sourceSeatable`. It SHALL use `unseatableWords`, `plateLabel`, `isolateText`
and `LIVE_PLATE_SOURCE_UNAVAILABLE` / `LIVE_PLATE_SOURCE_UNUSABLE` for the result. No caller shall independently spell
`status === 'unavailable'` as the seating policy.

This keeps catalogue construction, take, switch, Update, row feedback and future source kinds on one vocabulary.

### 2. Reject only a new or changed frame on a row that owns live seats

`#refuseBindingChange` already resolves prospective and in-force frames and compares the tuple
`(lookId, plateId, sourceId)`. The seatability check belongs in that existing comparison:

- if the tuple is unchanged, skip it even if the catalogue entry became unavailable later;
- if the tuple is new or changed and `#ownsLiveSeats(itemId)` is true, an unseatable source refuses the whole action;
- if the row owns no live seats, store the bindable preset and send nothing. Its later take or switch is the air gate.

The rule applies to the complete Update payload. A refused source therefore also refuses the text fields in that
press, leaving both drafts available for correction or retry; it never produces a caption/feed half-state.
The same prospective gate is shared by `swapLiveSource`: its newly requested target must be seatable when the row
owns live seats, but an unchanged invalid frame in another look is skipped and cannot block a healthy repair.

### 3. A switch is strict about its destination look; a live repair stays permissive

The planner's refusal scope SHALL be selected by action:

- `take` and `switch`: `entering-look` — every frame of the look being entered must resolve;
- `live`: `already-live` — an emergency swap or Update remains free to repair one plate without being blocked by an
  unrelated invalid frame.

The level-two source remains `fresh` only for take and `pinned` for switch/live. The union pre-seat set is unchanged.
Thus a successful switch keeps its existing no-`PLAY` geometry path; only an invalid destination is stopped earlier.

### 4. Refuse at plan time; existing rollback remains the fallback

A destination-frame refusal is returned before `#preSeatSwitch`, `beforeApply`, the page `CG UPDATE`, mixer geometry
or source `PLAY`. Consequently:

- zero AMCP is sent for this refusal;
- `activeLookId`, binding maps, the live-layer ledger, pictures, fits and geometry are unchanged;
- the existing row `takeRefusal` carries the plate/source detail and `refusalOnRow` prevents a duplicate banner.

No new compensating command is added. Wire-time failures keep `LOOK-SWITCH-01`'s existing rollback.

### 5. The mock models the decision, not invented CasparCG behavior

This refusal is catalogue/plan validation performed before AMCP, not a fabricated wire failure. Runtime e2e may add
the smallest parity implementation or a narrowly named one-shot seed, but it SHALL preserve the real bridge's result:
the Update draft remains dirty, the old look stays selected and the row owns the refusal line.

## Risks and controls

- **Over-strict live repair:** making every reconcile `entering-look` would block a rescue swap because an unrelated
  hidden plate is invalid. The mode split and the existing emergency-swap regression prevent that.
- **Losing off-air preparation:** changing `sourceBindable` or disabling ordinary unavailable picker rows would break
  a deliberate workflow. Tests pin off-air storage plus later take/switch refusal.
- **Retroactive lockout:** testing every prospective frame rather than only changed tuples would block text-only
  Updates after a source loses signal. The unchanged-binding regression prevents that.
- **Partial multi-box state:** tests compare the complete prior ledger/look and assert zero page, mixer and producer
  wire, not merely the returned error code.
