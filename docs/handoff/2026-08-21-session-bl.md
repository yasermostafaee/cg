# Session BL — the three defects the owner's plant walk found

> **Safe to pull.** Everything below is on `dev`; the tree is clean and `pnpm gate` is green
> uncached (`0 cached, 89 total`).
>
> **Handoff letter/date:** `BL`, 2026-08-21 — the next free letter after `BI` (BJ and BK were
> prompts that were superseded before they ran; no handoff exists for either).

## 0. State

| Fact                 | Value                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tip read at start    | `7a281396` — exactly the expected tip, no delta                                                                                                                                    |
| **Pushed**           | **`964afe72`** — `git ls-remote origin dev` = local, tree clean                                                                                                                    |
| **Linux `gate:e2e`** | ✅ **DISCHARGED** — [run 32442480149](https://github.com/yasermostafaee/cg/actions/runs/32442480149) on `964afe72`, `completed` + `success`, **`E2E (Playwright)` RAN** and passed |
| Filed                | `B-151` (PVW), `B-152` (the identifier), `B-153` (the skew guard)                                                                                                                  |

## 1. 🔴 Defect one — and HALF the reading it was reported under was wrong

**The relayed diagnosis:** "the page renders in three places and the look state reaches only two —
PVW's page was never wired."

**The second half is true and is fixed. The first half is not what the owner saw.** Verified from
the code before touching anything: the page inside the PVW frame enters the AUTHORED DEFAULT look at
build, synchronously (`runtime.ts` — _"A fresh build enters the DEFAULT look… whatever the
instances' authored `visible` says"_), and hides the other looks' instances. So the page was showing
ONE look all along.

🔴 **The overlapping boxes were the placeholder OVERLAY** — Runtime-side chrome drawn on top of the
frame (`R-049`), which had nothing to do with the page's look state. `platePlacements` mapped
`live.sources`, which under LOOKS is the source-keyed UNION of every look's members, and read each
declaration's `rect`, which is that plate's geometry **in the default look only**. So: every plate of
every look, and after a switch at the wrong geometry too.

**The table, corrected:**

| Where             | How it learns the active look   | Before                                                 |
| ----------------- | ------------------------------- | ------------------------------------------------------ |
| Designer canvas   | `postMessage` → `setActiveLook` | wired                                                  |
| The plant page    | `__cg` key on the `CG UPDATE`   | wired                                                  |
| **PVW's page**    | the same `__cg` key             | 🔴 **not wired** — now is                              |
| **PVW's overlay** | `lookPlateRects` on the carrier | 🔴 **did not know looks existed** — the visible defect |

### 1a. One mechanism, and it had to move to reach all three

`activeLookOf` + `lookPlateRects` now live on the CARRIER in `@cg/shared-ipc`, beside
`TemplateLiveSources`. The bridge's `#activeLookOf` / `#desiredPlateRects` delegate to them; the
overlay calls them. PVW could not have called a private method on a process it does not run in —
which is precisely how it came to have its own idea of the layout. The page half rides the existing
`__cg` payload key, not a preview-only call, so there is no third spelling of "tell the page which
look".

### 1b. The PVW look control — built, then REMOVED on the owner's correction

> _"The same LOOK buttons on the row already worked for PVW too — there was no need to add new
> similar buttons above PVW."_

He is right, and the seam survived the control's removal untouched: the row's picker drives
`stack.set-active-look`, and the published `activeLookId` is what BOTH halves of the preview read. I
had already wired it that way, which is why deleting the duplicate UI cost nothing.

🔴 **One control, two targets, decided by the row's own state.** A REHEARSING row is off air by the
**R-022 interlock** — rehearse is refused for an on-air row, a take is refused for a rehearsing one
— so `setActiveLook` records the look and sends **no AMCP**. That is asserted on the wire, and the
interlock it rests on is asserted beside it rather than assumed.

**How the target is made unambiguous** (the client's "the operator cannot be mistaken"): the picker
says it about ITSELF — `PVW LOOK` vs `LOOK`, matching `aria-label`, and `data-look-target` for tests
— so the answer is on the control the hand is on, not three columns away in the state cell. It is
also **not disabled by an unreachable server while rehearsing**, because that refusal belongs to air
and rehearsing with the plant down is exactly when a preview is most useful.

**What a take does: what you rehearsed is what you take.** The recorded look is what `#activeLookOf`
resolves at the take and what rides `CG ADD` unconditionally. No new mechanism.

## 2. Defect two — one instance was a pattern

`unknown channel: stack.set-active-look` reached a red toast because `LayerRow`'s catch passed
`err.message` into a helper whose documented contract is "message first, always" — right for a
refusal, wrong for a transport error.

🔴 **The sweep is the finding.** **Fourteen** renderer call sites pass a caught `err.message` to a
toast; exactly **two** translated these shapes, each with its own copy of the regex — and the two
**disagreed**: `delimiterStore` tested only `unknown channel`, so `invalid request for
delimiters.set` fell through verbatim.

Fixed at the ONE line where every bridge error becomes an `Error` (`WebSocketRuntime.#onMessage`),
so every call site — including ones not yet written — is covered without knowing `bridgeSkew.ts`
exists. Asking each surface to translate is the thing that just failed.

⚠ **And it uncovered an older defect.** `#invoke`'s `resolve` ran `channel.response.parse` inside the
socket's message listener with no guard, so a malformed response **crashed the message pump as an
uncaught exception** rather than rejecting its caller. True of every channel; `B-153`'s handshake,
being the first request on every connect, is what made it reachable on every boot. It surfaced as a
red gate on a suite where all 855 tests passed.

## 3. Defect three — a capability handshake, reporting at connect

A **version compare was rejected**: two builds can differ in ways that have nothing to do with the
channels this page calls, so it either refuses working stations on any bump or needs a number
somebody must remember to bump. `bridge.capabilities` reports the routes the bridge **actually
wired**; the SPA compares against the same derivation the build-time route-coverage guard now uses.
Neither side keeps a list by hand.

🔴 **It REPORTS; it does not REFUSE** — a deliberate reading of §3.2. A bridge missing one channel
still plays out through the twenty it routes, and refusing everything would turn a partial skew into
a total outage. An amber `role="alert"` banner names the count and the remedy at connect; the
missing commands refuse themselves legibly.

## 4. Tests

4.1–4.5 all present. The two that matter most:

- **4.1/4.2** are mutation-checked: restoring the old `sources`/`rect` mapping reddens them with
  exactly the reported symptom (`['l-1','l-2']` where one belongs; 480px where 960 belongs).
- **4.4** includes a REAL-BRIDGE positive control — a matched pair must report NO skew. Without it,
  a drift between the derivation and the routes would put a banner on every healthy station and
  train operators to ignore it.

## 5. Out of scope — named untouched

Per-look source assignment (BM, next), the speed-under-repetition issue, AW's banner, BC's two
deferred findings, `tasks.md` 7.10, P2.DEL, Session E. `template-http-server.ts` not touched; no
scratch files committed; every commit staged by explicit path.

## 6. What the owner can check — his four-step walk

1. **1-box + 2-box template, row in REHEARSE → PVW shows exactly ONE look**, matching air.
2. **Switch looks on the row → PVW follows.** While rehearsing the row's picker reads **PVW LOOK**;
   on air it reads **LOOK**.
3. **Stop the bridge, press a LOOK button → a legible failure**, no internal names.
4. **Run against an older bridge → an amber banner at connect**, naming how many commands are
   unavailable and what to do.

🔴 **What the tests could NOT prove:** steps 3 and 4 are proven at the unit and transport level, not
through the real UI — no test drives an actual toast or renders the banner against a live older
bridge. Step 1's _pixels_ are unproven: the assertions are on the placement list, not on a
screenshot, so "no bounding box" is asserted as ABSENCE FROM THE LIST rather than photographically.
And nothing here proves what the plant's CEF composites.

## 7. If you touch this next

The picker's target is derived from `rehearsing` in `LayerRow`. If a row could ever be rehearsing
AND on air at once, that derivation would be a lie — the R-022 interlock is what makes it safe, and
`live-look-reconcile.integration.test.ts` pins the interlock itself for that reason.

## 8. Verification

- `pnpm gate` — green, uncached (`0 cached, 89 total`).
- The SUITE, not just new specs: `@cg/runtime` 92 files / 856 tests, `@cg/caspar-bridge`,
  `@cg/shared-ipc`, `@cg/soak-runner`'s bug-number audit.
- **`gate:e2e` — OWED and DISCHARGED.** `apps/runtime`'s UI changed, so a Linux run was owed.
  [Run 32442480149](https://github.com/yasermostafaee/cg/actions/runs/32442480149) on **`964afe72`**
  — the commit carrying every change of this session — is `completed` + `success` with the
  **`E2E (Playwright)` job RUN** (not skipped, which is the condition that matters).

## 9. 🔴 What is NOT here — BM is BLOCKED on an owner decision

The per-look source assignment session (BM) was started and **stopped at its own §2.1 verification**,
before any code, because the model it specifies cannot be built as written:

**Seating is keyed ONE LAYER PER DECLARED SOURCE** (`#planLiveSeating` iterates `carrier.sources`;
`#liveLayers` holds one record per `sourceId`), and the identity rule — _"the same source in two
looks is ONE seat held across the switch"_ — is stated in three places, one of them an author-facing
export-preflight error message.

So if solo's `l-1` and 2-box's `l-1` may name DIFFERENT inputs, they cannot share a seat:

- **(A) keep `routeKey` identity** → the switch RE-SEATS that plate (`PLAY` + `MIXER VOLUME` +
  `FILL`/`CLIP`, a replace with no `CLEAR`). BM §2.2's "a preset must pre-seat" is then IMPOSSIBLE
  for a re-pointed cell — the layer is occupied by the live look's producer — and the owner's own
  walk step 3 ("shows what you preset, instantly, with no re-seat") is false for it.
- **(B) identity becomes `(look, plate)`** → the seated set really is the union of every look's
  assignments, pre-seating works and §12.4 is intact — but the layer allocation grows from
  `|plates|` to `Σ|look members|` against a declared band, and the ledger, the allocation, retention
  and §12.6's exclusivity premise all move with it.

**The owner's walk demands (B)**, which is a materially bigger session than "add per-look assignment
to the Inspector". BM's own §9.5 says to bring exactly this kind of thing to him rather than let him
find it in a diff.

⚠ **Two BM answers that hold either way, so they are not blocked:** `#multiBoxCount` still counts
the right thing (a box is a `routeKey`; per-look assignment changes what is BEHIND a box, not how
many there are — session BC's anti-drift comment is intact and still correct), and BA's
_within-a-look_ duplicate refusal still holds. What breaks is the ACROSS-looks half — _"that is the
identity mechanism"_ — which is user-visible text in the preflight error and in the Looks section's
summary.

BM's §5 (the source-name binding's deferral cost) was **not** reached.
