# Design — field fixes from 2026-09-26 (`FIELD-FIXES-01`, `FIELD-FIXES-01-A`)

## §0 What the take did (established, accepted by the owner)

The installed app keeps no AMCP log (§5), so Bed 59's take (audit `2026-09-26T09:40:00Z`, `failed`,
`amcp-403`) was replayed on the mock with the station's own bank, catalog, assignments and template:

```
MIXER 2-59 VOLUME 0            → 202 MIXER OK
CG 2-59 ADD 0 "http://192.168.21.93:7911/template/cb25ece1-…?cw=1920&ch=1080" 0 "{…look-2…}" → 202 CG OK
MIXER 2-59 VOLUME 1            → 202 MIXER OK
PLAY 2-60 DECKLINK DEVICE 1    → 403 PLAY FAILED
CLEAR 2-60                     → 202 CLEAR OK
MIXER 2-60 CLEAR               → 202 MIXER OK
```

Nothing aired; the graphic was left ADDed and unplayed on 2-59. CasparCG 2.5.0 answers
`<code> <COMMAND> FAILED` and nothing else (`AMCPCommandQueue.cpp`); a DeckLink device that is absent
throws `user_error` "Decklink device N not found." from `get_device`, and 2.5.0 logs only
" Check syntax." for it. Nothing over AMCP enumerates DeckLink devices, and D4 carries only
`{id, name, casparHost, casparChannel}`.

## §1 Decision 1 — a fresh take airs everything or nothing

- The take stops at the first refused plate: the seating loop breaks, no later plate is tried, and
  the graphic's `CG PLAY` is never sent.
