# Session BG — the live-layer ledger is VISIBLE: `B-145` closed, Stage E unblocked

> **Letter:** `BG`, not `BF`. `BF` stays reserved for the deferred hidden-look video/audio work
> (see §7), so the letter and the item it names do not drift apart.

## THE STATE, first (read this cold)

- **Pushed SHA:** see §8 — verified against `git ls-remote origin dev`. **Safe to pull.**
- ⚠ **THERE WERE TWO PUSHES, NOT ONE, AND THE SECOND IS THE IMPORTANT ONE.** Reviewing my own change
  turned up **five** real defects in it — one found by hand, four by an adversarial pass — of which
  two would have offered to cut a live guest on a guess and two made the console assert things it had
  not read. Shipping any of them quietly to preserve a one-push tidiness would have been the wrong
  trade. All are fixed at the cause, pinned by tests, and written up in §4b and §4c.

  🔴 **Read §4c (i) if you read nothing else:** my own first fix was INSUFFICIENT, and the case it
  missed is precisely the bridge-restart scenario `B-145` exists for.

- 🔴 **`tasks.md` 2.8 is DONE, and it was Stage E's last blocker.** The operator surface (the look
  picker) is no longer blocked on anything.
- 🔴 **`B-145` is `[x]`.** Acceptance 1 read _"those layers **appear in the layer list** and are
  controllable"_. The control half had held since persistence landed; the display half did not exist.
  It does now.
- **Base read:** `c347987f` — exactly the expected tip, no delta, tree clean.
- ⚠ **Shared config changed — pull before you work.** `packages/shared-ipc` gained a channel, so the
  bridge and both apps rebuild.

## 1. The band's exclusion from `playoutLayersState()` — the reason, found and NOT overridden

The obvious fix is to widen `playoutLayersState()`. It is wrong, and the reason is recorded twice in
the tree (`live-layers.ts:18-26`, `caspar-runtime.ts:564-578`):

> `reservedLayers` is a fence AWAY from a foreign owner — the layer numbers the company's PLAYOUT
> SYSTEM owns. A Live Source layer is the exact inverse: a layer the BRIDGE owns. Putting one in
> `reservedLayers` makes it **unplaceable** (`allocate()` skips reserved layers), **unreservable**
> (`reserve()` refuses them) and **unclearable** (`clearLayer` refuses them as `reserved`).

So the exclusion is **load-bearing**, and the prompt's ⚠ applies: **a separate channel, not a wider
one.** That is also what the bridge's own model already says — `#declaredLayerClass` enumerates THREE
declared ownership classes (`playout` / `live-source` / `operator-row`), and the console had a surface
for two of them.

## 2. What changed

| layer     | file                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| wire      | `packages/shared-ipc/src/channels/liveLayers.ts` **(new)** + the barrel                                     |
| bridge    | `live-layers.ts` (`projectLiveLayers`), `caspar-runtime.ts` (`liveLayersState`), `bridge.ts` (route + push) |
| transport | `runtime-bridge.ts`, `WebSocketRuntime.ts`, `MockRuntime.ts`, `createRuntimeBridge.ts`                      |
| renderer  | `useLiveLayers.ts`, `liveLayerRows.ts`, `LiveSourcesPanel.tsx` **(new)**, `LayersPanel.tsx` (third tab)     |

**ONE projection.** `projectLiveLayers` is called by BOTH the pull (`liveLayersState()`) and the push,
so the two cannot disagree about a row's shape or the list's order — golden rule 6 applied to a
projection rather than a predicate.

**PUSH, not poll.** It rides the `liveLayersChanged` emitter `B-145` already fires from the ledger's
ONE write path, so a seat, a release, a hold and the boot adoption reach a browser by the same call
that persists them to disk.

**No new destructive door.** There is no clear verb on this channel. `layers.clear` refuses a
live-source coordinate BY NAME and its comment records that an exemption was weighed and rejected —
_"an exemption would make Live Source layers operator-CLEARABLE, inverting the protection."_ The one
control the surface offers (§4) calls the EXISTING `stack.remove`.

**§5 out-of-scope, untouched and verified so:** Stage E itself (the look picker), BF, BC's two
deferred findings (unchecked rollback `CLEAR`s, `#activeLooks` not persisted), the AW banner, P2.DEL.
`tools/caspar-bridge/src/template-http-server.ts` untouched.

## 3. 🔴 THE PRODUCTION CALLER — the whole point of the rule

```
LiveSourcesPanel.tsx
  → useLiveLayers()                      apps/runtime/src/renderer/hooks/useLiveLayers.ts
  → window.cg.liveLayers.state()         liveLayers.state
  → route(LiveLayersStateChannel, …)     tools/caspar-bridge/src/bridge.ts
  → CasparRuntime.liveLayersState()      caspar-runtime.ts
  → CasparRuntime.liveLayers()           ← was written-but-unreachable for a week
```

`liveLayers()`'s doc used to say _"for tests and for phase 6's re-emission"_, and that was true long
enough to be the defect. Its comment now names the caller and says why the previous wording mattered.

## 4. ADOPTED vs STRANDED — 2.8's "done when", and the asymmetry that makes it safe

