# Session BO — a label that lied, the seams three defects came through, and a collapse that was not shipped

> **Safe to pull.** Everything below is on `dev`; see §0 for the pushed SHA. `pnpm gate` is green
> uncached (`0 cached, 89 total`).
>
> **Letter:** `BO`. `BN` was checked and is free — reserved for the confidence-grab recon session,
> so this took the next one rather than colliding.

## 0. State

| Fact              | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Tip read at start | `67674ed5` — exactly as expected, `HEAD == origin/dev`, tree clean, zero delta              |
| **Pushed**        | see §7 — verified by `git ls-remote origin dev`, never by an exit code                      |
| Filed             | **`B-156`** (fixed). `B-155` still **OPEN**; `tasks.md` 7.16 still **OPEN** — see §2 and §3 |

## 1. 🔴 What did NOT happen, first

**The collapse was built and reverted.** The owner's decision — the Inspector stops staging
template-assignment edits for a looks template — is right about the defect and was implemented.
Then the sweep found the thing that stops it:

**`LivePlatesSection` is the ONLY surface in the product that binds a plate to a source.**
`SourcesModal` DEFINES the station's sources and merely LISTS which plates reference one, for its
delete warning. It has no picker.

So removing that editor for looks templates leaves the template-level default with **no editing
surface at all** — §8's stop rule verbatim: _"Taking away the only door is not a collapse, it is a
regression."_ The cost is concrete rather than theoretical: without a template assignment every
FRESH row starts unbound and its take is refused (`live-source-unassigned`) until the operator sets
a per-look binding for every plate of every look, by hand, per row — which is exactly what a
template-level default exists to prevent.

**Three options are written into `tasks.md` 7.16, none chosen here.** (a) move the editor to a
config surface, completing the collapse and keeping a door; (b) the rejected candidate, reconcile
inside `setSourceAssignments`; (c) keep the editor but disable it while the row is ON AIR — the lurk
needs a live row, so this closes it, the door survives, and an off-air edit lands at the next take,
which is what the panel already promises. **(c) is the cheapest and I would start there**, but it is
a change to the owner's own decision, so it is his.

⚠ **`B-155` is therefore unchanged. Nothing got worse and nothing got better.**

## 2. 🔴 §3c — "UPDATE sends the values back to template default" is NOT REPRODUCED

Ruled out **by execution**, each one: the write path (`applyDraft`, `buildLookBindingsPayload`, the
draft store); the bridge STORING it; the bridge PUBLISHING it; **both** read schemas
(`StackItemStateSchema` on the push, `StackSnapshotChannel` on the pull); the retention schema; the
mock shim; **a LOADED-not-taken row specifically** — the state `B-156`'s screenshot shows the owner
in; and a stale `item` prop (it is a `useMemo` over the live `items`). It round-trips on **both**
backends.

🔴 **The one axis untestable from a dev machine: a SKEWED SPA BUILD.** A Runtime page older than the
bridge strips `lookSourceOverride` in its own zod parse and shows exactly this symptom with the
bridge perfectly correct. That is `B-153`'s subject and it is indistinguishable to the operator.
**What would settle it:** a hard reload of the Runtime page against the current bridge, then the
same edit. If it sticks, it was skew.

I did not ship a speculative fix for an unreproducible report. The seam test §3c asked for is
written and permanent regardless.

## 3. What landed

- **`B-156` — the badge that lied.** `ON AIR NOW` for a row the layer table called `READY`. It was
  gated on `activeLookOf`, which answers _which look the ROW is set to_ and says nothing about
  playing. Three states now, both predicates **imported**: `isOnAir` (the layer table's own) and
  `isRehearsing` threaded as a **prop** from the caller that already derives it for the row picker —
  so the badge and the picker answer to ONE derivation. Subscribing inside the section was tried and
  rejected: it coupled a leaf component to the bridge and broke every test that renders it.
  ⚠ The rehearsing case is the **`B-151` shape again** — BL shipped that distinction on the row one
  session earlier and this section never learned it.
- **The seam guards.** A panel → bridge → published-state → panel round trip, and a
  **schema-derived shim field-parity guard**. `mock-bridge-parity.test.ts` compares METHOD TREES and
  cannot see a dropped FIELD — which is how that class reached three instances (the shim's `lookId`,
  retention's whole map, and nearly `lookBindings`). Mutation-checked: it reddens naming the field.
- **The feature's first E2E** (`e2e/look-inputs.spec.ts`), driven through the real UI. BM-2 shipped
  none and said so.
- **§3d's default named in the control that inherits it** — `— template default (Studio 1) —`
  rather than a bare blank pointing at a section "above".
- **§3's invariant**, with its positive control. ⚠ **Honest provenance: green before and after.** BO
  shipped no bridge change, so it is a standing guard over a property the design already had, not
  evidence of a fix. The case where it is FALSE is pinned separately by the `B-155` repro.
- **§5 bookkeeping**: `B-155`'s marker `[~]` → `[ ]`; `B-154`'s registry section restored to what
  that session wrote, with `B-155`/`B-156` given their own dated entry; NUL sweep clean (font
  binaries only). ⚠ §5.6's "five commits" was only in the chat report, never in BM-2's handoff file
  — nothing in the record to correct. §5.5 (Persian/RTL on the masked label) is **not** done.
- **§6's rule is in `CLAUDE.md`** as golden rule 9.

## 4. The walk — and what the tests could NOT prove

1. Inspector offers no template-assignment edit → ❌ **not shipped** (§1)
2. per-look input + UPDATE, then a LOOK → the switch is a cut ✅ _at the wire_
3. no-looks template keeps its editor ✅ (E2E)
   3b. READY row does not claim air ✅ (E2E + unit, all three states)
   3c. value sticks after UPDATE → ✅ _in test_, **not reproduced as broken** (§2)
   3d. LOOK INPUTS with no LIVE PLATES → ❌ not shipped; the default IS named in the control ✅
4. `R-048` emergency still one action ✅ untouched

🔴 **Cannot prove:** anything about the plant, or that the flash is gone. `B-155`'s residual
(`6.9a`, `§3b`, the frame count) is a plant measurement and stays owed. §5.5's RTL case is untested.

## 5. Out of scope — named untouched

`B-155`'s plant residual · 7.15's frame count · 7.17 (stale title) · the confidence-grab recon ·
the unexplained 2× · AW's banner · BC's two deferred findings · P2.DEL · Session E ·
`template-http-server.ts` (read only, never staged).

## 6. If you touch this next

**Start at `tasks.md` 7.16 and pick (a), (b) or (c).** Everything else in this feature is waiting on
that choice: `B-155` cannot close until the lurk does.

## 7. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; openspec 58/58).
- `@cg/runtime` 97 files, `@cg/caspar-bridge` 77 — full suites.
- The new E2E ran locally, 2/2. **A Linux `gate:e2e` is OWED** and is discharged only by a COMPLETED
  run whose `E2E (Playwright)` job RAN — see §0 for the URL once it lands.
