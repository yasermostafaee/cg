# Session BR — the typecheck that never saw `tests/`

> **Safe to pull.** Everything below is on `dev`; see §0. `pnpm gate` is green uncached.
>
> **Letter:** `BR`. `BN`–`BQ` are used. **Unattended overnight session** — nothing here waited on
> a decision, and everything that needed one is named in §5 rather than guessed.

## 0. State

| Fact              | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Tip read at start | `607dfe73` (session BQ) — `HEAD == origin/dev`, tree clean            |
| **Pushed**        | `a7924255` — verified by `git ls-remote origin dev`, not an exit code |
| **Owed e2e**      | ✅ **DISCHARGED** — see §4                                            |
| Error count       | **113 — re-measured, not taken from BQ's report.** It matched.        |

## 1. 🔴 THE DELIVERABLE: the bucketed list

**113 errors. Bucket (b) is not empty — there are four, and they are the finding.**

| bucket                                   | count | what it was                                                  |
| ---------------------------------------- | ----- | ------------------------------------------------------------ |
| (a) noise, fixed                         | 109   | fixture / import / call shapes; **no assertion changed**     |
| (b) 🔴 not asserting what it looked like | **4** | named in §2 — all four are guards that were quietly narrower |
| (c) product defects found                | **0** | no `B-` filed; every (b) turned out to be a hole in a TEST   |
| deferred                                 | **0** | nothing left failing, no `as any`, no `@ts-expect-error`     |

## 2. 🔴 Bucket (b) — the four, each with what it should have been asserting

### 2.1 `layerRow.dom.test.ts` — "THE SHAPE NEVER CHANGES" never made the claim about a row with live plates

The test's own title states the property the owner asked for after watching NEXT appear and
vanish: the row's control set is fixed, only `disabled` moves. It pinned a 7-key `SHAPE` across
four row states × next × linkDown.

Its `deps()` builder **omitted four required members** of `LayerRowActionDeps` —
`restoreBlocked`, `hasLivePlates`, `swapSource`, `plateAudio`. `hasLivePlates` was therefore
`undefined` (falsy) in every case it built, so **`swap-source` and `plate-audio` were
structurally absent from every action list this file has ever produced.** The universal claim was
verified only for rows with no live plates — the rows this whole feature is _not_ about.

**Made real:** the matrix now runs `hasLivePlates` both ways and pins both shapes (7 keys, and
9 with `SOURCE`/`AUDIO` in their real positions before `NEXT`).
**Does it go red against the pre-fix behaviour?** The case did not exist before, so there was
nothing to fail — the honest demonstration is a product mutation: disabling the `hasLivePlates`
gate in `layerRowActions` reddens the new dimension (`expected [ 'load-remove', 'play', …(5) ] to
deeply equal [ …(7) ]`), and the product is byte-identical afterwards.

### 2.2 `support/layerRow.ts` — the row harness could not render a rehearsing row at all

`rehearsing` is a **required** `LayerRow` prop and the harness never passed it. Every spec built
through it has rendered with `rehearsing: undefined`. **The DOM-level rehearsing appearance is
unreachable from this harness, so no spec using it has ever asserted anything about a row on
PVW.** (R-022's rehearse _behaviour_ is covered — but through `layerRowActions`, the pure
function, not the render.)

**Made reachable**, defaulting to `false`, which is exactly what those specs were already getting.
⚠ **Nothing uses it yet, and that is deliberate.** Naming the visual a rehearsing row _should_
have is a judgement, and §4 forbids guessing one at 3 a.m. **Named as a gap for a future session
rather than invented.**

### 2.3 `layersPanel.restoreSkips.dom.test.ts` — the render call was three APIs out of date

It passed `selectedItemId` (the prop is `selectedId`), `layout: 'wide'` where a `ShellLayout`
**object** goes, and no `inspectorOpen` / `onToggleInspector` at all. React drops unknown props
and leaves missing ones `undefined`, so this spec has been mounting the panel **with a string for
its layout**.

