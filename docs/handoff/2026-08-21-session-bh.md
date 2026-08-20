# Session BH — LOOKS Stage E: the operator can change a running row's look on air

> **Letter:** `BH`, the next free one. `BF` stays reserved for the deferred hidden-look
> video/audio item, so the letter and the item it names do not drift apart.

## THE STATE, first (read this cold)

- **Pushed SHA:** see §8 — verified against `git ls-remote origin dev`. **Safe to pull.**
- ⭐ **THE FEATURE THE CLIENT ASKED FOR IS COMPLETE.** An operator picks a look on the row and
  the boxes change on air. Everything under it had landed; this is the surface.
- **Base read:** `9b587ddc` — exactly the expected tip, no delta, tree clean.
- ⚠ **Shared config changed — pull before you work.** `@cg/shared-schema` and `@cg/shared-ipc`
  both gained fields/channels, so the bridge and both apps rebuild.

## 1. What this session did

Built the **look picker** on the Runtime row: always visible on look-bearing rows, marking the
live look, one press to switch. Wired it to the shipped seam (`setActiveLook` →
`reconcileLivePlates` → the `__cg` payload → the page's `enterLook`) through a new
`stack.set-active-look` channel. Added the one refusal LOOKS has, made an active `sourceOverride`
visible outside the swap dialog, and answered §4's carried question.

## 2. What changed

| layer     | files                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| schema    | `StackItemState.activeLookId` (the readout, on the OPEN axis beside `sourceOverride`)         |
| wire      | `stack.set-active-look`                                                                       |
| bridge    | `#published()` publishes the RESOLVED look; `#refuseNoLooksAuthored` at the take door         |
| transport | contract, `WebSocketRuntime`, `MockRuntime`, `createRuntimeBridge`, parity                    |
| renderer  | `LookPicker.tsx`, `lookSwitch.ts`, `LayerRow` second line, `controls.css`, `errorCodeMessage` |
| §12.5     | `onAirPlateSource` + the LIVE PLATES on-air line + the live path named                        |
| §4        | `link.resyncing()` exposed; `useStackDeliveryPending`; `liveLayerBlindness` sharpened         |

**§6's scope untouched and verified so:** BF (and the still-unexplained 2× — not chased), BC's two
deferred findings (unchecked rollback `CLEAR`s, `#activeLooks` not persisted), the AW banner,
P2.DEL. `tools/caspar-bridge/src/template-http-server.ts` untouched.

## 3. ⭐ What to check — the walk, on the plant

1. Take a row whose template has a multi-box look group → **the picker shows the live look**, the
   authored default, before you touch anything.
2. **Press another look** — one action. The boxes cut to it; sources the new look does not show are
   HELD, not torn down.
3. **Preset then switch:** point a source the CURRENT look does not show at a different input
   (row → SOURCE). Nothing moves. Now switch to a look that shows it — **it comes up on the new
   input, at the moment of the switch.**
4. **Switch back** — every box returns with no operator action and no re-acquire.
5. The **cut is the only mode**, so the press IS the immediate action; STOP/CLEAR remain the way
   off air, always present in the verb block.

![the picker on the row](img/bh-step1-picker-left.png)
![after one press](img/bh-step2-picker-right.png)

## 4. §2b answered — placement, the shape rule, and density

**Placement: a second line spanning `gridColumn: 1 / -1`.** The row's outer element IS the grid, so
a spanning child lands on a new implicit row and adds **no column**. `VERB_COUNT` stays 6,
`gridTemplateColumns(density)` is untouched, `minWidthFor` sums the same columns, and the header
words stay above their own glyphs — the invariant with a recorded on-air failure behind it.

**The SHAPE RULE does not govern it, and I am stating that rather than implying it.** The rule is
about the VERB BLOCK — _"every row declares the SAME verbs in the SAME order"_ — and exists so a
verb never moves under a hand already reaching for one. The picker is not a verb and is not in that
block. It IS conditional (only look-bearing rows have one), which a reader who assumed the rule
applied would call a violation.

**Density:** the line spans whatever columns exist, so it is correct at all three. It can never
widen the row — the strip is `overflow-x: auto; min-width: 0`, so a long look list scrolls inside
the line instead of pushing the grid out and clipping a verb. Pinned by arithmetic, not by eye:
`minWidthFor('full')` and `minWidthFor('tight')` are asserted to their exact values.

## 5. §4 answered — loaded-empty IS distinguishable, and the fact already existed

**Distinguishable, with one small honest addition — and it is an exposed FACT, not an inference.**

`useBridgeSnapshot`'s `ready` cannot answer it: it _"latches on the FIRST arrival and never
clears"_. But `WebSocketRuntime` has always tracked `#resyncing` — set before the first await of a
resync, cleared on all three exit paths — purely to suppress retention mirroring. It simply never
left that class. It is now `link.resyncing()` on the bridge contract, with every write routed
through one `#setResyncing` so the five sites cannot drift.

So: **empty + delivery pending → blind; empty + settled → that IS the answer, and the stranding
alarm is restored for it.** That is what the owner asked for, and BG's true-positive cost is paid
back.

🔴 **I rejected the alternative and it is worth saying why.** "Retention says N rows, the bridge
says 0" is a _correlated_ question, not this one, and it fails both ways: a restore that THREW
leaves retention at N forever (alarm suppressed permanently), and a browser with empty retention
reconnecting to a restarted bridge reads "genuinely empty" while another console is 200 ms from
restoring those rows. Arming a control that cuts a live guest on a derived neighbour of the real
fact is the `B-101` shape.

⚠ **The residual, stated rather than papered over:** this closes the SELF race completely. It does
**not** close the multi-browser one — one bridge serves many browsers, and this browser cannot know
another is about to restore the rows. That is genuinely undecidable from here and would need a
bridge-side "every client has re-delivered" fact, which does not exist. It is written into the
`LiveLayerBlindness` doc, and the confirm dialog remains the last guard.

## 6. 🔴 What the screenshots could NOT show, and what I checked instead

- **The boxes actually moving on air.** No screenshot of the console can show the SDI output. What
  is proven instead is the COMMAND SEQUENCE, on the AMCP trace: fills move, _then_ the page is told,
  in that order and only on success; the switch emits no duration and no tween (so it is a cut); and
  a held plate never re-`PLAY`s on the way back. Whether that reads as a clean cut on a 2.3.2 server
  remains a plant measurement — **step 2 of §3 is the one thing I cannot do from here.**
- **Preset-then-take** is invisible by construction — its whole point is that nothing changes until
  the switch. Asserted as an EMPTY wire slice after the preset, then the new producer after the
  switch.
- **The §4 reconnect window** cannot be photographed at all; it is a DOM test with the delivery flag
  driven both ways.
- The screenshots are from the offline mock's e2e-armed seed (a 4-box template with three looks, two
  of them disjoint), not from a plant.

