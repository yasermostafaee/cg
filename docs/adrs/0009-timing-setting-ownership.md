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
- **CG Control** — read-only, always: `mode` and `hold` appear as **statements, never as
  inputs**. ⚠ When this was written the console had no timing section at all; it has one
  now (`TIMING-WIRE-22` §4, below), and it honours this rule — the two are `Tag` facts
  beside operator-owned controls for passes and gap.

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

## The delay between passes — BUILT (`TIMING-BUILD-21`, 2026-09-15)

This section recorded a deferral. The owner took the schema decision and it is now
built, so the deferral is **superseded** — but the decisions below are not, and they
are what the implementation follows. They are kept, in their original words, because
they are the reasoning and only their status changed.

**What shipped:** `PlayoutSchema.delayMs` (the gap between passes, beside `repeat`,
which already existed but had no authoring control); both authored in the Designer's
Playout section; the runtime's own `gap` phase and
`TemplateRuntime.setPassTiming({ passes, delayMs })` for changing either on air
without a restart.

**One decision was taken that this section did not anticipate, and it is a behaviour
change on the path to air:** an absent `repeat` used to mean ONE pass (privately, in
the controller) and now means `'infinite'`, stated once in the schema. A mode named
`loop-cycle` that played once was the latent defect; the Designer never wrote
`playout.repeat`, so this affects every loop-cycle composition authored before that
date. Owner-decided, on test data, with no migration.

**The console's timing section and the wire beneath it are BUILT** (`TIMING-WIRE-22`,
2026-09-15). The pass loop runs inside the template's JS in CasparCG's CEF and no AMCP
verb carries timing, so the road is `CG UPDATE`'s `__cg` control object: a `timing`
member on it, the page's update handler routed to `setPassTiming`, a
`stack.set-pass-timing` channel gated by `#ownsLiveSeats`, the bridge's restore
re-apply, and the publisher fast-path. The section states `mode`/`hold` as `Tag` facts
and offers passes and gap as controls that name what they inherit.

⚠ **The restore re-applies the bridge's MAP and tells the page NOTHING** (`DELTA A1`). An
earlier spelling of this sentence said it also told an adopted page, and that was the
defect: `passes` is RELATIVE — "remaining from now" — so re-sending the stored `2` to a
page that has already run one of its two gives the operator two more instead of one. And
the state it was written for cannot arise: an `on-air` row's page was necessarily sent the
value (the bridge records only on acceptance), and a `loaded` row has not `play()`ed, which
discards anything set beforehand. A REBUILT page is the opposite case and keeps its carrier
in `#sendAdd`.

⚠ **Two corrections are recorded here because both were guesses that read as correct.**

> ⚠ **CORRECTION 1 BELOW IS ITSELF SUPERSEDED — annotated 2026-09-15 (`DELTA B1`), left
> standing because the reversal is the record.** It was measured on STARTER PROJECT SCENES
> (`packages/starter-templates`), and **that shape never reaches air**: the Runtime only ever
> imports an EXPORTED `.vcg`, whose root IS the chosen composition (the exporter flattens it
> there). Measured on the plant's own saved records, `~/.cg-runtime/bridge-templates/`:
> `میان‌برنامه (روی آنتن)` has `layers: 1` at the root with `playout {auto-out,
content-driven}`. So the resolver reads the ROOT after all — and `entryCompositionId` is a
> Designer-side pointer the runtime never reads (swept across five render-path packages, each
> pathspec proven non-empty). The fallback it relied on was the real defect: a per-composition
> export names a composition the package does not contain, so `?? comps[0]` published a clock
> panel's `static / timed` over a live crawler. See `B-249`.

1. **The row's timing is NOT the scene root's.** Every real template has `layers: []`
   and a set `entryCompositionId`, so `playoutOf(scene)` answers `static` for all of
   them. Reading the root made the console state `Static` for every template and offer
   no control, while the runtime's root-only apply early-returned on a non-cyclic
   controller — the road was dead at both ends, with green tests. `templateTimingOf`
   resolves the ENTRY composition for what the row does and the first LOOPING scope for
   the count and gap an override inherits; `applyPassTiming` reaches every scope that
   actually loops. **A screenshot caught this, not a test.**
2. **"Does this template loop" is its own bit**, not `repeat !== undefined`. A scope can
   be `loop-cycle` with no authored count — the common case, since the Designer never
   wrote `playout.repeat` before `TIMING-BUILD-21` — so deriving it from `repeat` hides
   the controls on exactly the templates that need them.

🔴 **STILL NEEDS A REAL SERVER.** Everything above is proven either side of the CEF
boundary — the bridge composes and sends the right `CG UPDATE` (asserted on the AMCP
trace), and a real `TemplateRuntime` given that payload changes its loop without
restarting. What no mock can prove is the JOIN: that those bytes survive CasparCG's
`CG UPDATE` path into the page's `window.update` intact.

### The plant walkthrough must add these five steps

1. **After deploying, RE-IMPORT the looping templates.** A library entry keeps the page it
   was imported with, and timing only works on a page built by this build or later. This
   step is first because skipping it makes every step below fail for the wrong reason.