- It undoes exactly what it put there, through the Rule (§2): the plates it seated (their `PLAY`
  landed) are cleared with their mixer; the plate whose `PLAY` was refused is not cleared — the
  server left that layer as it was; and the graphic it `CG ADD`ed comes off its layer the way
  `out()` takes it (`CLEAR`, adoption on the primary, `B-253`'s mixer reset), and `#loaded` forgets
  it so the next take re-ADDs.
- The other half: when the graphic's own `CG PLAY` fails AFTER its plates were seated, the plates
  come down and an ADDed graphic comes off, the same way.
- The row ends in ERROR carrying `takeRefusal` (§6): the code, the refused command, and the plate
  that was refused — only that plate; plates never tried are never named.
- A refused PRESET (a seat only a look not on screen uses) still does not refuse the take: it is
  dropped (`§2.9`, unchanged) — no hole on air follows from it, and the look that needs it refuses
  when entered (see §3).
- The success path is pinned byte for byte against the wire recorded at `459c3f64`
  (`take-all-or-nothing.integration.test.ts`, "HARD STOP").

## §2 The Rule — a refused `PLAY` never clears a working picture

CasparCG leaves a layer as it was when it refuses a `PLAY` (`play_command` → `loadbg_command` builds
the producer before `stage->load`). So every clean-up after a refusal is ours, and one helper decides
it (`tools/caspar-bridge/src/refusal-cleanup.ts`): a layer is cleared only if this operation put a
producer on it (`landed`, or `unknown` — no usable reply) and never if one of ours was on it before
the operation began (`heldBefore`, read once from the ledger). A 4xx reply is `refused`; `amcp-5NN`,
`amcp-timeout` and `amcp-send-failed` are `unknown`.

**The clean-up-after-refusal sites — three, all in `CasparRuntime.#applyLivePlatesUnguarded`, plus
the one Decision 1 adds:**

| Site                                   | Anchor (before this change)   | Reached from                                                            |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| the dropped preset                     | `caspar-runtime.ts:7411-7412` | take, look switch, swap, re-seat                                        |
| the take's rollback                    | `caspar-runtime.ts:7452-7453` | take                                                                    |
| the failed plate's teardown            | `caspar-runtime.ts:7588-7589` | look switch, R-048 swap, UPDATE's binding change, the reconnect re-seat |
| the graphic a refused take added (new) | `#removeUnplayedPage`         | take                                                                    |

The owner predicted 2–5 sites, naming take, look switch, R-048 swap and re-seat. There are three,
because those four operations are not four code paths: they are the three modes of the ONE
reconcile (`reconcileLivePlates` → `#applyLivePlates`), whose failure branch is shared. Every other
`CLEAR` the bridge sends (`out`, `remove`, the bank and layer clears, `takeStrayOffAir`,
`teardownLiveLayers`, the release sweep, the adopt-`CLEAR`) is an operator verb or a success path,
not a clean-up after a refusal. All four sites now call `#clearAfterRefusal` and nothing else.

## §3 The look switch on a refused plate (reported, not changed — `B-273`)

A switch sends a `PLAY` only for a seat the take did not pre-seat — in practice a preset dropped at
the take (§1). `setActiveLook` tells the page the NEW look first (`beforeApply` → `#tellPageLook`),
holds one channel frame, then applies; a refused `PLAY` commits the fills that landed, puts every
moved plate back (`B-166`), tears the failed seat down through the Rule, and only then re-tells the
page the PREVIOUS look (`caspar-runtime.ts` `setActiveLook`). For that window — the hold, the refused
`PLAY`'s round trip, the commit, the restores and the re-tell — the page shows the new look's boxes
and the refused plate's box has no picture: **a hole on air, a few frames long.** If the re-tell is
refused too, the page stays on the new look over the old geometry until the operator re-issues it.
What a switch should do instead is the owner's decision; nothing here changes it.

## §4 Decision 2 — a take of a row already on air is refused by the bridge

- `#takeImpl` refuses, before it mutates anything, with `already-on-air` (`TAKE_ON_AIR_CODE`,
  `@cg/shared-ipc`) whenever `#ownsLiveSeats` holds: the row is on air or unsettled
  (`isOnAirStatus` — a take in flight is `pending`, an overdue one `unconfirmed`) or the ledger holds
  its seats. One predicate, the one golden rule 10 names; every console meets the same refusal.
- **One predicate, three callers.** The two halves are spelled once, as `ownsLiveSeats(item,
holdsSeats)` in `@cg/shared-schema` beside `isOnAirStatus`; the bridge's `#ownsLiveSeats` hands it
  its own two facts, `MockRuntime.take` its seated set, and the console's PLAY the row's status plus
  whether the published live-layers ledger holds a seat for the row (`LayersPanel` reads the one
  ledger snapshot, as it does for `rehearsing`). PLAY read `on-air`/`playing` alone before. Its
  disabled title names the row: _"Bed 59 is already on air — take it out first."_
  (`takeOnAirReason`), and a refusal the bridge answers (a race, another console) is said in the same
  sentence.
- **Why the ledger half, when the owner named the page.** A row whose plates are seated while its
  status is not on air is `B-145`'s adopted row: the bridge restarted, the plates stayed on the
  channel, the status did not come back. Its page is up too — CasparCG never stopped — and a take
  would re-`PLAY` every seated plate, which on a DeckLink fails by construction (`B-177`). So the
  bridge knows that page is on air by its ledger, and refuses. **Residual, not changed here:** such a
  row reads READY, and STOP is still gated on the status, so its way out is CLEAR (the escape hatch,
  offered whatever the status says); after CLEAR, PLAY is back.
- **Where the 5 s came from.** `INTENT_TIMEOUT_MS = 5000` (`caspar-runtime.ts`), armed by
  `#armExpiry(seq)` immediately before the take's `CG PLAY`, and expired by
  `Reconciler.expireIntent`, which (since `B-079`) RETRACTED the take's play evidence. With the page's
  own producer on OSC that read `loaded`, so PLAY came back on a graphic that was up; and a late OK
  settled `ackedStatus` without restoring the evidence, so it stayed `loaded`. **Fixed in that one
  place:** an expired take is `takeOverdue` — unresolved, not failed — keeps its evidence, reads
  `unconfirmed` above OSC, and its own late reply resolves it. Note: every AMCP command also times out
  at 2 s IN FLIGHT (`CommandQueue`'s default), so the 5 s expiry is reached only by a `CG PLAY` that
  waited unsent (the queue paused for a resync, or its pipeline full); a reply slower than 2 s in
  flight is already a failure (`amcp-timeout`), which Decision 1 undoes.
- Six bridge tests re-took an on-air row as a step or a subject (`live-seating` "RE-TAKE lands on
  the same layers", `server-restart-retake` ×2, `live-look-reconcile` ×2, `multibox-exclusivity`'s
  door-1 boundary). Each now asserts the refusal and reaches its subject through OUT or STOP first.
- Five runtime e2e specs pressed PLAY on the seed's news row (layer 80), which the seed models as
  that `B-145` row — seats held while it reads loaded. `layers-header-tally`, `server-settings` and
  `test-mode-honesty` take the idle TICKER row (96) instead; `live-source-layers` takes the news row
  out with CLEAR first and then asserts it reads ON AIR, so its on-air section is not the loaded
  case again; `fixed-layers` asserts the refusal title, and its closing CLEAR is the control (PLAY
  back). `template-self-stop`'s stale-token case STOPs the first run before its re-take. In
  `MockRuntime.test.ts` two `B-145` cases took the row inside OUT's 160 ms `exiting` window, which is
  unsettled and now refused exactly as the bridge refuses it; they wait for the settle.
