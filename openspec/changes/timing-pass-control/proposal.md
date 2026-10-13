# Operator pass timing — the count, the gap, and who owns them

## Why

Four work items — `TIMING-BUILD-21`, `TIMING-WIRE-22`, and its deltas `A` and `B` —
changed behaviour **on the path to air** with no OpenSpec change behind them. A CLI
prompt is ephemeral; the spec is the memory. This is that memory, written after the
fact and saying so.

The product problem: a looping graphic could not be re-timed by the operator. A crawl
or a logo bug ran the count its designer authored, and the only ways to change it were
to re-author the template or to stop the row. The console had no surface for it, the
wire had no member for it, and the page had no applier for it.

The ownership problem, settled by
[ADR 0009](../../../docs/adrs/0009-timing-setting-ownership.md) and now golden rule 13:
a setting that can break the template's own contract belongs to whoever authored the
contract. `mode` and `holdSource` are **designer-owned** and read-only everywhere else;
the pass count and the gap between passes are **operator-owned, per session**.

⚠ **One PRD item → one OpenSpec change is the standing guardrail, and this change
knowingly overrides it.** `docs/prd/README.md` says not to batch unrelated items. These
four are not unrelated — one arc, one ADR, one feature reaching air — and ADR 0009 asks
for exactly this fold ("the next session that touches playout timing should open a change
and fold this in"). Recorded here so the override is deliberate rather than silent.

⚠ **This change is the SIBLING of `timing-setting-ownership`, not its revision.** That
change is complete, discharged and validates; it settled WHO OWNS WHICH SETTING and
declared the schema question out of scope with a STOP. The owner lifted that STOP, and
everything built after it is here.

## What Changes

**The schema gained a default and a field.**
`DEFAULT_REPEAT = 'infinite'`, `DEFAULT_DELAY_MS = 0`, a `delayMs` on `PlayoutSchema`,
and the readers `repeatOf` / `delayMsOf` / `templateTimingOf`.

🔴 **The absent-`repeat` behaviour CHANGED and it reaches air.** An absent `repeat` used
to resolve to `1` — a stored `loop-cycle` with no authored count played **once**. It now
resolves to `'infinite'`. That is a behaviour change on the path to air, and it makes two
living requirements in `designer-playout-lifecycle` factually false; both are corrected
under `## MODIFIED Requirements`.

**Two silent-drop sites were closed.** An exhaustive object literal in the runtime's
playout merge, and another in the bridge's assignment rebuild, each dropped every key the
literal did not name. Both now spread. A planted red proved each guard bites.

**The Designer authors the defaults.** `repeat` and `delayMs` gained an authoring home in
the composition inspector's Playout section, marked with the ADR's ownership split.

**The console gained a Timing section** (`apps/runtime/.../TimingSection.tsx`):
`mode` and `hold` as FACTS (a `Tag`, never a disabled input); the pass count and the gap
as CONTROLS, shown inheriting until the operator sets them.

**The count reaches air by five pieces**: a `__cg.timing` control member; the page's
`applyPassTiming` walking every looping scope; a `stack.set-pass-timing` IPC channel gated
by the ONE `#ownsLiveSeats` predicate; a restore that re-applies the stored value; and the
publisher fast-path.

**Delta A** corrected the arc after review: a restore no longer re-sends a relative count
(it would re-arm it); the on-air box shows no number, because no return path carries the
page's counter, and states what was SENT instead.

**Delta B** made it true and usable: a count set BEFORE the take now survives `play()`;
the console states the timing of the graphic that actually PLAYS (the ROOT, never a
dangling `entryCompositionId`); the section carries no explanatory prose; the controls are
house primitives; a timing edit is a DRAFT spent by `Update` / `Discard`; and `play(data)`
seats the timing it had been silently dropping.

## Impact

- **Capabilities (4 MODIFIED, 0 NEW):** `designer-playout-lifecycle`, `runtime-ui`,
  `runtime-caspar-bridge`, `runtime-template-library`.
- **Wire:** one new IPC channel (`stack.set-pass-timing`) and one new `__cg` member
  (`timing`). `CG UPDATE` remains the only mid-air JSON transport (ADR 0006).
- **Persisted:** `StackItemTimingOverride` on a stack row; `TemplateInfo.playout` in the
  bridge's template registry; a `timing` member and a `set-pass-timing` action on the
  audit record.
- 🔴 **THE OWNER MUST RE-IMPORT EVERY TEMPLATE.** A template's page and its metadata are
  baked at import, so every fix in this arc that lives in `@cg/template-runtime` or in the
  metadata derivation reaches only templates imported after it. This arc has now cost two
  such re-imports (`92711fcf`, `0f54e00d`). The tax itself is filed as `C-034`.
- **Lane: FULL**, per commit, throughout.
