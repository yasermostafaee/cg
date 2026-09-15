# 2026-09-15 — `TIMING-WIRE-22 · DELTA A` — hand-over

Full reasoning lives in [ADR 0009](../adrs/0009-timing-setting-ownership.md). This is the
short read: what changes for the operator, what to check on the plant, and what is filed.

## 🔴 One behaviour change reaches air

**An absent `repeat` used to mean ONE pass. It now means INFINITE.**

The Designer never wrote `playout.repeat`, so this is **every `loop-cycle` composition
authored before 2026-09-15**. A mode named `loop-cycle` that played once was the latent
defect; the default now lives in the schema (`repeatOf`) instead of privately in the
controller. Owner-decided, on test data, with no migration.

The Designer shows the effective `∞` rather than an empty box, so an author cannot be
surprised by a graphic that never leaves air.

## What the operator sees that is new

The Inspector has a **Timing** section on any row whose template loops.

- `Mode` and `Hold` are **facts**, not controls — the template's promise, and not the
  operator's to change (ADR 0009).
- **Off air** — `Passes next take`, with the inherited value named: `Default (∞)`.
- **On air** — `Passes remaining`, and the box shows **no number**. The pass counter lives
  in the page inside CasparCG's CEF and nothing carries it back, so the console states what
  it SENT instead: `Sent 2 more · 12:03:10`, or `Nothing sent this run — the template's own
count is running.` A count set from another console has no time this browser can know, so
  the line omits it rather than inventing one.
- `0` on air means "out after this pass" — an instruction, not a stop; the outro still runs.
- A template imported before this build says `Timing controls appear after this template is
re-imported.` rather than silently showing nothing.

## 🔴 On the plant — five steps, in order

1. **Re-import the looping templates.** A library entry keeps the page it was imported
   with; timing only works on a page built by this build or later. Skipping this makes every
   step below fail for the wrong reason.
2. Take a looping template, **set passes to 2 on air** → the pass on screen finishes
   uninterrupted, exactly two more play, then it goes out. No restart, no cut, no jump to
   frame one.
3. **Read the row after the last pass**, and read the section's text.
4. **Repeat, restarting the bridge after the first extra pass** → exactly ONE more plays.
5. **An old import** shows the re-import sentence and no control.

⚠ Step 2 is the one thing no test can prove: both sides of the CEF boundary are covered
(the bridge composes and sends the right `CG UPDATE`, asserted on the AMCP trace; a real
`TemplateRuntime` given that payload changes its loop without restarting), but the JOIN
through CasparCG is a plant measurement.

## What is filed, not fixed

- **`B-248`** (`docs/prd/bugs-runtime.md`) — a timing set is in flight and the row says
  nothing. The control is uncontrolled so it can never show an unconfirmed number, and the
  disabled input now carries a `title` saying it is sending; the row-level DECLARED /
  UNCONFIRMED treatment `R-063`'s doctrine asks for is not built.
- **The off-air count does not reach air** (`DELTA A3`). `Passes next take` promises
  something the system does not yet do: the count rides the `CG ADD` payload, and the
  `CG PLAY` that follows resets it from the authored `repeat`. Established with a red-first
  test (`packages/template-runtime/tests/pass-count-is-relative.test.ts`); the fix is in
  `PlayoutController.play()`, outside `DELTA A`'s authorised scope. **The on-air path is
  unaffected and works.**
- **`C-013` / `C-017`** — a finished graphic still claims ON AIR. This control makes that
  latent defect routine, because it lets an operator make a looping template finite on
  purpose. Both still read `⟨priority: medium⟩`; `DELTA A4` states the owner raised them on
  2026-09-09, and no such note exists in `caspar.md`.
- **No OpenSpec change exists for `TIMING-BUILD-21` or `TIMING-WIRE-22`.** Both landed as
  direct commits, so there is no `tasks.md` to hold the e2e run URLs; they are in ADR 0009
  instead. The next session touching playout timing should open one and fold it in.
