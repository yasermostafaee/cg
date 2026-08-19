# Session AT — `B-145` finished honestly, Stage B (exclusivity) landed, and the "stale repo model" claims found FALSE

**Read at `a5486a9813e2cecb464feabf972e41d2e7f7582a`, pulled 2026-08-19** (`git pull --ff-only` →
"Already up to date"; `HEAD == origin/dev`). **It matched the expected tip `a5486a98`.**
`docs/handoff/2026-08-19-session-at.md` was free, so this is `session-at`.

⚠ **The owner's uncommitted `tools/caspar-bridge/src/template-http-server.ts` was not touched, not
staged and not committed.** Every commit staged explicit file paths, and `git diff --cached --stat`
was read before each.

**Two commits, not three.** Items 1 and 2 are product code and each ran a green uncached gate
(`89 successful, 89 total` / `0 cached, 89 total`). **Item 3 produced no commit, because both of its
premises turned out to be false** — see §3.

---

## 1. `B-145` finished — persistence is ON by default, and the tests can now tell

Session AS flagged its own defect: _"`liveLayersPath` is opt-in — a station that never configures it
still loses the ledger, and the tests pass either way."_ Both halves are closed.

### Where the default lives, and why NOT in `createBridge`

The station default is `~/.cg-runtime/bridge-live-layers.json`, resolved by `resolveLiveLayersPath`
and applied by `bin/caspar-bridge.mjs` — the same convention and the same layer as every sibling
store (connection, fixed bank, reserved layers, templates, source catalog, assignments, audit log).

🔴 **The repo had already ruled on this exact question, and the ruling is a test:**
`tools/caspar-bridge/tests/default-bank-boot.integration.test.ts:164` (verified — the comment is on
that line) says _"`createBridge({})` is not a station. The default applies to a CONFIGURED location
that holds no file, which is what every real install has."_ There is a second, concrete reason
beyond precedent: **~40 tests construct a bridge with no paths at all**, so defaulting inside
`createBridge` would have every one of them READ the developer's real station ledger — and any test
that seats or releases a live layer WRITE it, clobbering a running station's file from a unit test.

⚠ **What the first cut actually got wrong was not the layer — it was that the default did not exist
at all, and that its absence was untestable** because it would have lived in an inline `path.join`
inside a `.mjs` script no test could reach. Hence one exported function, held to its answer.

### OFF is explicit

`--no-live-layers`. Absence of a flag can no longer mean "unprotected". A `--live-layers-path` with
no value is a hard boot error naming the opt-out, on the `--reserved-layers` precedent.

### The regression guard — VERIFIED BY FLIPPING, with a rebuild between the runs

`tools/caspar-bridge/tests/live-layers-default.test.ts`. Three unit tests on the resolver, and
**three that SPAWN THE REAL CLI** with `HOME`/`USERPROFILE` pointed at a temp directory — because the
unit tests cannot see the one line that carries the resolver's answer into `createBridge`, and
deleting that line would leave them all green while the station lost its ledger again.

🔴 **Flipping `resolveLiveLayersPath`'s final line to `return null`, REBUILDING `dist/`, and
re-running reddens FOUR tests; flipped back and rebuilt, 8/8 green.** The rebuild is load-bearing and
was confirmed by grepping `dist/live-layers-store.js` in **both** states — `tsc -b` reported TS6133
on the flip (`homeDir` unused) but still EMITTED, so the red is evidence against the flipped
artifact and not against a stale one.

A boot line now says which of four states the station is in (`adopted N from <path>` / `nothing to
adopt … persisting from now on` / `UNUSABLE FILE at …` / `NOT PERSISTED (--no-live-layers)`), on the
`describeFixedBank` precedent: a bridge that adopted nothing and a bridge that is not persisting at
all otherwise look identical from every screen.

### 🔴 1.4 — the read path traced: CONTROLLABLE, but INVISIBLE

**The control half holds with NO further work.** `B-092` has the browser re-deliver the stack intent
on every connect, so the row and its `itemId` survive the restart; the ledger is keyed by `itemId`
(`tools/caspar-bridge/src/live-layers.ts:107`); and every teardown/repoint door reads it by that key
— `teardownLiveLayers` (`tools/caspar-bridge/src/caspar-runtime.ts:3802`) and the swap paths at
`:3461` / `:3639`. So the row's existing verbs DO reach an adopted record.

