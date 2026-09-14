# timing-setting-ownership — who owns which timing setting

Records and applies the ownership decision in
[ADR 0009](../../../docs/adrs/0009-timing-setting-ownership.md).

## Why

Playout timing was treated as one bucket: whatever the preview modal could tune, it tuned. It is
two kinds of setting wearing the same units.

**A setting that can break the template's own contract belongs to whoever authored the contract.**

`hold = content-driven` means "stay until the content finishes". An operator who changes it pulls
the background out from under a headline sequence that is still running — the template keeps its
promise and the operator breaks it without knowing they did.

The Designer's preview offered `mode` and `holdSource` as session controls, side by side with the
crawl and rotator knobs, with nothing on the surface saying the two kinds differ. Its footer
sentence explained what happens to the STORED value, which is a different question from what
happens to the template's promise.

## What changes

- **`mode` and `holdSource` are designer-owned.** Authored in the composition inspector
  (`PlayoutSection`), read-only everywhere else.
- **The Designer's preview states them as FACTS.** Two `Tag` facts replace two selects. The preview
  still shows them — an operator-designer needs to see what the template will do.
- **The override CHANNEL is removed, not just the control.** `mode` and `holdSource` are gone from
  the preview's `TimingOverride` type, so there is no control to disable and no route by which a
  value could reach the runtime. `effectiveMode` takes the source alone.
- **A nested scope's timing relevance now reads the stored mode**, which is the same rule stated
  once the override cannot exist.
- **CG Control is unchanged because it has no timing surface today** — verified: `apps/runtime/src`
  contains no reference to `holdSource`, `playoutOf`, `PlayoutMode`, `HoldSource`, `loop-cycle` or
  `auto-out` (positive control: 46 files match `useState`, so the pathspec is live). The rule is
  recorded so the console's timing section is built read-only the first time.

## What does NOT change

- Every operator-owned control: crawl passes, crawl cycle seam, rotator passes, rotator item dwell,
  the per-scope `holdMs` and `repeat`, and the countdown preview duration. All still session-only.
- The preview footer sentence, which stays true.
- `@cg/template-runtime`'s `PlayoutOverride`, which keeps `mode` and `holdSource`: the runtime is a
  general render engine and those are legitimate engine options. The ownership rule is a product
  decision, enforced at the Designer's preview seam.
- No schema, no wire/AMCP, no IPC channel, no persisted key, no refusal condition.

## Out of scope — the between-passes delay (schema STOP)

A delay between repeats of a looped template was specified alongside this decision and is **not
built**: it has no stored home, so a designer-authored default would add a field to `PlayoutSchema`
in `@cg/shared-schema`. ADR 0009 records the decisions it inherits — designer default plus operator
per-row override, shown inherited as `Default (2 s)`; between passes only, never before the first
showing; no disturbance to a running pass; zero legal; a rejected value refused with a reason, never
silently clamped.

A further cost was measured while establishing this: `effectivePlayoutFor`
(`packages/template-runtime/src/runtime.ts:665`) rebuilds the effective playout as a FOUR-KEY object
literal, so a new OPTIONAL `Playout` field would be dropped there **silently, on the path to air**,
with no compiler error. Any future delay work must fix that site first.
