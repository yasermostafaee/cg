# Design notes

Only the decisions that were not obvious, and the ones a later reader is most likely to
undo by accident.

## 1. Why a per-ROW override and not a per-SCOPE one

`C-003` asks for a live override keyed by nested-instance path. This ships a per-ROW
value that the page fans out to every scope that actually loops.

The reason is the surface, not the plumbing: an operator selects a ROW and asks for "two
more passes". They are not thinking about the composition tree, and a console that made
them pick a scope would be asking a question the template's author already answered. The
fan-out is filtered, not blanket — the page's appliers are no-ops on a controller that is
not cyclic, so the value reaches exactly the loops and nothing else.

⚠ The earlier note said the applier was ROOT ONLY and "deliberately not cascaded". That
was a guess and it was wrong: it made the feature dead on the common shape, where the row's
mode is `manual` and the scope that repeats is a nested instance below it. Two stale
copies of that retired sentence are still in the tree and are listed as an open task.

## 2. Why the count on the wire is RELATIVE, and what that costs

What crosses to a RUNNING page is "passes remaining from now" — the pass on screen is not
one of them, and `0` means "out after this pass". That is a different quantity from the
template's authored `repeat`, which is a TOTAL.

Two names for two meanings is honest. The cost is that the value is an INSTRUCTION, not a
state, and **an instruction is not idempotent**: sending `2` twice to a running page gives
it four more passes, not two. Everything the restore does downstream depends on that fact,
which is why the restore may not re-send a relative count to a page already running one.

The stored field is named `repeat` (it overrides `PlayoutSchema.repeat`) and the wire
member is named `passes` (it is the operator's instruction). The conversion is a NAMED
function called from both send sites, rather than an object literal spelled out twice —
two names meeting silently is how one comes to mean the other.

## 3. Why the on-air box shows no number

The pass counter lives in the page's controller, inside CEF, and no return path carries
it. Swept for five names across four trees against a positive control; found in none.

So a number under "Passes remaining" would be a reading with a shelf life: one pass after
"set 2" it still says 2 while ONE remains, and after the count runs out it says 2 over a
graphic that has gone. It decays with nobody touching anything, which is the worst shape a
false readout can take. The console states what it SENT instead — a claim about the past
cannot decay.

⚠ If a readback is ever built, this is the decision to revisit first.

## 4. Why the metadata is versioned rather than back-filled

A stored `TemplateInfo.playout` produced by the superseded resolver is WRONG, not old: it
published whichever composition a per-composition export happened to list first. Measured
on the plant's own saved records — a crawler read `static / timed`, a clock panel's
defaults, over its true `auto-out / content-driven`.

The invariant that makes an absent-or-stale check safe is that the metadata and the page
are produced by the SAME import, from one unpacked scene. **Anything that back-fills the
metadata onto an existing registry entry without rebuilding its HTML breaks it** — the
console would offer a live control over a page that ignores it, and the operator would set
a count, see it accepted, and watch the graphic run on regardless. If the two are ever
separated, this gate needs a real capability bit instead.

## 5. Why a timing edit became a draft

It committed on BLUR. Two consequences, both owner-observed: a click anywhere else on the
panel sent a command toward air, and the typed number vanished on its way out. Every other
Inspector edit stages and waits for one press; timing was the only surface on which looking
away was a commit.

It travels on its own channel, sent immediately before the field update — NOT folded into
the field payload. Folding it in would mean the renderer composing `__cg`, a reserved key
the BRIDGE owns and strips, and would make one wire message answer to two owners.

## 6. Why the timing is seated BEFORE the controller cascade in `play()`

The opposite of where the look is entered, and both positions are load-bearing.

The look is entered LAST, because restoring content writes `display` back onto nodes and
would un-hide what the look hid. The timing is applied FIRST, because the controller
SNAPSHOTS the count into its remaining-cycles counter at `play()` — applied afterwards, the
same number would be read as a live edit to a loop that had already chosen its total, which
by §2 is a different quantity.

This was the defect the owner met on the plant: `play()` lifted the control payload and
honoured only the look, so on any host that delivers load data through `play(data)` the
operator's count was read and then dropped.

## 7. Alternatives considered and rejected

**Rebuild the scene to re-time it.** Every other route to a playout knob goes through a
scene replace — remove and re-create the runtime — which on air is a black frame in the
middle of a live graphic. Refused; the mid-air update mutates the live playout object
instead.

**Disable the mode and hold controls rather than removing them.** A greyed select tells
the operator they lack a permission, when the truth is the value was never theirs to set.
And a control disabled by a flag is one edit from coming back. The channel is removed
instead: the fields are absent from the override type, so the compiler enforces it in code
nobody thought to lint.

**Store the audit value as a sentence.** Rejected for the reason `B-211` gives for names:
the record keeps what cannot be re-derived and the SURFACE does the wording. A stored
sentence cannot be re-worded, cannot be translated, and cannot be filtered on.

**Land the raw-control lint rule as a ban.** It would have landed red on 40 existing sites,
and a guard landed red is a guard the next session turns off. It is a RATCHET instead: the
debt is frozen per file and the rule refuses movement in both directions, so it protects
everything written from today without demanding a 40-site migration first.