**The display half does NOT.** `B-145` acceptance 1 says the layers _"appear in the layer list"_, and
nothing shows them as layers:

- `CasparRuntime.liveLayers()` (`caspar-runtime.ts:3849`) has **no production caller** — its own
  comment says _"for tests and for phase 6's re-emission"_ — and **no `@cg/shared-ipc` channel
  carries the ledger**, so it never crosses the wire.
- The only panel that lists station layers is the PLAYOUT tab, and `playoutLayersState()`
  (`caspar-runtime.ts:4064`) enumerates **`#reservedLayers` only**. The Live Source band is
  deliberately kept OUT of that set (`live-layers.ts:20-26` — reserving it would make those layers
  unplaceable, unreservable and unclearable), so it can never appear there; and
  `stationLayerOccupancy` would refuse the clear anyway, offering one only for producer kind exactly
  `html` while a plate is a `route`.
- The Inspector's plate rows read `currentSourceAssignments()`
  (`apps/runtime/src/renderer/features/inspector/livePlates.ts:23`) — the ASSIGNMENT config, i.e.
  what a plate _should_ use, never what is seated.

**Written down, not fixed** (as instructed): `tasks.md` **2.8** and a section in `B-145`. It needs a
channel and a panel decision, so it is not a patch to stage A.

---

## 2. Stage B — §12.6's exclusivity refusal

**ONE predicate**, `#refuseSecondMultiBox` over `#multiBoxItemOnAirOnChannel`, in
`tools/caspar-bridge/src/caspar-runtime.ts`. Each of its three terms is answered by the thing that
already owns it rather than re-spelled:

| Term               | Answered by                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| **"on air"**       | `isOnAirStatus` (`caspar-runtime.ts:310`) — extracted for exactly this class of gate |
| **"this channel"** | `#slots`, the single source of where an item's template lives                        |
| **"multi-box"**    | `#multiBoxCount` — the carrier's declaration length, `> 1`                           |

⚠ **It is NOT `hasLivePlates`.** `layerRowActions.ts:655` (anchor verified — line 655 is
`...(deps.hasLivePlates`) is a RENDERER fact about one row DECLARING plates; this is a BRIDGE fact
about the on-air SET.

**Two doors, both calling it.** Door 1 is `#takeImpl`, immediately BEFORE `#planLiveSeating` — where
a refusal still costs nothing, and separate from it because the plan resolves THIS item's plates
while exclusivity asks about the on-air SET. Door 2 is `restore()`, gated on `isRetainedOnAir`.

🔴 **One design detail that would silently have killed door 2:** `templateId` is a PARAMETER of the
predicate rather than a reconciler lookup, because the restore door asks the question BEFORE the item
exists in the reconciler. A lookup would answer `undefined` there and let every restore through — the
refusal present, wired, and dead on the door with no other cover.

**The refusal, verbatim:**

```
exactly one multi-box template may be on air per channel: "three-box" (3 boxes, item "item-1") is already on air on channel 1 — take it off air first
```

`stack.take` answers `multibox-already-on-air` + that message. `restore` answers a new `RestoreSkip`
reason carrying the **same sentence** in a new optional `detail` — the shape `stack.take`'s `message`
already established, with the same "the specific one wins" rule, now enforced INSIDE
`restoreSkipReason` so no consumer can forget it.

**`unknown` carrier counts as 0 boxes** — the same call `#planLiveSeating` already makes, for the
reason in its header: such a template seats no plates at all, and refusing it would take a station's
whole pre-carrier rundown off air on upgrade.

**Tests** (`multibox-exclusivity.integration.test.ts`, 7): one per door, three boundaries (a
single-box template is not refused; an item is never its own incumbent; a `loaded` row still
restores), a proof the refused restore mutates nothing, and one asserting both doors give the SAME
sentence. 🔴 **Each door was mutation-tested independently** — disabling the restore door alone
reddens 3, the take door alone reddens 2, and neither reddens the other's test. Vitest transpiles
from source per run, so no stale artifact sat between the runs.

**`MockRuntime` was checked and deliberately left alone**: it runs no restore at all, so there is no
second site to drift.

---

## 3. 🔴 Item 3 — BOTH CLAIMS ARE FALSE. Nothing was changed.

The prompt's notes were dated 2026-08-08 and flagged as un-re-verified. They have since been fixed,
and the fixes are recorded.

