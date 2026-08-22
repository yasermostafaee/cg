# Session BS — caspar-bridge typechecks its tests, and the guards get audited

> **Safe to pull.** Everything below is on `dev`; see §0. `pnpm gate` is green uncached.
>
> **Letter:** `BS`. `BN`–`BR` are used. **Unattended session** — nothing here waited on a
> decision; the one §4 decision was pre-made by the owner and followed to the letter.

## 0. State

| Fact              | Value                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tip read at start | `72457b1a` (session BR) — `HEAD == origin/dev`                                                                                                                 |
| Tree at start     | ONE modified file: `template-http-server.ts` — the standing never-stage LAN-host pin, named in the brief's own §7. Not treated as "dirty, stop"; never staged. |
| **Pushed**        | `85e3c27e` — verified by `git ls-remote origin dev`, not an exit code                                                                                          |
| **Owed e2e**      | ✅ **DISCHARGED** — see §6                                                                                                                                     |
| Error count       | **56**, measured by running the new typecheck config before any fix                                                                                            |

## 1. §0.3 — why the exclusion existed, and why it STAYS (in the build config)

The order was: find out why `caspar-bridge` excludes its tests before flipping. Answer:
the exclusion arrived with the package's FIRST commit (`0e8c93fd`, C-001 Phase 1),
unchanged since, **no comment, no stated reason anywhere** — but it has a real structural
one, discoverable from the config itself: unlike `apps/runtime` (build = `vite build`,
tsconfig read only by typecheck), this package's **`build` IS `tsc -b` on this same
tsconfig**, with `rootDir ./src` / `outDir ./dist`. Including `tests/` there is a hard
rootDir error and would ship tests into `dist` (which `files:` publishes).

So the decision was neither respected-as-stated (there was no statement) nor overturned:
the exclusion is **load-bearing for the build and kept there, now with a comment saying
so**, and the typecheck gets its own view — `tsconfig.typecheck.json` extends the build
config (`noEmit`, `rootDir .`, src + tests + vitest.config.ts), and `pnpm typecheck`
points at it. Same BR pattern, at the only seam a tsc-built package allows.

## 2. 🔴 THE DELIVERABLE: the bucket table

**56 errors. Bucket (b) is EMPTY, and that emptiness is a measured result, not a wave.**

| bucket                                   | count  | what it was                                                                                    |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| (a) noise, fixed                         | **56** | fixture / import / literal shapes; **no assertion changed**                                    |
| (b) 🔴 not asserting what it looked like | **0**  | see the two near-misses below, and why each is honestly (a)                                    |
| (c) product defects found                | **0**  | no `B-` filed; no product source changed (one transient mutation, restored byte-identical, §5) |
| deferred                                 | **0**  | nothing left failing, no `as any`, no `@ts-expect-error`                                       |

**Why bucket (b) is credibly zero.** The structural evidence: nine files imported
`RetainedStackItem` / `StackItemStatus` from `@cg/shared-ipc`, which does not export them
— so every annotation using those names was UNCHECKED, and anything could have been
hiding behind them. Correcting the import to `@cg/shared-schema` surfaced **zero new
errors**: the retained-item fixtures every restart/restore/occupancy suite feeds the
bridge were the real wire shape all along. The on-air claims those suites carry
(B-109/B-107's no-resurrection, B-092's blind tap, C-012's stop-restore, B-086's honest
link-loss) rest where they did before — nothing retracted.

**The two near-misses, called out so the next reader can re-judge them:**

- **`strategy: 'single'` (5 files, incl. `route-coverage` and `reachability-predicate`)**
  — a value that has NEVER existed in `ConnectionConfigSchema` (a single-server station
  omits `B`; the strategy stays one of the three). The `RedundancyAdapter` branches on
  `'mirror-async'` / `'journal-replay'` only, so `'single'` fell through to exactly the
  `'mirror-sync'` path with no backup declared — runtime-identical, nothing asserted on
  it. Bucket (a), swapped to `'mirror-sync'` — **but the old fixtures built a config the
  real wire's zod parse would REFUSE**, which is the cleared-row file's own warning about
  proving the bridge handles input the browser never sends.