2. Take a looping template and **set passes to 2 on air** → the pass on screen finishes
   uninterrupted, exactly two more play, then it goes out — no restart, no cut, no jump to
   frame one.
3. **Read the ROW after the last pass**, and read the section's text. The row is expected to
   still claim ON AIR (`C-013` / `C-017`, both open — this control makes that latent defect
   routine), and the section should say what was SENT, not a live count.
4. **Repeat, restarting the BRIDGE after the first extra pass** → exactly ONE more plays.
   Two would mean a restore re-armed a relative count.
5. **A template imported before this build** shows `Timing controls appear after this
template is re-imported.` and no control.

### Delivery note — one behaviour change reaches air

**An absent `repeat` used to mean ONE pass and now means INFINITE.** The Designer never
wrote `playout.repeat`, so this is every `loop-cycle` composition authored before
2026-09-15. Owner-decided, on test data, with no migration. The Designer shows the
effective `∞` rather than an empty box so an author cannot be surprised by it.

The decisions this feature inherits, settled before it was built and unchanged by
building it:

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

## The record — commits, discharges, and one gap

🔴 **THERE IS NO OPENSPEC CHANGE FOR `TIMING-BUILD-21` OR `TIMING-WIRE-22`, and that is a
gap rather than a decision.** `git grep` for either identifier under `openspec/` returns
ZERO hits. Both features landed as direct commits on `dev`, so their `tasks.md` — the place
CLAUDE.md's workflow puts the e2e run URLs "beside the ticked item, so the evidence outlives
the session that produced it" — does not exist. The evidence is therefore recorded HERE, in
the ADR that already owns the decision, and the next session that touches playout timing
should open a change and fold this in.

`openspec/changes/timing-setting-ownership/` covers only `TIMING-OWNERSHIP-19` (the
read-only decision), not the build or the wire.

### Step-level e2e discharge

🔴 **MOVED, 2026-09-15 (`TIMING-WIRE-22 · DELTA B · R4/B7`) — THE RUN URLs NOW LIVE IN
`openspec/changes/timing-pass-control/tasks.md`.** An ADR keeps the DECISIONS; a discharge
record belongs beside the work it discharges, where the next reader is already looking for
the tick. The two tables below are kept as they were WRITTEN rather than deleted — a record
that is edited to look tidier than it was is not a record — but they are **superseded**, and
`tasks.md` is the copy to read and to extend:

- it carries every commit of the whole arc, not only `BUILD-21` and `WIRE-22`;
- it resolves the `b8f5cdc2` row below, which reads "read at hand-over" with no URL: the run
  is [34962521234](https://github.com/yasermostafaee/cg/actions/runs/34962521234), `ci` and
  `e2e` both RAN green;
- it names, for each commit with no run of its own, the descendant whose whole-tree run
  covers it — a distinction these tables do not draw;
- and it keeps the `49216e18` skipped-`e2e` caveat attached to its row, so the
  non-discharge cannot be read as a discharge anywhere.

Every row below is a COMPLETED, `success` run whose `E2E (Playwright)` job actually RAN,
with the counts read rather than the conclusion trusted.

| Commit     | What                                | Run                                                                          | Designer      | Runtime     |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------- | ----------- |
| `a53b79ea` | BUILD-21 — the live-change contract | [34944866939](https://github.com/yasermostafaee/cg/actions/runs/34944866939) | 279 + 1 flaky | 224 passed  |
| `8d85bd0d` | BUILD-21 — doc-sync                 | [34945956177](https://github.com/yasermostafaee/cg/actions/runs/34945956177) | ran           | ran         |
| `d440cd7f` | WIRE-22 (a) + (b)                   | [34948110281](https://github.com/yasermostafaee/cg/actions/runs/34948110281) | 279 + 1 flaky | 224 passed  |
| `bc4222bb` | WIRE-22 (c) + (d) + (e)             | [34950915296](https://github.com/yasermostafaee/cg/actions/runs/34950915296) | 280 passed    | 224 passed  |
| `d3ddfcb5` | WIRE-22 §4 — the console section    | [34954955145](https://github.com/yasermostafaee/cg/actions/runs/34954955145) | 278 + 2 flaky | 224 passed  |
| `49216e18` | docs only                           | [34955455633](https://github.com/yasermostafaee/cg/actions/runs/34955455633) | **skipped**   | **skipped** |
| `a4ec9401` | the restore proof                   | [34956636122](https://github.com/yasermostafaee/cg/actions/runs/34956636122) | ran           | ran         |

⚠ `49216e18`'s `e2e` was SKIPPED because the diff was docs-only. That is correct CI
behaviour (`P-029`) and it **discharges nothing** — it is recorded so nobody later reads a
green run beside it as evidence about the suite.

⭐ **`d440cd7f` CONTAINS `a53b79ea` AND `8d85bd0d`** (verified with `git merge-base
--is-ancestor`), so its completed green run covers the whole tree at those commits too:
the `ci` and `e2e` jobs are whole-tree, not diff-scoped. `TIMING-BUILD-21`'s commits 3 and 4
are discharged by it as well as by their own runs.

**The two flaky specs, named and assessed** (`DELTA A8`):

- `live-source.spec.ts:511` — _MULTIPLE independent Live Sources each get their own id_
  (flaky on `d440cd7f` and `d3ddfcb5`). **Cannot pass vacuously**: it asserts
  `toHaveCount(2)` before comparing ids, so a page that rendered fewer sources fails rather
  than passing with nothing to compare. **Not the `P-047` class** — its own comment
  documents a knife-edge FIXTURE GEOMETRY (the plates' separation is `delta / zoom`, and the
  zoom depends on how wide the surrounding panels happen to render), not load contention.
- `video-import.spec.ts:291` — _a premultiplied-alpha source imports WITHOUT the black
  fringe_ (flaky on `d3ddfcb5`). **Cannot pass vacuously**: every failure path returns
  `{ ok: false, why }` and the test asserts `toMatchObject({ ok: true })` before reading any
  pixel, then checks positive thresholds on both the opaque and the half-alpha region.
  Closer to `P-047`'s CONTENTION family (a decode under a loaded gate) but a different spec
  and a different suite, so not that item.

### `DELTA A` — the follow-up commits

| Commit     | Item                                           | Run                                                                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `87cdbc04` | A1 — a restore never re-sends a relative count | [34960476329](https://github.com/yasermostafaee/cg/actions/runs/34960476329) — `e2e` ran, success |
| `53a26a20` | A2 — on air, state what was SENT               | [34960973690](https://github.com/yasermostafaee/cg/actions/runs/34960973690) — `e2e` ran, success |
| `b8f5cdc2` | A6 — an old import says why                    | read at hand-over                                                                                 |

### Related PRD items

- `R-063` (`docs/prd/runtime.md:3703`) — `[x]` RECORDED 2026-09-13. The DECLARED / APPLIED /
  UNCONFIRMED doctrine `B-248` belongs under.
- `C-003` (`docs/prd/caspar.md:71`) — `[ ]`, priority medium. On-air per-child timing
  override; `DELTA A5`'s per-scope question is its territory.
- `C-013` (`docs/prd/caspar.md:284`) and `C-017` (`docs/prd/caspar.md:641`) — both `[ ]`,
  both still reading `⟨priority: medium⟩`. ⚠ `DELTA A4` states the owner raised both on
  2026-09-09; **no such note exists in `caspar.md`** (`git grep 2026-09-09` there returns
  nothing), so the raise is not in the record and the files still say medium.
- `B-248` (`docs/prd/bugs-runtime.md:11920`) — `[ ]`, filed by `DELTA A7`: a timing set is in
  flight and the row says nothing.

## A template that finishes by itself takes its row off air — DECIDED 2026-09-15

This ADR is about WHO OWNS a timing setting. The owner's decision of 2026-09-15 is about what
happens when the setting has been honoured to the end, and it belongs here because it is the
same arc: a logo authored for two passes, an operator who set it to two passes, and the moment
those two passes are over.

**The decision, in the owner's words:** when a template's run is complete — a logo meant to
play only 2 times, a title that lasts a few seconds and closes — it should stop itself and no
longer be ON AIR.

What that settles:

- **The terminal verb is STOP**, `C-012`'s. The row leaves ON AIR and lands exactly where a
  manual STOP leaves it: the producer resident, and a later PLAY instant with no re-load.
- **`C-017`'s hard CLEAR is superseded.** That item proposed a hard clear on the ground that
  the outro had already played and the layer was visually empty. It is annotated with this
  date rather than rewritten, because what it got right is the TRANSPORT and that half stands:
  the served template pings its own origin. One transport serves both `C-013` and `C-017`.
- **It applies to every lifecycle that ends by itself** — a timed `auto-out`, a `loop-cycle`
  with a finite count including an operator's pre-take or on-air count and `0`, and a finite
  content-driven hold. **Never to `static`, `manual` or anything infinite.**
- **No timer, ever.** The bridge acts only on the page's signal. `C-013` is explicit —
  "nothing guesses at completion with a timer" — and `C-012` already refused to chase an
  outro with one.
- **A stale signal is ignored**: a wrong take token, or a row already stopped, re-taken or
  updated.
- **A lost signal leaves today's behaviour.** It fails safe, and is never a new way to blank a
  live layer.

⚠ **One thing this decision costs, stated because it is not obvious:** the served page's CSP
named no `connect-src`, so it fell back to `default-src 'none'` and the page could not open a
connection at all. `SECURITY.md` states that as a shipped property and says not to relax it
without strong justification. This decision is that justification, and the relaxation is the
narrowest one available — `connect-src 'self'`, same origin only — with the take token as the
real guard: a page that was given no token opens nothing, whatever the policy permits.

⚠ **And the line anchors in "Related PRD items" above have drifted.** `C-013` is at
`docs/prd/caspar.md:304` and `C-017` at `:661` as of this date, not `:284` / `:641`. Both items
do exist and both still read `⟨priority: medium⟩`, so that block's substantive claim holds —
only its coordinates are stale.

Built in `openspec/changes/template-signals-completion/`.

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
