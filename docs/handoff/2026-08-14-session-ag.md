# Session AG — Live Source phase 6 part 2: the picture reaches air, it is silent until asked, and one plate can be repointed on air

**Branch `dev`. Three unit commits, one push.**

| commit     | unit | what                                                                         |
| ---------- | ---- | ---------------------------------------------------------------------------- |
| `6336af29` | A    | **6.0** — THE ASSEMBLY, filed as a new task and built. A plate airs.         |
| `c26898d5` | B    | 6.5 · 6.5a–6.5e — every bridge-created producer is created MUTED             |
| `bee6ba39` | C    | 6.9 · 6.9a–6.9f — R-048's on-air swap; 6.8c deleted; **6.5f filed unticked** |

## ✅ What a plate does on air now: IT SHOWS A PICTURE

Session AF's handoff opened with "STILL NOTHING". That is closed. A declared,
assigned plate on a taken row now results in `PLAY <ch>-<layer> "route://2"`,
`MIXER … VOLUME 0`, `MIXER … FILL`, `MIXER … CLIP` on the wire, one command before
the template's own `CG PLAY`, recorded in the ledger as what was actually sent —
asserted from the mock's NDJSON trace, because the failure this fixes was invisible
to every state-only assertion.

## ⭐ THE FINDING OF THE SESSION — the same hole, one level up, TWICE

Unit A existed because the task list enumerated the components and never enumerated
the call site: **extend the list, forget the mutator**, arriving in the PLAN rather
than in the code. The standing rule after that was to check whether any other phase-6
cluster had the same shape. **One does, and I filed it rather than quietly building
it:**

🔴 **`6.5f` — THE AUDIO RULE'S RAISE HALF HAS NO OPERATOR SURFACE, AND NO TASK EVER
ASKED FOR ONE.** 6.5–6.5e enumerate the MUTE half at five sub-items. The rule's other
half is _"audio is raised only by an explicit recorded intent naming the layer"_ —
and nothing in the phase enumerates the surface that records it. **So every Live
Source plate is permanently silent today.** The bridge holds the mechanism
(`LiveLayerRecord.intendedVolume` + `CasparRuntime.setLivePlateVolume`, which survives
a swap and a re-seat and is tested through 6.9c); no operator control reaches it.

Filed rather than built because WHERE a per-plate volume lives — the row, the swap
dialog, a plate strip — is a product decision, not a wiring one. What it needs is
written into the task: an IPC channel over `setLivePlateVolume`, a control naming the
PLATE (never the layer number), and a published read-back so every console agrees.

⚠ **The pattern is worth more than either instance.** Both holes look identical from
inside a green task list: every enumerated item passes, and the feature does nothing.
When a phase enumerates one side of a rule, ask what the other side's mutator is.

## Unit A — the assembly (task 6.0, new)

**DECIDE, THEN ACT.** `#planLiveSeating` resolves every plate to a catalog entry,
validates the author's aspect against it, computes the geometry and picks the layers,
and **sends nothing**. So all four refusals — `live-source-unassigned`,
`live-source-aspect-mismatch`, `live-source-no-layer-range`, `live-source-no-layer` —
are reachable with the wire, the Reconciler and the ledger untouched, exactly like the
`rehearsing` / `unknown-item` / `disconnected` refusals they sit beside.

**BOTH ENDS OF THE ORDERING ARE ON-AIR DECISIONS**, and both are worth re-reading
before anyone "tidies" them:

- **Seating is LAST**, one command before the `CG PLAY`, because a live producer
  renders the instant it is played — there is no loaded-but-not-playing state for a
  route or a card the way there is for an html producer. Seating at load time would
  put a guest's picture on the programme channel, framed by nothing, for as long as
  the operator cued ahead.
- **Seating is BEFORE the take**, because the alternative is the template landing with
  its holes still empty — precisely what 6.7's refusal exists to prevent. Reaching
  that outcome by an ordering choice is no better than reaching it by a missing
  assignment. The cost is the mirror window (pictures with no frame for one command),
  bounded by the very next line on the same connection.
- **TEARDOWN IS THE OTHER WAY ROUND**: plates first, graphic second, in `out()` /
  `stopItem()` / `remove()`. The template covers the frame with a hole punched in it;
  clearing it first strips that covering off and leaves bare guest rectangles keyed
  over programme for the length of the teardown.

**ANY seating failure rolls back EVERY layer the action touched and refuses the
take** — not "keep what worked". The two failure shapes are a producer with no
geometry (a guest blown up across the whole programme, unmasked) and a `FILL` without
its `CLIP` (design §3 — renders nothing at all), both worse on air than a black box.
The ledger record is pushed BEFORE its send is awaited: from the moment a `PLAY`
leaves the process a producer may be on that layer, and a rollback walking only the
ACKED sends would leave a live picture nobody owns.

**A re-take lands on the SAME layers.** Not an optimisation — moving a plate would
leave the old layer's producer running with nobody's name on it, because the ledger
teardown walks would name the new one.

**The refusal's own SENTENCE now reaches the operator.** `StackTakeChannel` gained an
optional `message` and `asyncResultMessage` prefers it over the code's generic
wording. 6.7 requires the refusal to NAME THE PLATE and a fixed code cannot say which
of three is unassigned; before this it stopped at the bridge's stderr.

## Unit B — the audio rule, and a stale premise in three filed items

The mute lives in `#sendAdd`, the single `CG ADD` emit chokepoint, so all four callers
are closed by one implementation. **A failed mute does not proceed to the ADD**
(`add-mute-failed`, its own code — same cause as the rehearse path's `mute-failed`,
different consequence).

✅ **VERIFIED BY MUTATION:** with the mute removed from `#sendAdd`, **five of the six**
tests in `live-add-mute.integration.test.ts` go red. The sixth is `loadFixed`, which
correctly still emits nothing.