- **`live-look-bindings`' `plan()`** — five TS2783s claiming its defaults were
  overwritten dead. They were not (spread order is defaults-then-override); the errors
  came from a `Params | Record<string, unknown>` union plus an `as` cast that had been
  laundering every call site. Retyped as `Partial<Params>`, cast deleted: compiles clean,
  so every call site was well-formed. Session BM's seat-count arithmetic stands.

The rest, grouped: required fixture fields omitted and runtime-inert for what each test
asserts (`dynamic: false` on static plates; `intendedVolume: 0` on ledger records nothing
reads, sibling-file convention; `server: 'primary'` on a restore slot the runtime
re-stamps at every `assignSlot`); excess props the types dropped (`templateType` on
`setFixedLayers`, `server` on a `LayerSlot`); `exactOptionalPropertyTypes` on
`buildRoutes` options; format literals widening inside `.map`; `GRID[...]` under
`noUncheckedIndexedAccess` stated `as LiveSourceRect` (the file's own line-160 precedent);
text-field fixtures missing `required`/`default` (inert — `load` passes explicit values);
an `as const` TEMPLATE where `TemplateInfo` wants a mutable array; `route-coverage`'s
type predicates now filtering over `unknown[]`.

## 3. ⭐ §3 — the guard audit, every one named

| guard                                                                             | both halves derived?                                                                                                                                                                                                                                                                                                            | mutation-check                                                                                                                                                                                                    | verdict                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `route-coverage.test.ts` (B-074, 4 tests)                                         | **YES** — channels from `runtimeRequestChannelNames` (a real filter over the module's exports, shared with the run-time B-153 skew check — ONE derivation, two callers), routes from `buildRoutes()` itself. The one hand-list (`DESIGNER_ONLY_NAMESPACES`) is the object under test of guard #4, which checks it stays honest. | **RED as required** — deleting the `stack.set-position` route from `bridge.ts` fails guard #1 naming exactly that channel (`expected [ 'stack.set-position' ] to deeply equal []`). Restored byte-identical (§5). | **SOUND**                                                                                |
| `audit-append-sites.integration.test.ts` (B-141, "every playout verb")            | **WAS NOT** — the seven-verb list was hand-written with no cross-check; a 16th `AuditEntrySchema` action would have escaped the "every" in silence. **Mechanically repaired**: driven list + a NAMED non-verb exclusion list must now equal `AuditEntrySchema.shape.action.options` exactly (commit `999bc615`, +1 test).       | **RED as required** — deleting `'next'` from the driven list fails the new partition test naming it. Restored.                                                                                                    | **REPAIRED**                                                                             |
| `escaping.integration.test.ts` ("the full B-041 matrix")                          | Not derivable — the matrix IS the canonical fixture (mirrors the hardware sweep's payload); there is no independent list of "special characters" to derive from. The assertion is a byte-exact round-trip, so a mis-escape breaks equality by construction.                                                                     | n/a (self-validating equality)                                                                                                                                                                                    | **HONEST AS A FIXTURE** — title's "full" means "the B-041 payload", and the file says so |
| `command-builder.test.ts` (producer forms; "every user-supplied value is quoted") | The per-form completeness is enforced by the COMPILER, not the test: `producerArgument` is an exhaustive no-default switch with a declared `: string` return, so a new `SourceProducer.kind` fails compilation before any test runs.                                                                                            | n/a (compile-time)                                                                                                                                                                                                | **SOUND BY CONSTRUCTION**                                                                |

Candidates examined and found to be behavior tests, not completeness guards (no
list-vs-source-of-truth comparison to audit): `declared-layer-classes` ("all three
classes" is the domain's fixed partition, each driven), `clear-all-broadcast-safety`,
`orphan-layers`, `cleared-row-verbs`, the wire-contract files. There is no
mock-vs-bridge parity guard in this package — the runtime app owns that one (BR §2.4).

## 4. §4 — the rehearsing row: ASSERTED, not invented

What the DOM actually renders in the now-reachable state is real and coherent: the row's
state cell (`rowState`'s R-022 branch) shows the **MonitorPlay icon** in
**`colors.rehearsing`** with **aria-label `status ON PVW`** and **`data-row-state="idle"`**
— the same WORD as the verb, the same violet as the Inspector badge and `--r-rehearsing`.
Per the owner's pre-made decision it is now pinned exactly as shipped:
`apps/runtime/tests/layerRow.rehearsing.dom.test.ts` (commit `39bf5d1e`, +3 tests) —

1. off-air + rehearsing → `status ON PVW`, colour equal to **the token** (`colors.rehearsing`
   via a jsdom normalization round-trip — no hex appears in the test), tone `idle`;
2. the same row NOT rehearsing shows none of that (the pair is its own mutation check —
   one DOM query, opposite outcomes on the one prop);
3. the shipped PRIORITY: an `on-air` item outranks the rehearse claim — `status ON AIR`,
   `data-row-state="onair"`, never the rehearse hue.

## 5. ⚠ One transient product mutation, disclosed

§3's route-coverage mutation check required deleting one route from
`tools/caspar-bridge/src/bridge.ts` — on-air source. It existed only in the working tree
for one targeted test run, was restored byte-identical, and `git diff` on `src/` confirmed
only the never-stage file remained. **No product source change was committed** in this
session; the four commits touch tests and config only.

## 6. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; format clean; openspec 58/58).
- **Counts, before → after:** `@cg/caspar-bridge` 603 → **604** (+1: the B-141 partition
  guard) · `@cg/runtime` 882 → **885** (+3: the rehearsing DOM specs) · `@cg/designer`
  1266, untouched. Nothing deleted, skipped, or weakened; the caspar-bridge suite also ran
  green standalone before any commit.
- **Four commits, each green on its own, config flip LAST** so it reverts alone:
  `ab5149d9` (noise) · `999bc615` (B-141 guard) · `39bf5d1e` (§4) · `85e3c27e` (the flip
  - turbo inputs). The fixes are inert without the flag and the flag is red without the
    fixes.
- **A Linux `gate:e2e` WAS owed** — checked with the repo's own classifier over this
  diff, not assumed: `{ kind: 'code', needsE2e: true }` (turbo.json and the runtime test
  are outside the known-non-render set).
- ✅ **DISCHARGED.** <https://github.com/yasermostafaee/cg/actions/runs/32568507357> —
  head `85e3c27e` (the tip carrying every change), `completed` + `success`, and the
  **`E2E (Playwright)` job RAN** (2026-08-22 10:46:52Z → 10:55:10Z), not skipped.

## 7. Flags for the owner

1. ⚠ **SHARED CONFIG MOVED — `turbo.json` and a tsconfig; the next session inherits both
   on pull.** `tools/caspar-bridge/package.json` (typecheck script), the new
   `tools/caspar-bridge/tsconfig.typecheck.json`, a comment in its `tsconfig.json`, and
   `turbo.json`.
2. 🔴 **The turbo `typecheck` task's inputs did not hash `tests/**`— BR's runtime flip
had the same latent hole.** A cached`turbo run typecheck` would not have been
invalidated by a test-only edit: a stale green of exactly the class the bounded-turbo
notes warn about. Latent today (`gate`forces uncached; CI runners start cold), closed
in`85e3c27e`for both workspaces — inputs now include`tests/**`,
`tsconfig.typecheck.json`and the vite/vitest configs;`lint`inputs gained`tests/**`for the identical reason (eslint lints`tests/`). Noted, not fixed: `lint`inputs
still don't hash`bin/\*\*`, which caspar-bridge lints — the same class, one notch
   further out.
3. **No hardware run is owed by this session** — nothing here touches the wire's
   behavior; the standing plant measurements (§8) remain the only hardware debt.

## 8. What a future session should pick up

1. **Whether the remaining workspaces follow.** `@cg/designer` and every package still
   typecheck `src/**` only. Two patterns now exist to copy from (vite-built:
   `apps/runtime`; tsc-built: `tools/caspar-bridge`). Repo-wide policy is a decision,
   and it was again not made here.
2. **`page.evaluate` fixtures stay untyped** (BR §5.2, unchanged).
3. The audit partition's `NON_VERB_ACTIONS` is a named exclusion list — by design it
   turns a new schema action into a visible decision at the guard. If `clear-all` or
   `rehearse` ever become audit actions, that test is where the decision will surface.

## 9. Out of scope — named untouched

`apps/designer` and every other workspace's tsconfig · the plant measurements
(`B-155`'s residual, 7.15's frame count, the 2× discriminator, §C's probes) · 7.16b ·
AW's banner · §5.5's Persian/RTL case · `template-http-server.ts` (never-stage, read
only — still carrying its LAN-host pin, still unstaged) · any change to on-air behaviour.