- A layer whose owning item **the stack still carries** is shown, NAMED with its template, and offers
  **`OPEN ROW`** (select the item + return to the LAYERS tab, so the verbs are in front of you). It
  offers **no destructive control** — deliberately absent rather than disabled, because the reason is
  permanent and printed in the row.
- A layer whose owner is **GONE** reads **`Stranded — no row owns this`**, raises the tab's dot, and
  offers **`RELEASE`** behind a confirm that names the plate and producer.

**`RELEASE` is `stack.remove`, not a new clear.** `remove(itemId)` calls `teardownLiveLayers(itemId)`
**unconditionally on `slot`**, and its own comment says why that matters: _"the ledger is keyed by
itemId, so an item whose slot was already released can still own live layers, and those are precisely
the ones nothing else would ever reach."_ The door already existed and already worked; what was
missing was a surface that knew the `itemId` to hand it.

**Colour (§2.4).** Nothing on this surface is coloured unless it needs attention, and exactly one
state does. `held` is a normal disposition and wears a WORD. **Green is not used at all** — it is the
layer table's sacred ON AIR mark, and an on-screen plate borrowing it would put a second, unrelated
air claim on a different surface. Stranded is amber (`pending`), whose documented meaning in this
palette is exactly ATTENTION.

## 4b. 🔴 A defect in THIS work, found by reviewing it — and it was the dangerous one

Worth reading even if you skip the rest, because it is this repo’s most-repeated class and it
nearly shipped inside the very change that closes a bug about honesty.

**What it was.** The first cut decided STRANDED from the stack `items` alone, ignoring `stackReady`.
The ledger and the stack are **two independent snapshots that land separately**, so at mount — and
again on every reconnect — the ledger can arrive first. In that window `items` is `[]` because
nothing has been delivered, every seated layer finds no owner, and the list would have shown **every
live plate as “Stranded — no row owns this” with a RELEASE button beside it.** An operator acting
on that cuts a guest who is perfectly well owned by a row that had simply not arrived yet.

**Why it is not a fresh mistake.** `useBridgeSnapshot` already names three victims of the identical
error — the b2 density bug, PVW’s white page, and `pruneDrafts` deleting every staged edit on
remount — and states the rule: _“any consumer that ACTS on the absence of an item must read this
form and do nothing while `ready` is false.”_ This surface acts on that absence, and the act is
taking a live source off air. `LayersPanel` even carries a comment about the same trap three
snapshots up.

**Fixed at the cause**, not by a guard at the call site: blindness is now a FIRST-CLASS state.
`liveLayerBlindness(linkDown, stackReady)` is the ONE place that precedence lives (link-down
outranks — a frozen ledger makes the stack’s readiness beside the point), the two blind states say
DIFFERENT things so the console never claims it looked when it did not, and neither raises
attention: not knowing is not a claim that anything is wrong. Five tests pin it; reverting the guard
reddens three.

## 4c. …and four MORE, from a second review pass. One pattern, not four bugs

Every one is the same shape as §4b: **a fact the console did not have, presented as a fact it
did** — inside the very change that closes a bug about exactly that.

**(i) The reconnect window — worse than §4b, and it is §4b’s own fix being insufficient.**
`useBridgeSnapshot`’s `ready` flag _"latches on the FIRST arrival and never clears"_. So reading it
covers the bootstrap and nothing else: after any reconnect it stays `true` while `items` is `[]`,
and a restarted bridge serves its FULL adopted ledger before the browser re-delivers a single row.
That is every seated layer reading STRANDED with RELEASE armed, **in exactly the bridge-restart
scenario `B-145` exists for**. Fixed by making an EMPTY stack its own blind state — it cannot tell
"not delivered yet" from "nothing here", so it is evidence of neither. ⚠ This costs one true
positive: an operator who removes EVERY row gets no alarm. That is the right way to be wrong —
failing to raise an alarm is recoverable, arming a control that cuts a live guest on a guess is
not.

**(ii) The empty list claimed "no live sources seated"** with no readiness or link input at all.
The per-row masking rides on ROWS, and an empty ledger has none — so the one branch that speaks
for the WHOLE list was the one that guessed. With the link down the hook never pulls, so an
operator whose bridge is dead was told, definitely, that no guest was composited while two faces
were on air. Fixed with the ledger’s own `ready` flag and an explicit empty view.

**(iii) RELEASE cut more than it named.** `teardownLiveLayers` loops over EVERY record the item
owns, so releasing `1-10` also cleared `1-11` while the confirm, the button label and the toast
all said one coordinate. The wording now names the whole set from one computation. The stranded
verdict is also RE-READ after the confirm’s unbounded await: an operator can leave the dialog open
while the stack arrives, and a verdict that expired in the meantime must not authorise a teardown.

