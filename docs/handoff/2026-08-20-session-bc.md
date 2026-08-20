# Session BC — LOOKS phase 3: the ONE reconcile, on the look carrier (bridge, on-air)

## THE STATE, first (read this cold)

- **Pushed SHA:** see §0 — TWO commits landed: `1f76edb0` (the reconcile) and `868a8cfc`
  (the defects an adversarial review of it found). **Pull the SECOND one — `1f76edb0` alone
  carries a defect that destroys a producer on air.**
- **Base read:** `c5fdd051`, which contains BB's fix commit `5d56c5a5`.
- **BB's owed e2e — VERIFIED GREEN before any edit:**
  <https://github.com/yasermostafaee/cg/actions/runs/32292697141> — `head_sha` = `5d56c5a5`
  (BB's fix commit), `completed` + `success`, and the **`E2E (Playwright)` job RAN** (19:23:07 →
  19:31:53, `success`). Checked with `gh` against the API rather than taken from the doc.
- **This session's owed Linux `gate:e2e` — DISCHARGED ON THE FIX COMMIT:**
  <https://github.com/yasermostafaee/cg/actions/runs/32349777373> — commit `9caa49e0`
  (contains the `868a8cfc` fixes), `completed` + `success`, `E2E (Playwright)` **RAN** (its
  `E2E` step `success`, 08:38:11 → 08:47:06 UTC). 🔴 The earlier green run below is real but
  verified a tree that still carried the held-layer defect; it is NOT this stage's discharge.
- **The superseded run**, kept for the record:
  <https://github.com/yasermostafaee/cg/actions/runs/32323670161> — commit `1f76edb0`,
  `completed` + `success`, `E2E (Playwright)` **RAN** (02:10:21 → 02:19:03 UTC, its `E2E` step
  `success`; the only skipped step is the browser install, a cache hit). Recorded in
  `tasks.md` beside item 6.6. The classifier scored the diff `kind=code needsE2e=true` —
  `tools/caspar-bridge/**` is not on the known-non-render list, so it falls to the safe
  direction; the debt was owed and paid rather than argued away.
- **Nothing visual.** Bridge-side only; no UI, no render path touched.

## 0. 🔴 READ THIS BEFORE ANYTHING ELSE — the review found a real one

I ran an adversarial review over my own commit (five independent lenses, then two skeptics
per finding, each told to default to "refuted"). It found **1 critical + 11 major/minor**
defects that survived refutation. All are fixed in `868a8cfc`, each with its reproduction
turned into a test.

**The critical one, because it is the lesson rather than just a bug:** `#planLiveSeating`
offered a **HELD plate's layer as a free layer**. Before LOOKS, "every layer this item's
ledger names" and "the layers this plan is re-seating" were the SAME SET — a take seated
every declaration — so the cheaper spelling was correct **by accident**. Holding a record
broke that invariant, and nothing pointed at the line that did it.

The symptom then hid itself: a plate the new look showed for the first time was allocated
onto the held layer, its `PLAY` destroyed the held producer with no `CLEAR`, the ledger named
one slot twice — and on the way BACK the stale held record still matched layer+producer, so
`seatUnchanged` fired and nothing was ever re-played. The box showed the wrong feed, wrongly
cropped and silent, permanently, while the ledger, the published state and the operator all
named the right one. Only a re-take repaired it.

⭐ **The transferable lesson: an invariant that holds by accident is the one to write down,
because the change that breaks it will not look like it is touching it.** My own 6-box
fixture could never have caught this — every source is seated at the take there, so every
plate always has a preferred layer. The test that catches it needs a plate that is NOT in the
default look. I verified it goes red without the fix and green with it, and that the other 20
tests stay green either way.

## 1. What landed

`design.md` §4's argument, implemented. A **look switch** changes which plates are visible and
where; a **source swap** changes what one plate shows; a **take** is the same thing against an
empty prior set. The tree answered that one question in two places that each knew half of it.
Now there is one.

