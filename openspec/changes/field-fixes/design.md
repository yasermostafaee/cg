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