Its assertion — the restore-skips notice, its count, its ids, its per-reason actions — is
**unchanged and still holds**, because that notice depends on none of them. What changed is that
the spec now mounts the component the product mounts.

### 2.4 `mock-bridge-parity.test.ts` — the guard was blind to two whole groups

The one test that exists to prove the mock shim matches the real bridge was missing **`delimiters`
AND `sources`** from its expected tree, so it had never compared either. Both are implemented by
the mock (`createRuntimeBridge`), so this is a hole in the **guard**, not a missing capability —
but the guard could not have told anyone that, which is precisely the point. Adding both groups
keeps it green, which is the evidence that the mock had them all along.

## 3. Why bucket (a) is 109 and still worth reading

Grouped, because the shapes repeat: `createElement(X, props, 'Text')` where `children` is a
required prop (14 sites, runtime-identical); fixtures naming fields that do not exist (`visible`
on a bank — the real one is `visibility`, a record whose absence means visible, **and every array
listed exactly the bank's whole span, checked against `count` before removing**; `background` on
`Scene`, removed by P-031; `frameRate` on a composition, made project-level by D-026);
`defaultPosition: { dx, dy }` — the **query** serialisation rather than `{ offset: { x, y } }`,
inert in these two specs because neither places anything, but the same literal that would silently
make `position.offset.x` undefined in a geometry spec; three type-only imports naming a member the
module does not export, so everything they annotated went unchecked; dead duplicate object keys
(one `link` stub had two copies with **different** values); `liveLayerBlindness` called with three
of four arguments — all three short-circuit before the missing one, so inert; missing required
fixture fields; regex capture groups under `noUncheckedIndexedAccess`, stated with `as string`
(the repo's own precedent, and not `as any`).

## 4. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; format clean; openspec 58/58).
- `@cg/runtime` — **95 files / 882 tests, identical to before the session.** No assertion was
  weakened, nothing was skipped, nothing was excluded.
- **Three commits, each green on its own**, and the config flip is LAST so it can be reverted
  alone: `ece914b8` (the four findings) · `525dadda` (the noise) · `a7924255` (the tsconfig).
  The order is deliberate — the fixes are inert without the flag and the flag is red without the
  fixes, so flag-last is the only sequence in which every commit passes.
- **A Linux `gate:e2e` WAS owed** — checked rather than assumed, by running the repo's own
  classifier over this diff: `{ kind: 'code', needsE2e: true }`.
- ✅ **DISCHARGED.** <https://github.com/yasermostafaee/cg/actions/runs/32546263568> — head
  `a7924255`, the tip carrying every change of the session, `completed` + `success`, and the
  **`E2E (Playwright)` job RAN** (2026-08-22 02:26:57Z → 02:36:02Z), not skipped.

## 5. ⚠ What a future session should pick up

1. **The rehearsing row has no DOM-level assertion** (§2.2). The harness can now reach the state;
   what it should _look_ like is the owner's call.
2. **`page.evaluate` fixtures are still untyped.** Typechecking `tests/` does **not** reach an
   object handed across into the browser — those arguments are `unknown` by construction. An E2E
   spec can still pass a malformed template literal (a `dx`/`dy` position, say) and nothing will
   say so. Stated as a limit of this session's win, not a residual defect.
3. **No other workspace typechecks its tests.** `caspar-bridge` explicitly EXCLUDES `tests/**/*`;
   every package includes `src/**/*` only. This session changed ONE workspace. Whether that
   becomes a repo-wide policy is a decision, and it was not made here.

## 6. Flags for the owner

⚠ **`apps/runtime/tsconfig.json` MOVED — shared config, inherited on pull.** `build` is
`vite build` and does not read this `include`, so only `typecheck` and the IDE change. No product
source was touched by this session at all.

## 7. Out of scope — named untouched

Anything in `apps/designer` · the plant measurements (`B-155`'s residual, 7.15's frame count, the
2× discriminator, §C's probes) · 7.16b · AW's banner · §5.5's Persian/RTL case ·
`template-http-server.ts` (`never-stage`, read only) · any change to on-air behaviour.