**`reconcileLivePlates(itemId, desired, { mode })`** in `tools/caspar-bridge/src/caspar-runtime.ts`:

- `desired` is the **active look's `{routeKey → rect}`**, produced by the one `#desiredPlateRects`.
  A pre-LOOKS carrier answers from its declarations, so every caller downstream sees exactly one
  kind of input and none of them learns which carrier it is looking at. A source **absent** from
  the map is absent from the look — the carrier never emits a zero-area rect, so absence is the
  only spelling of "not shown here".
- It resolves through **`resolvePlateAssignments`, unchanged**, and applies a **delta** against
  `#liveLayers`.
- `#seatLiveLayers` is **gone**. The take calls the reconcile's two halves — plan (DECIDE) before
  the pre-roll `CG ADD`, apply (SEND) one command before the `CG PLAY`.
- `swapLiveSource` lost its private resolve/fit/`PLAY`/re-ledger body and is now a **caller**.
- 🔴 **A plain look switch re-seats nothing.** Only a plate whose layer or producer actually
  changed is played; everything else gets its new `MIXER FILL`/`CLIP` and nothing more.
- **The fit is re-derived per look**, from the desired rect and never from `declaration.rect`.
- **§12.4's release policy is named and observable** — `live-plate-release.ts`.

## 2. The three decisions worth knowing about

### 2.1 The take does NOT call the single-call wrapper, and that is deliberate

`tasks.md` 6.2 says "route the take's `#seatLiveLayers` through it". It does — through the
reconcile's two halves, not through `reconcileLivePlates` itself. The take's ordering is an on-air
constraint documented at both of its call sites: it must DECIDE while the wire, the Reconciler and
the ledger are all untouched, and SEND one command before the `CG PLAY`. Collapsing the two into
one call would move the refusal **after** the pre-roll `CG ADD` had already replaced the stage — a
mutation on a take the operator was told did not happen.

So: **one planner (`#planLiveSeating`), one applier (`#applyLivePlates`), no third path.**
`reconcileLivePlates` is those two halves composed for callers with no such constraint. If you are
tempted to "simplify" the take into the wrapper, this paragraph is why not.

### 2.2 `mode: 'take' | 'live'` is ONE fact read once, gating TWO behaviours

This was found by a test, not by design. My first cut made the delta unconditional, and
`live-seating`'s "a RE-TAKE lands on the same layers" went red because a re-take stopped issuing
any `PLAY`. The test's _named_ property still held; the assertion that broke was that a re-take
re-plays. That assertion is right, and the reason matters:

> **A re-take is the operator's repair verb.** The ledger is a CLAIM, not a confirmation — nothing
> tracks live-layer liveness the way `#loaded` tracks the CG producer (B-039) — so a plate whose
> producer the server has since destroyed is indistinguishable from a healthy one. A take that
> sent nothing for it would leave the operator's one repair action doing nothing at all.