**(iv) The payload had no `unverified` arm, and my own header argued for that from a false
premise.** It said the ledger is _"resolved at boot against the server’s `INFO`"_. The shipped
bridge adopts with occupancy hard-coded to `unknown` — correctly, since no session exists yet and
dropping an unverifiable record would strand the very producer the item protects — so nothing is
ever dropped and **every** adopted record is unconfirmed. The omission was the one distinction
that is always true after a restart, and the surface stated a file claim in the present tense.
The wire now carries `unverified`, marked from the adoption’s own result and cleared on a
first-hand write (a take, a reconcile, a swap — things that send real AMCP), and the row reads
**"Adopted — not confirmed"** instead of "On screen".

**Plus a mock divergence:** it released plates only on `remove`, while the bridge tears them down
on `stop` and `out` too — so test mode reported a guest "On screen" after a STOP. It now hooks the
same three verbs the bridge does.

## 5. ⭐ The visual check — three steps, and you can do all of them

Take a row whose template declares Live Source plates, then open **LAYERS → LIVE SOURCES**.

1. **The band layers now appear**, one row each, with coordinate / plate / producer / owning row.
   Before this session that list showed **nothing** while the producers were lit on air.
   ![the LIVE SOURCES tab](img/bg-step1-live-sources-tab.png)
   Note the tab strip: `LIVE SOURCES` sits between our own `LAYERS` and the station's, and only
   `STATION LAYERS` wears a dot — nothing here needs attention.
2. **Restart the bridge.** The rows come back (adopted from the persisted ledger, corrected against
   the server's `INFO`) and stay controllable through their row.
3. **A stranded layer** — one whose row is gone — is the only row that is coloured, and the only one
   with a control:
   ![a stranded layer](img/bg-step2-stranded.png)
4. With nothing seated the tab says so rather than showing a bare list:
   ![nothing seated](img/bg-step3-empty.png)

## 6. 🔴 What the screenshots could NOT show, and what I checked instead

- **The stranded row is not reachable from the offline mock at all.** The mock derives its ledger
  from its own stack, so removing the row releases the layer — it **cannot** strand one, which is
  deliberate (a mock that faked this alarm would teach test mode a state it can never really be in).
  `bg-step2-stranded.png` was produced by **temporarily** pointing the seed at a missing item and
  lifting that filter; **both edits were reverted** and the committed diff of `MockRuntime.ts` is
  additions only. What is committed instead:
  `liveSourcesPanel.dom.test.ts` renders the stranded row and asserts its markup
  (`data-live-layer-stranded="true"`, the RELEASE button, the confirm body naming plate and
  producer, and that `stack.remove` is called with the itemId), plus the pure gate without a DOM.
- **The restart (step 2) is not in a screenshot** — it needs a real bridge process. It is asserted
  end to end in `live-layers-wire.test.ts`: a bridge boots with a persisted ledger file, adopts it,
  and a WebSocket client reads the adopted rows back off `liveLayers.state`.
- **The link-down mask** is not photographable from a healthy offline mock; it is a DOM test.
- **Real hardware**: nothing here sends AMCP, so there is no hardware claim to make. The ledger is
  bookkeeping; the surface reads it.

## 7. BF stays deferred — recorded so nobody re-prioritises it by mistake

BF (a hidden look's `<video>` keeps decoding and playing audio) remains a **confirmed defect** and
stays open at `tasks.md` 9.3. It was briefly believed to explain the owner's on-air "2×" report and
**cannot have**: his template contains no `<video>` element (its looks hold Live Source plates and an
image background) and his media inputs have no audio track. **The 2× remains unexplained and
self-resolved**; the current best guess is a media-file frame rate vs channel mode mismatch, which is
outside this codebase. Not chased in this session.

## 8. Gate, E2E and the push

- `pnpm gate` green **uncached** — see §9 for the figures.
- **Tests added:** `tools/caspar-bridge/tests/live-layers-wire.test.ts` (23),
  `apps/runtime/tests/liveSourcesPanel.dom.test.ts` (40), eight in
  `apps/runtime/tests/MockRuntime.test.ts`,
  `apps/runtime/tests/e2e/live-source-layers.spec.ts` (1). Eleven `window.cg` stubs in existing
  layer-panel DOM tests gained the new channel — a stub that omits one fails in whichever OTHER spec
  first renders a component reaching for it, which is how these surfaced.
- **Mutation-checked, eleven ways**, each reddening the tests that name it: dropping the coordinate
  sort; forcing `held` false; deleting the push subscription; removing the link-down mask; making an
  owned row releasable; `liveLayersState()` returning `[]`; making `liveLayerBlindness` ignore
  `stackReady` (§4b) and ignore an empty stack (§4c i); removing the unverified demotion; never
  recording the unverified marks; and stopping the mock releasing on STOP.
- ⚠ **`awaitChannelModeRead` (flake family 3) deliberately NOT added, and that is a statement about
  these tests rather than a convenience:** the helper is required of a boot whose tests baseline the
  wire and assert the slice is empty. **No test here takes a silence baseline** — the ledger is
  bookkeeping that sends no AMCP, the unit tests open no sockets, and the two WS tests assert frames
  that ARRIVE. Adding it would imply a quiescence guarantee these assertions do not rest on. The file
  header records this.
- 🔴 **A Linux `gate:e2e` IS OWED** (this is a UI/render change). Its run URL is recorded in §9 and
  beside `tasks.md` 2.8 once the run completes green.