## 7. One correction to the prompt, and one judgement to check

⚠ **§3.6 asked for the immediate-CUT escape; `tasks.md` 7.6 RETIRED it on 2026-08-19.** These agree
in substance — the prompt itself says "the mode is cut-only in v1" — so I built no separate control
and instead **asserted** the claim rather than assuming it: every fill a switch emits carries no
duration or tween, and STOP/CLEAR stay in the verb block. If you did want a distinct control, say so
and I will add one; I read the retirement as still correct.

⚠ **The look segments are labelled by ORDINAL (`1 2 3`), not by the authored look name.** The
carrier holds ids, not display names, and an ordinal is callable over talkback. The id rides the
tooltip and the accessible name. If you would rather see the authored names, that is a small change
and worth your call.

## 8. Gate, tests and the push

- `pnpm gate` green **uncached** — `0 cached, 89 total`.
- **Tests:** `tools/caspar-bridge/tests/look-picker-operator.integration.test.ts` (15, including the
  **disjoint-membership** switch), `apps/runtime/tests/lookPicker.dom.test.ts` (22),
  `apps/runtime/tests/e2e/look-picker.spec.ts` (3). Existing suites: 840 runtime, 550 bridge.
- 🔴 **The disjoint-membership test (5.3) found nothing** — the release-and-seat path was already
  correct, which is the outcome BC's held-layer fix predicts. It is kept because that shape is what
  HID the original bug: every earlier switch was a subset of the one before it.
- ⚠ One test of mine was wrong and the code was right: I asserted no `PLAY` on a switch that seats
  two never-seated plates. A first-time seat needs its producer; "never PLAY on a switch" would be
  the wrong rule. The test now pins the real distinction and says so.
- `awaitChannelModeRead()` IS called in the new bridge boot (5.6) — several tests there baseline the
  trace and assert an EMPTY slice, which is only valid from a proven-quiescent wire.
- 🔴 **A Linux `gate:e2e` is owed** (`apps/runtime` UI). Its URL and conclusion go in §9.