**Claim A — `CLAUDE.md` still documents the retired worktree/PR model.** FALSE in every particular it
names:

- `/ship` — **zero** occurrences in the file.
- "one change per branch off `main`" — line 246 says the OPPOSITE: _"All work happens on `dev`. There
  are no per-change feature branches."_
- the read-only `cg` worktree — line 257 explicitly says _"There are no `cg` / `cg-designer` /
  `cg-runtime` sibling worktrees"_, and line 261 calls the scheme "retired". The surviving worktree
  text is a live and still-correct rule about `.claude/worktrees/*` being ENUMERATED, never counted.
- the P-014 PR policy — the section is titled _"CC pushes `dev`, the owner merges"_ and reads _"No
  branch, no PR, no merge"_, with an explicit note that _"retiring the PR model does not retire"_ the
  three risk classes. `P-014` is `[x]`.

⚠ **The `@cg/gesture` row IS present** in "Where features go" (`CLAUDE.md:54`). Reported, not added,
as instructed.

**Claim B — `.claude/hooks/gate-stop.mjs:88` computes `git merge-base HEAD origin/main`.** FALSE.
Line 88 is a **comment**, and it says the opposite. The base is `origin/dev`, with `origin/main` kept
only as a fallback for a fresh clone that has never pushed `dev`
(`tools/gate-hook/src/gate-decision.mjs:81`, `DIFF_BASE_REFS = ['origin/dev', 'origin/main']`).
This is `P-026`, whose title is literally the claim, and it is `[x]`.

**Demonstrated rather than read off the comment** — the classifier run against this very tree:

| Measured against              | merge-base | files in span | docs-only turn classifies as              |
| ----------------------------- | ---------- | ------------- | ----------------------------------------- |
| `origin/dev` ✅ chosen        | `a5486a98` | **13**        | `{kind: 'docs-only', needsE2e: false}` ✅ |
| `origin/main` (fallback only) | `a9ecfaa0` | **523**       | would have been a full code gate          |

The carve-out is alive. `gate-decision.test.ts:349` already codifies exactly this comparison.

**The third instance P-027 told us to look for does not exist.** A sweep for any tool defaulting its
diff base to the default branch returns only: the documented fallback, comments explaining it, tests
asserting the correct behaviour, and `pr.yml`'s `refs/heads/main` push trigger — which is the merge
BACKSTOP and is supposed to name `main`. (`P-027`, the CI instance, is also `[x]`.)

---

## 4. What to check

- 🔴 **The bridge-restart repro, this time with NOTHING configured.** Take a row whose template
  declares Live Source plates, restart the bridge with no `--live-layers-path`, and look at the boot
  line and the row: the ledger must be adopted from `~/.cg-runtime/bridge-live-layers.json`.
  ⚠ Per §1.4 the **layer LIST** still will not show the seated layers — that is the known gap
  (task 2.8), not a regression.
- **The exclusivity refusal.** Take a multi-box template, then attempt a second one, and read the
  sentence quoted in §2. Then pull the bridge and let it reconnect with both rows retained on air —
  the second must come back as a skip with the same sentence, not as a second live layout.

---

## 5. Flags

- 🔴 **A Linux `gate:e2e` IS owed for this session, and it was NOT owed for `B-145` alone.** Item 2
  touched two real renderer files — `apps/runtime/src/renderer/features/layers/LayersPanel.tsx` and
  `apps/runtime/src/renderer/hooks/useRestoreSkips.ts` (the operator-visible wording of a restore
  skip) — and the classifier agrees: this span reads `{kind: 'code', needsE2e: true}`. **The debt is
  discharged only by a COMPLETED, GREEN `e2e` job on the pushed commit, cited by run URL in
  `tasks.md`.**
- **Shared config the next session must pick up:** none. No change to root `package.json`,
  `turbo.json`, `pnpm-lock.yaml`, `CLAUDE.md` or the gate hook.
- **Product source changed** (`caspar-runtime.ts`, `bridge.ts`, `shared-ipc`), so the on-air risk
  class applies — flagged here rather than landed silently.
- **Anchor drift:** none. `layerRowActions.ts:655`, `default-bank-boot.integration.test.ts:164`,
  `caspar-runtime.ts:310`, `:3802`, `:3849`, `:4064`, `live-layers.ts:107` and `livePlates.ts:23`
  were each re-read before being cited.
