# ADR 0009 — Who owns which timing setting

- **Status:** Accepted
- **Date:** 2026-09-15
- **Related:** ADR 0002 (two apps — the Designer authors, the Runtime plays out),
  ADR 0007 (browser migration), `openspec/specs/designer-playout-lifecycle`

## Context

Playout timing is not one setting. It is a handful of settings that happen to be
spelled in the same units, and until now they were treated as one bucket: whatever
the preview modal could tune, it tuned.

Two of them describe **what the template promises to do** — `mode` (how many
open/close cycles) and `hold` (what ends each hold). The rest describe **how much
of a thing to play** — how many crawl passes, whether a crawl cycle drains or runs
seamless, how many rotator passes, how long a rotator item dwells.

The Designer's preview modal offered all of them as session controls, side by side,
with no distinction between the two kinds. That is the defect this ADR closes: the
preview let an operator-designer override a promise the template had made about
itself, and nothing on the surface said the two kinds of setting were different.

## Decision

**A setting that can break the template's own contract belongs to whoever authored
the contract.**

`hold = content-driven` means "stay until the content finishes". An operator who
changes it pulls the background out from under a headline sequence that is still
running — the template keeps its promise and the operator breaks it without knowing
they did.

That sentence sorts every timing setting into one of two owners.

### Designer-owned — stored with the template, read-only everywhere else

| Setting | Field                | Authored in                                 |
| ------- | -------------------- | ------------------------------------------- |
| `mode`  | `Playout.mode`       | the Designer's Inspector (`PlayoutSection`) |
| `hold`  | `Playout.holdSource` | the Designer's Inspector (`PlayoutSection`) |

Both are stored on the composition's `playout` object
(`PlayoutSchema`, `packages/shared-schema/src/scene.ts`) and read by
`@cg/template-runtime`'s `playout-controller.ts`, the single-file exporter and the
`.vcg` exporter.

### Operator-owned — per session, never written back to the template

| Setting            | Field                                |
| ------------------ | ------------------------------------ |
| crawl passes       | `TickerTimingOverride.repeat`        |
| crawl cycle seam   | `TickerTimingOverride.cycleBoundary` |
| rotator passes     | `SequenceTimingOverride.repeat`      |
| rotator item dwell | `SequenceTimingOverride.dwellMs`     |

These are per-element, keyed by the element's id, and live only for the run. None
of them can contradict a promise the template made: a crawl that runs three passes
instead of two is still a crawl doing what it said it does.

### What each surface shows

- **The Designer proper** (`PlayoutSection`, the Inspector) — `mode` and `hold` are
  **authored** here. This is the only surface that writes them.
- **The Designer's preview** — `mode` and `hold` are **read-only facts** about the
  template being previewed. The preview still shows them, because an
  operator-designer needs to see what the template will do; it does not offer them
  as controls. Its session controls (per-scope `holdMs` and `repeat`, and the
  per-element crawl / rotator / countdown rows) keep working unchanged, and its
  footer sentence stays true: session only, stored defaults untouched, authoritative
  live control belongs to the rundown.
- **CG Control** — read-only, always. The console has no timing section today
  (verified: `apps/runtime/src` contains no reference to `holdSource`, `playoutOf`,
  `PlayoutMode`, `HoldSource`, `loop-cycle` or `auto-out`). When one is built,
  `mode` and `hold` appear in it as **statements, never as inputs**.

### A read-only fact is written as a fact

A fact is not a disabled control. It does not get a control's chrome, a control's
affordance, or a control's greyed-out apology — an operator reading a greyed select
concludes they lack a permission, when the truth is that the value is not theirs to
set and never was.

Both apps render such a value through their `Tag` primitive
(`apps/<app>/src/renderer/ui/Tag.tsx`), whose type makes `onClick`, `tabIndex` and
`role="button"` inexpressible. That is the enforcement: a fact cannot be made
pressable by accident, so the surface cannot drift back into looking like a control
that refuses.

## Consequences

- **The preview cannot override `mode` or `holdSource` at all** — the two fields are
  gone from the preview's session-override type, not merely hidden behind a
  conditional. There is no control, and no channel a value could travel down.
- **A nested preview scope's timing relevance is now decided by its stored mode.**
  `PreviewScopeTiming` lists a nested scope only when its mode is timing-relevant
  (`auto-out` / `loop-cycle`); with the override gone, that reads the template's
  stored mode. The root scope is always listed, so every operator-owned control
  remains reachable for the template being previewed. The escape hatch that let a
  designer flip a nested `manual` scope into relevance from the preview is
  deliberately closed: if a nested composition should be timing-relevant, that is an
  authoring decision, made in the Inspector.
- **`@cg/template-runtime` is unchanged.** Its `PlayoutOverride` keeps `mode` and
  `holdSource`, because the runtime is a general render engine and those are
  legitimate engine options. The ownership rule is a product decision, enforced at
  the Designer's preview seam where the product lives.
- **Four Designer e2e specs drove the removed selects** and now set the mode in the
  Inspector before opening the preview, which is what a designer actually does.

## Deferred — a delay between passes (not built)

A delay before a template shows, whose main use is a gap between repeats of a looped
template, was specified alongside this decision and is **not built**. It needs a
stored home and the template has none: nothing in `@cg/shared-schema` holds a
between-passes gap today, so a designer-authored default would add a field to
`PlayoutSchema` — a schema change, out of scope here.

When it is built, it inherits this ADR's rule and the following decisions, which are
settled now so they are not re-litigated later:

- **The designer authors a default; the operator overrides it per row, per session.**
  It is both a design intent ("this lower-third needs breathing room between
  repeats") and a broadcast decision.
- **The override reuses the default-plus-override pattern the channel source defaults
  already use**, including showing an inherited value as inherited — `Default (2 s)`,
  not a bare `2 s` (`LooksBindingsSection.tsx`). No second inheritance mechanism.
- **The delay applies BETWEEN passes. It does not delay the first showing.** The
  reason is operational, not aesthetic: an operator who presses Play and sees nothing
  for three seconds presses it again. In a playout console a press whose result is
  invisible is a press that gets repeated.
- **A delay before the FIRST showing is explicitly out of scope.** If it is ever
  wanted, it is not just a number: the row must say it is waiting — the same amber
  attention state the console uses for declared-not-yet-applied — and the wait must
  be cancellable.
- **Changing the delay on an on-air row must not disturb the pass currently running:**
  no restart, no truncation, no gap that was not there. It takes effect from the next
  pass, and the UI says so in one short clause.
- **Zero is a legal value and means no gap.** A rejected value is refused with a
  reason, never silently rewritten — this tree has already found two clamps quietly
  turning 0 into 1.
- **It must not become a way to schedule.** It is a gap between repeats of one
  template; authoritative live control still belongs to the rundown.

## Alternatives considered

- **Leave the preview's `mode` / `hold` selects and label them "session only".** The
  footer already said that, and it did not help: the sentence explains what happens
  to the stored value, not what happens to the template's promise. An operator who
  flips `content-driven` to `timed` has not changed a default — they have changed
  what the graphic does, for the run they are watching, in a way the template's
  author ruled out.
- **Disable the two selects instead of removing them.** Rejected on the fact-not-a-
  disabled-control ground above, and because a disabled control still asserts that
  setting it is the kind of thing this surface does.
- **Make the ownership a lint rule rather than a type change.** Rejected: removing the
  fields from the override type is enforcement the compiler applies everywhere,
  including in code nobody thought to lint.