⚠ **R-042, B-121 and design §7 all name site 1 (`#loadOnto` via `loadFixed`) as
rehearse-guarded. It is not.** That guard was removed when LOAD became LIST-ONLY — a
path that cannot emit beats a guard that has to be remembered — so R-042's first
acceptance bullet ("LOAD is permitted on a rehearsing row") was **already satisfied by
a different route**. What the tables miss is `#loadOnto`'s SECOND caller: the dynamic
`load()` is not list-only, still emits, and never had a guard at all. That is the site
the mute actually closes. Corrected in all three places rather than quietly fixed in
one.

**One existing test was UPDATED, not relaxed:** `rehearse.integration.test.ts`
asserted `volume === 1` after a load. It now asserts `0`, which is the rule — a
stronger property than the one it replaced — and the mute→restore cycle it exists to
test is driven from a deliberately restored full-volume layer.

## Unit C — the on-air swap, and why it is not merely an emergency affordance

A PER-ITEM override on the `#positions` precedent. **A REPLACE, never a
clear-then-add**, and the test asserts the ABSENCE of a `CLEAR` on the wire rather
than the presence of a `PLAY`. On failure the previous producer stays, the ledger is
unchanged, and **the override is NOT recorded** — a row claiming the new source while
the layer carries the old is worse than the failure itself.

The override is resolved INSIDE `resolvePlateAssignments`, not by a second path: an
override is the same question an assignment answers, from a higher authority, and a
swap path that resolved plates its own way would be a second spelling of "which
producer is behind this hole".

`sourceId: null` reverts a plate. Not in the item as written, and added deliberately:
an emergency patch the operator cannot undo is its own trap.

## ⭐ 6.8c — DELETED, and this is the reasoning to keep

The owner's answer dissolves the task rather than closing it. Recorded in
`design.md` §12.6 and in the task's own tombstone:

1. **THE STUDIO IS NOT SPECIAL.** A live source is an ADDRESS mapped to a symbolic
   name — a DECKLINK, an NDI and a `route://1-2` carrying the studio are the same kind
   of thing to the catalog, the picker, `playSource` and the fit chain. 6.8c asked the
   GENERAL question (_what addresses do this installation's sources have?_) in a
   costume that made it look studio-specific. That question already has a home:
   **C-022**, the named live-source list.
2. **THE ADDRESS IS NOT FIXED.** It may be 1-1, 1-2 or another, chosen at the moment
   of use. No configured constant can be right, and even a perfect answer from CIAB
   would have held only until the next gallery decision.

🔴 **The consequence is the part to carry forward: R-048 is not a convenience.**
Choosing live is what R-048 IS, so the swap is the only mechanism by which a
moment-chosen source is addressable at all on this installation. A reading of 6.9 as
"nice to have in a failure" under-weights it.

🔴 **No studio-specific behaviour went anywhere in the code**, and none should: a
special case built now is one that has to be dug out later.

## Owed, and named

- 🔴 **6.9a — does `PLAY` on an OCCUPIED layer SUBSTITUTE on the plant's 2.3.2?**
  UNMEASURED. The mock models it as a replace, so the offline tests prove the code is
  self-consistent and prove nothing about the server. **The swap's whole safety
  argument rests on it.** R-048 is `[~]` for this one reason.
- **6.3a(a)** — is `CLIP` purely an INTERSECTION mask under PARTIAL overlap? Still
  unmeasured, and the fit code depends on the intersection reading.
- **6.3a(b)** — AMCP precision. 6 decimals chosen to match the page's `css()`, not
  because the server is known to want it.
- **§3b** — the `DEFER` / `COMMIT` question.
  ⭐ **All four are AMCP probes on the SAME 2.3.2 build. One session, not four.**
- **6.8 / 6.8a / 6.8b** — the two-box `route://` demo and its two recon items. Blocked
  on the plant, untouched as instructed.
- **C-021** — DECKLINK and NDI argument spellings remain PARSE-VERIFIED ONLY.
- **6.5f** — filed above, unticked. The audio rule cannot be exercised end to end
  without it.

## Gate and E2E

`pnpm gate` green — **85/85 tasks, `0 cached`** (the uncached run) — `format:check`
clean, and `openspec validate --all --strict` 50/50 plus
`openspec validate live-source-multibox --strict`.

🔴 **A Linux `gate:e2e` IS OWED.** The rule that applied: this session changes UI and
render paths directly — a new dialog (`LiveSourceSwapDialog`), a new row verb, and
`apps/runtime/src/renderer/**` edits — so the diff is classified as able to affect
what renders, with no argument needed about closures. Discharge requires a COMPLETED,
GREEN `e2e` job that actually RAN, cited by run URL; a SKIPPED `e2e` is a statement
about the diff and no evidence about the suite (P-029).

## P-014 flag

**Product source, on-air path — all three commits.** This is the session in which the
bridge first puts a non-html producer on a layer as a result of an operator action,
first mutes a layer before every `CG ADD`, and first replaces a producer on an
occupied layer. Every one of those reaches broadcast output.

**Shared config: none changed.** No root `package.json`, `turbo.json`,
`pnpm-lock.yaml`, `CLAUDE.md` or gate-hook edits.

**Schema additions are ADDITIVE and optional** — `StackItemState.sourceOverride`,
`RetainedStackItem.sourceOverride`, `StackTakeChannel.message`,
`LiveLayerRecord.intendedVolume`. No persisted record changes meaning and no existing
field's absence is reinterpreted.

## NOT done, by instruction

§1.5's punch tasks (plant CEF), 6.8/6.8a/6.8b, C-021's DECKLINK/NDI spellings, minting
any number, archiving, merging to `main`.