So the mode names what the ACTION IS, and both behaviours follow from that single fact rather than
being independently settable (golden rule 7's shape):

| `mode`   | re-assert?                   | on failure                                                                    |
| -------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `'take'` | every plate, unconditionally | roll back every layer this action touched                                     |
| `'live'` | delta only, never a `PLAY`   | undo only the plate that failed, destructively only if this action created it |

**No existing test was modified.** All 476 pre-existing bridge tests pass unchanged; the suite is
now 504.

### 2.3 Seat and punch are separate, so heldness had to become representable

`LiveLayerRecord.held` — additive, optional, persisted. Absent means "not held", so a ledger
written before looks existed comes back describing what it described then.

🔴 **It is persisted for a specific on-air reason, not for tidiness.** The reconcile re-asserts a
plate's audio intent exactly when it **un-holds** one (`prior.held === true`). A restart that
forgot the flag would treat the plate as on-screen, never re-assert, and leave a guest **silent**
behind a hole that looks perfectly normal — the audio half of the failure 6.9c names, arriving by
way of a restart instead of a swap. Pinned by a round-trip test in `live-layers-restart.test.ts`.

## 3. 🔴 What is NOT done — the bridge→page look transport (`tasks.md` 6.7, filed)

**A look switch is TWO mutations on two machines, and only one of them exists.**

- The **bridge** moves the producers' `MIXER FILL`/`CLIP` and holds the ones the look does not
  show. ✅ landed here.
- The **page** flips which look's instance is visible and re-punches its holes —
  `@cg/template-runtime`'s own `setActiveLook`, landed in phase 1D. ✅ exists.
- **Nothing carries the look id from one to the other.** The served page learns nothing from a
  `CG UPDATE` today.

So on the plant, `CasparRuntime.setActiveLook` currently moves the fills while the page keeps
punching the outgoing look's holes. It needs its own decision — a reserved field in the update
payload, and what a page that ignores it should do — and I did not invent one, because the shape of
that seam is a real choice and not an implementation detail. It is written up on the method itself
and filed as `tasks.md` 6.7.

**Phase 4 (stage E, the operator surface) remains BLOCKED**, on `tasks.md` 2.8 (B-145's display
half, verified still `[ ]`) and now also on 6.7. The UI work is not blocked; making the picker
actually switch what is on air is.

## 4. What the tests prove — and what they cannot

**Cannot:** the SDI seam on the plant. No unit test photographs a switch. Whether this command
sequence produces a clean cut on a 2.3.2 server is a plant measurement (it needs the plant's disk
for `PRINT`), not a result. Also unproven: the page's punch, for the reason in §3.

**Do:** the AMCP command sequence, asserted from the mock's NDJSON trace.

- `live-look-reconcile.integration.test.ts` (20) — the 6-box fixture: take → six band layers, one
  producer each; switch to solo → **no `PLAY` at all**, five plates held (still seated, muted,
  `held: true`), one re-fitted; switch back → **still no `PLAY`**, holes and fits restored, same
  layer set.
- **Axes discipline**: position-only, size-only, and both — each asserting the seat (layer, and
  whether a `PLAY` was issued) **and** the mask (the `CLIP` rect). The size-only case asserts a
  **real crop** (16:9 feed in a 1:1 hole ends up wider than its own mask and starting left of it),
  because 6.4's failure is a wrong crop on a picture that renders perfectly.
- **§4's audit table**: one `INVERSE n/4` test per row — plate set, mask, fit, layer allocation.
- **Both failure policies**: a failure mid-switch blacks nothing that was working; a take still
  rolls back everything.
- `live-plate-release.test.ts` (7) — the hold/teardown decision as a pure function.

⚠ The bridge cannot assert a punched hole. What it asserts is the layer's own mask, `MIXER … CLIP`,
which comes from the same geometry as `FILL` — the honest bridge-side reading of "both axes".

## 5. §12.6 — verified, had NOT drifted

`#multiBoxCount` reads `template.liveSources.sources.length` — the **group's declared sources**,
which under LOOKS is exactly the source-keyed list. It never referenced arrangements. Two call
sites, one predicate: `take()` and `restore()`. Nothing to fix.

I added a comment refusing the drift a later reader _would_ introduce: counting the **active
look's** rects instead ("only one box is showing, so this is not multi-box"). That would let a
second multi-box template on air beside a row parked on a solo look, and the collision would
arrive later — when somebody switched that row back to six, with both templates already playing.
Pinned by a test: a row on a solo look is still an incumbent.

## 6. Gate

- `pnpm gate` **green, uncached** — `Cached: 0 cached, 89 total`, `Tasks: 89 successful, 89 total`,
  3m43s. `format:check` clean across the whole repo (no gitignored-file noise this time).
- ⚠ `tasks.md` hit the documented prettier trap on the way: a line broken **inside** a
  `` `code span` `` makes prettier oscillate and never converge (two `--write` passes both failed).
  Fixed at the source by keeping the span on one line.

## 6b. The rest of what the review found (all fixed in `868a8cfc`)

**One root cause, seven findings** — the `'live'` failure branch decided everything from
"did this PLATE have a prior record", which is neither question that matters. It now decides
from what actually reached the SLOT, via two facts each evaluated ONCE and gating both the
destructive step and the ledger entry (golden rule 7's shape):

- `replacedInPlace` — slot-keyed. A plate that MOVED layers used to read as "replace" and
  strand a freshly created, UNMASKED producer that the ledger did not name.
- `playLanded` — captured in the send loop, the only moment it is knowable. A re-seat whose
  `PLAY` was ACKED but whose `MIXER` was refused now keeps the NEW record; writing the prior
  back pinned the wrong feed on air with everything agreeing about it. A re-seat whose `PLAY`
  was REFUSED still keeps the prior — nothing after it was sent, so B-126 holds and the swap's
  "still on its previous source" stays true. A re-fit failure keeps the ATTEMPTED geometry, so
  re-issuing the switch repairs instead of being a no-op that leaves the plate black.

**And four more, each verified by two skeptics:**

| #   | What                                                                        | Why it mattered                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `setActiveLook` used an EMPTY LEDGER as a proxy for "not on air"            | `registerLiveLayers` deletes an item's entry when its records are empty, so a row taken on the EMPTY look — or whose plates were all clips torn down by a look — is on air with no records. It was told `ok` while NOTHING was sent and every hole stayed dark. Now asks the file's own canonical `isOnAirStatus` (golden rule 6) |
| G   | An emergency swap was refused because a DIFFERENT plate lost its assignment | The repair verb bricked at the minute it exists for. Only a plate this action must seat ANEW may refuse; one already on screen is a working picture and is left exactly as it is (`unresolved`) — never refused over, never torn down                                                                                             |
| E   | `held: true` was committed without checking the mute's send                 | It is also the latch that stops the mute being retried, so one refused `VOLUME` left an off-screen plate AUDIBLE forever. The flag now records that the mute LANDED                                                                                                                                                               |
| K   | `setLivePlateVolume` asserted a raise onto a HELD plate                     | A voice on air from a box nobody can see, with a one-shot mute that would never take it down. The intent is recorded and applied when a look brings the plate back                                                                                                                                                                |

Plus a stale look id now falls back to the AUTHORED default rather than array order.

**One test changed deliberately** (and it is the only one): `releaseLivePlate` with an
unresolvable producer now HOLDS rather than tears down. Holdability is a property of the
producer FORM; reading "unknown" as "destroy it" loses a working picture over a missing fact,
and that fact is routinely missing for a healthy reason — a live action resolves only the
plates going on screen. `stillDeclared` is the axis that answers "can any look bring this
back", and it now comes from the CARRIER rather than from what a plan happened to resolve.

**Two findings were SPLIT** (one skeptic kept, one refuted) and are NOT fixed — recorded here
rather than silently dropped: (1) rollback `OUT`/`MIXER CLEAR` results are unchecked while the
records are dropped from the ledger — a pre-existing pattern this change did not introduce;
(2) `#activeLooks` is not persisted while the ledger's `held` is, so the first post-restart
reconcile resolves against the DEFAULT look. That second one is §12.7's territory (the
persisted-ledger item) and needs its own decision rather than a quiet fix here.

## 7. Still owed elsewhere (unchanged by this session)

- **The plant measurement** for the switch itself — it needs the plant's disk for `PRINT`. Not a
  blocker for this code; it is what would turn "the command sequence is right" into "the cut is
  clean on a 2.3.2 server".
- **`tasks.md` 2.8** — B-145's display half, still `[ ]`.
- **P2.DEL** — the A′ CODE deletion, still deferred (A′ is DISABLED, not deleted). Untouched here.

## 8. The single next action

Decide and land **6.7**, the bridge→page look transport. Until it exists the reconcile is a
half-switch on the plant. After that, stage E needs 2.8 as well.
