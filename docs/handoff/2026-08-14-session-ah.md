# Session AH — 6.5f: the audio rule's RAISE half gets its operator surface

**Branch `dev`. One unit commit (`6c562173`), one push.**

## What this closes

Until this landed, **every Live Source plate was permanently silent.** The rule is
that every producer the bridge creates is created MUTED and audio is raised only by
an explicit recorded intent naming the layer; phase 6 enumerated the mute half at
five sub-items and never enumerated the surface that records the intent. Session AG
found the hole by applying the standing "check whether another cluster has the same
shape" rule after task 6.0, and filed it rather than building it — because where a
per-plate volume lives is a product decision.

`AUDIO` now sits beside `SOURCE` in the row's action set and opens a per-plate panel:
one MUTE button and one level control per plate, committing on release.

## The placement, and the two rejections

**ON THE ROW, BESIDE THE SOURCE SWAP** (owner, 2026-08-14). Under pressure, on air,
"which source" and "how loud" are one decision made in one place — 6.9e already
requires the swap to be one or two actions from the row and explicitly not behind a
modal chain, and the volume has the same emergency character. And 6.9c already
settled that the audio intent belongs to the **PLATE**, not to the producer instance,
so a control expressing a plate-level property belongs where the plate's other
per-run property already is.

**Rejected, recorded in `tasks.md` and `design.md` §7a so neither is re-proposed:**
inside the swap dialog (turns a two-second adjustment into opening the swap flow, and
couples two independent acts) and the PLAYOUT tab (further from the operator's flow
than the row they are already looking at).

⚠ **It is a dialog rather than an INLINE row control, and the row forces that rather
than my choosing it.** A row carries a VARIABLE number of plates; the verb block is a
fixed six-column grid whose sticky header prints a word above each glyph
(`layerTable.ts`, `VERB_COUNT = 6`). A conditional inline control would misalign
every header word from its button — which that file names as the DANGEROUS failure,
because this product's STOP and CLEAR are the inverse of the reference product's and
the header word is what retires the misread. So `AUDIO` sits beside `SOURCE` in the
row's own action set, which is as close to the row as a per-plate control can get,
and a test asserts the two are **adjacent** rather than merely both present.

## 🔴 The retention question, answered: surface PLUS the OPEN-axis field

The brief asked me to verify rather than assume. **It did not round-trip.** AG's
`intendedVolume` lived only in the bridge's in-process `LiveLayerRecord` — never in
`StackItemState`, `RetainedStackItem` or `StackRetentionStore` — and that ledger is
destroyed by teardown and discarded on restart. So a CLEAR-then-retake, or a
momentary bridge blip, silently re-muted a plate the operator had deliberately
raised: **the picture came back and the guest did not, with every console showing the
row as normal.**

That is `B-107`/`B-109` applied to the one property of a graphic nobody can SEE,
which is what makes it worse than its two neighbours: a dropped position or source
override shows the wrong picture and somebody reports it.

So: `#plateVolumes` is the intent and rides `RetainedStackItem.plateVolumes` on the
OPEN axis beside `sourceOverride`. The ledger keeps a copy of what was **sent** — the
same relationship its `producer` field already has to the catalog.

## ⭐ The standing sweep, run mechanically — and it found one more

The brief asks whether any other phase-6 rule is enumerated in only one direction. I
answered it from the code rather than from memory: a script enumerating every public
`CasparRuntime` method with no caller outside its own file, plus every `stack.*`
channel declared but not routed.

**Result: no unrouted channel, and one real finding —** `releaseLiveLayers`. A
documented phase-5 API called only by tests, whose body (`#liveLayers.delete(itemId)`)
was written inline three more times beside it. **One named rule, four
implementations** — exactly the drift the rule predicts, in the other direction from
6.0 and 6.5f: not a missing mutator but an unused one with copies. All three sites
now route through it. The other names the sweep returned (`liveLayers`,
`livePlateVolumes`, `fixedSlots`, `templateHtml`, `templateServeUrl`) are read
accessors used by tests and the ownership doors, not orphaned mutators.

**Two directional gaps remain closed but worth naming**, because both were fixed
opportunistically rather than by an item: 6.9 enumerated the swap and never the
revert (AG added `sourceId: null`), and 6.5 enumerated the mute and never the raise
(this session). The pattern is now three-for-three in phase 6 — when a phase
enumerates one side of a rule, ask what the other side's mutator is.

## ✅ Mutation-verified, four times

The mute half was verified this way and the raise half is held to the same standard:

| mutation                                   | result                             |
| ------------------------------------------ | ---------------------------------- |
| read the intent off the ledger again       | 3 integration tests red            |
| drop the retention re-apply in `restore()` | the round-trip test red            |
| treat a volume of `0` as falsy             | both zero tests red                |
| commit on every drag frame                 | the commit-on-release DOM test red |

## Zero is falsy — what is pinned

An explicit `0` ("the operator muted this plate") is **recorded and published**, and
is distinguishable from an ABSENT key ("nobody has said"). A plate deliberately
silenced is **not re-raised by a swap**. The range guard runs `Number.isFinite`
first, because `NaN >= 0` is false and a NaN would otherwise be recorded as an intent
nothing could ever assert. A gain above 1 is refused at the boundary rather than
sent — it is a request to amplify a guest's microphone.

## No second unmute path

The seating path already asserts every plate's intent on every take, unconditionally
— the plate's exact analogue of `take()`'s `INTENDED_VOLUME` re-assert, and the
mechanism the mute half defers to. `setLivePlateVolume` feeds it rather than
duplicating it.

## Gate and E2E

`pnpm gate` green — **85/85 tasks, `0 cached`** — `format:check` clean, and
`openspec validate --all --strict` 50/50 plus
`openspec validate live-source-multibox --strict`.

✅ **THE LINUX `gate:e2e` IS DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/31805968504
(run 31805968504, `push` on `dev`, `headSha eb53df68` — this session's own tip).
`conclusion: success`, `status: completed`, and the **E2E (Playwright) job RAN** —
verified as that job's OWN `conclusion: success` rather than as "a green run exists",
because a SKIPPED `e2e` is a statement about the DIFF and no evidence whatsoever about
the suite (P-029).

The rule that made it owed: this adds a row control and a new dialog under
`apps/runtime/src/renderer/**`, so the diff is classified as able to affect what
renders with no argument needed about dependency closures.

## P-014 flag

**Product source, on-air path.** This is the first time an operator action can make a
Live Source layer AUDIBLE. The failure direction it creates is a guest's microphone
open when nobody intended it, which is why the intent is recorded only after the send
lands, an explicit `0` is never folded into "unset", and the range is bounded at the
boundary.

**Shared config: none changed.** Schema additions are additive and optional
(`StackItemState.plateVolumes`, `RetainedStackItem.plateVolumes`), so no persisted
record changes meaning.

## NOT in this session

6.9a's substitution probe and the other three AMCP questions (one plant session,
together), 6.8/6.8a/6.8b, C-021's DECKLINK/NDI spellings, §1.5's punch tasks, minting
any number, archiving, merging to `main`.
