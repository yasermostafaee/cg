# Session BQ — PVW named the wrong source, and `B-151` was right about why

> **Safe to pull.** Everything below is on `dev`; see §0 for the pushed SHA. `pnpm gate` is green
> uncached.
>
> **Letter:** `BQ`. `BN`, `BO`, `BP` are used.

## 0. State

| Fact              | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Tip read at start | `8fd8eeb1` — `HEAD == origin/dev`, tree clean                            |
| **Pushed**        | `669f392d` — verified by `git ls-remote origin dev`, not by an exit code |
| **Owed e2e**      | ✅ **DISCHARGED** — see §6                                               |
| Filed             | **`B-157`** (fixed), in its own dated registry section with its sweep    |

## 1. The report, and the one-sentence rule that settles it

A row ON PVW, PVW LOOK = `look-1`, that look's plate bound to **studio 3** and applied — and the
placeholder still reading **"studio 1"**, the template default. It defeats `R-049`'s stated purpose
(_"show the ASSIGNED SOURCE'S NAME… The Runtime knows the join"_) by drawing the wrong join.

> **The PVW overlay names exactly what a TAKE of THIS row, in THIS look, would put on air.**

That covers all four levels plus session BP's frozen snapshot, with no table of special cases.

## 2. 🔴 The cause was a type signature, and the shape is what changed

```ts
sourceNameOf: (plateId: string) => string | null,   // keyed by PLATE ALONE
activeLookId: string | undefined,                   // in the SAME argument list, used only for rects
```

A plate-keyed map makes a per-look binding **unrepresentable** — one plate in two looks has one slot
for an answer. The caller built it from `appliedPlateSources`, which is **level 2 only**, so the
per-look composition AND `R-048`'s emergency patch were both invisible to the preview.

⚠ **`B-151` again, one field over.** That was this same overlay never learning looks exist — about
RECTS. BL's handoff closed by warning that _"one surface learning a state and its neighbour not is
a recurring shape in this feature, not a one-off."_ Second instance, same component, same operator,
a week apart. Cross-referenced in both directions in `bugs-runtime.md`.

## 3. Fixed the way BL fixed the first one — by moving the resolver

`effectiveOverridesForLook` moved out of the bridge into **`@cg/shared-ipc`**, beside `activeLookOf`
/ `lookPlateRects`, joined by `assignmentInForce` (level 2, honouring BP's freeze) and
`resolvePlateSourcesForLook` (the whole four-level answer for one look). **The bridge delegates** —
`resolveLookBindings` no longer composes the levels itself.

**Two choices worth keeping:**

1. **The overlay takes the INPUTS, not a resolved map.** Handing it a look-resolved name map would
   have fixed the bug and left the shape intact — the next caller could still pass a look-blind
   one. `platePlacements` now calls the shared resolver **with the look it already holds**, so no
   call site is in a position to drop the dimension. Symptom and shape were different changes here.
2. **The id→name join stays with the caller.** The shared function answers in catalog IDs, because
   only a surface knows what a missing entry means: unassigned on a preview, a refusal at the
   bridge. Folding it in would force one of the two to be wrong.

## 4. What is asserted, and what was red before

- 🔴 **The reported case.** Mutation-checked by reverting the resolver to level-2-only naming: it
  reddens with **`expected 'Studio 1' to be 'Studio 3'`** — the owner's screenshot, as an assertion.
  Three others redden with it.
- **One plate, two looks, two names** — the assertion the old signature could not express at all.
- **The `R-048` emergency wins in every look**; **blank falls through** to the default; a dangling
  catalog entry reads as unassigned; **BP's frozen level 2** is what gets named.
- ⭐ **Parity pinned AT THE SHARED FUNCTION** (`live-look-bindings.test.ts`): the bridge's per-look
  answer equals the shared resolver's over five input shapes. Near-tautological today,
  deliberately — the failure mode is somebody re-inlining the composition, which would compile and
  pass everything else. **Mutation-checked against a re-inline with the precedence backwards**, and
  it reddens.
- **E2E** `e2e/pvw-look-source-name.spec.ts`, 2/2: the operator's real path (Inspector → UPDATE →
  published item → overlay), and the name following a PVW look switch.

## 5. ⚠ A gap found on the way — filed, not fixed

**`apps/runtime/tsconfig.json` includes the src glob only, so the runtime's `typecheck` never sees
`tests/`.** A fixture kept the field this change REMOVED and omitted the one it ADDED, and nothing
caught it — vitest transpiles without checking, and the suite passed. Measured what turning it on
costs: **113 pre-existing errors**, mostly in E2E specs. That is its own piece of work and is not
smuggled in here. Recorded in `B-157` and in the fixture itself.

## 6. Verification

- `pnpm gate` — green, **uncached** (`0 cached, 89 total`; openspec 58/58).
- `@cg/runtime` 95 files / 882 tests · `@cg/caspar-bridge` 78 files / 598 tests — full suites.
- E2E 2/2 locally.
- ✅ **The Linux `gate:e2e` — DISCHARGED.**
  <https://github.com/yasermostafaee/cg/actions/runs/32540851167> — head `669f392d`, the tip
  carrying every change of the session, `completed` + `success`, and the **`E2E (Playwright)` job
  RAN** (00:36:03Z → 00:45:26Z), not skipped. Written beside `tasks.md` 7.23 as well, so the
  evidence outlives this file.

## 7. Flags for the owner

1. **Product source, and a shared package.** `@cg/shared-ipc` gained three exported functions and
   the bridge now delegates to them — every workspace that depends on it rebuilds.
2. **The Linux `gate:e2e` for this tip is DISCHARGED** — §6 carries the run URL.
3. No `CLAUDE.md`, `turbo.json`, root `package.json` or gate-hook change.

## 8. Out of scope — named untouched

`B-155`'s plant residual and 7.15's frame count · 7.16b (where the assignment editor lives) · the
unexplained 2× · AW's banner · §5.5's Persian/RTL case on the masked label · the confidence-grab
recon · `template-http-server.ts` (`never-stage`, read only).
