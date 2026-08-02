# DEBT-FILING-PLAN.md — dedupe, destinations and batching

Session 3 of the `DEBT.md` sweep. Turns the census in [DEBT-SWEEP.md](DEBT-SWEEP.md) into a
filing plan. **Nothing was filed by session 3.** Derived on `dev` at `2a1afe3e`; `dev` is the
single source of truth for item numbers until the owner's final merge into frozen `main`.

## STATUS — FILING COMPLETE (session 5, 2026-08-03)

**Every proposal in this plan is now either CLAIMED or merged. No row is left as `FILE`.**

| prefix | claimed | range                 | commit     |
| ------ | ------- | --------------------- | ---------- |
| `B-`   | 15      | `B-115` … `B-129`     | session 4  |
| `R-`   | 11      | `R-036` … `R-046`     | `83c90e18` |
| `D-`   | 5       | `D-142` … `D-146`     | `c8b531ec` |
| `P-`   | 4       | `P-022` … **`P-025`** | `2dc5f941` |
| `C-`   | 0       | —                     | —          |

**34 claimed + 4 merged = the 38 proposals, all disposed.**

**`P-025` is an ADDITION made during filing, not from this plan.** The plan proposed
`P-022`–`P-024`; session 5 filed a fourth — _PowerShell silently alters arguments and file
content, and does not necessarily error_ — so the `P-` range grew by one. Three of its four
instances were re-measured rather than restated, and two of them are live artifacts in the tree:
`docs/prd/bugs-runtime.md` and `docs/prd/runtime.md` both still carry a UTF-8 BOM.

**Free numbers after the whole sweep:** `B-130`, `C-021`, `D-147`, `P-026`, `R-047`.

### `DEBT.md` locators corrected while filing

The plan is an index built by another session, and several of its locators point at a containing
entry rather than the finding. Every correction made, so the plan is not trusted blind next time:

| item    | plan said      | actual finding | what was at the plan's line                            |
| ------- | -------------- | -------------- | ------------------------------------------------------ |
| `B-120` | `DEBT.md:1064` | `DEBT.md:1092` | the sweep heading — it opens by measuring the OPPOSITE |
| `R-037` | `DEBT.md:355`  | `:393`, `:406` | the `dev-b6-inspector-finish` entry heading            |
| `R-038` | `DEBT.md:686`  | `DEBT.md:756`  | the `dev-offline-polish` entry heading                 |
| `R-039` | `DEBT.md:1360` | `DEBT.md:1383` | the owner UI review batch heading                      |
| `D-144` | `DEBT.md:1967` | `DEBT.md:1968` | the section heading above the bullet                   |
| `D-146` | `DEBT.md:2044` | `DEBT.md:2045` | the section heading above the bullet                   |

`B-120`'s was the one that mattered: `DEBT.md:1064` opens _"`PLAY` on a cleared row REACHES AIR …
Nothing to fix there"_, so filing from that line would have described a non-defect. The residual is
at `:1092`.

### `DEBT.md` LIVE rows with no filed item — four, all deliberate

The census found 36 LIVE rows. 32 got an item; the remaining four are disposed without one, and
each is recorded here rather than left implicit:

| row     | why no item                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------ |
| `:1295` | **CLOSED — discharged.** Session 2 measured it; the residual landed on `R-030` in session 4.     |
| `:33`   | Process, not a PRD item — an unwritten E2E and an owed Linux `gate:e2e`, on the sweep checklist. |
| `:2125` | Process, not a PRD item — a stale header in a task file; the change dir does not exist.          |
| `:936`  | **UNSURE, and still unresolved.** See §e — do not file it from the census summary.               |

**`:936` is the one thing that blocks calling the sweep fully closed.** Session 2 measured that the
seven-verb gating it lists as not-started is in fact present, so part of `dev-list-vs-layer` v3's
§5–§8 has landed — but there is no `dev-list-vs-layer` directory in `openspec/changes/`, so which
part cannot be recovered from the repo. It needs the original task prompt or a fresh re-scope from
the code.

## STATUS — the `B-` run is CLAIMED (session 4, 2026-08-02)

**Read this before deriving anything.** A row's `verdict` column now distinguishes a proposal
from a claim:

| verdict           | meaning                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| **CLAIMED**       | the heading EXISTS in the PRD file at that number — do not re-file, do not renumber |
| **DONE — merged** | the evidence was folded into the named existing item; no number was consumed        |
| FILE              | still a PROPOSAL — re-derive and confirm before claiming                            |

**Claimed in session 4 (commits `fce07a80`, `5bddda2e`):** `B-115` … `B-129`, fifteen items,
twelve in [bugs-runtime.md](docs/prd/bugs-runtime.md) and three in
[bugs-designer.md](docs/prd/bugs-designer.md). **The `B-` space is now contiguous `B-001` …
`B-129`, and the next free `B-` is `B-130`.**

**Merged in session 4 (commit `7b3b3349`):** `B-078`, `B-104`, `P-001` (priority also raised
medium → high), `R-030`. No numbers consumed.

~~**Still proposals:** the `R-`, `D-` and `P-` batches below (19 rows).~~ **Superseded by session
5** — all three batches were claimed on 2026-08-03; see the STATUS section above. Left struck
rather than deleted because it records what was true when session 4 ended.

**One ordering correction session 4 had to make, recorded so it is not re-introduced.** The
batching in §f puts `bugs-designer.md` first because `B-129` is on-air class. Filing in that order
would have left a twelve-number hole: a later session deriving next-free from the headings would
have seen `B-129` and returned `B-130`, stranding `B-115`…`B-126`. **Filing order is not work
order** — filing `B-129` first fixes nothing, and the on-air priority belongs in the item's
severity, which is where it now lives. Session 4 therefore derived the free number ONCE and
claimed the whole run inside one session. Any future batch must do the same per prefix.

## Headline

**The 36 LIVE census rows collapse into 32 distinct items**, of which **27 need a PRD number**.
Adding the one UNSURE row session 2 resolved, the raster residual session 2 measured, and the
nine external items from the task's §6, the plan reached **38 numbered proposals**.

**Reconciled 2026-08-02 against the PRD items that already exist — 4 of those 38 are already
filed, so 34 survive as new numbers:**

| prefix | surviving | range                  | freed |
| ------ | --------- | ---------------------- | ----- |
| `B-`   | 15        | **`B-115`…`B-129`**    | 3     |
| `C-`   | 0         | — (`C-021` stays free) | 0     |
| `D-`   | 5         | **`D-142`…`D-146`**    | 0     |
| `P-`   | 3         | **`P-022`…`P-024`**    | 0     |
| `R-`   | 11        | **`R-036`…`R-046`**    | 1     |

The four merges are `B-127`→`B-078`, `B-129`→`B-104`, `B-132`→`P-001`, `R-046`→`R-030` (numbers
as proposed _before_ this re-pack). That is **10.5% of the 38** — well under the one-third that
would have meant the census was re-discovering known work, so the filing batches stand.

**Historical (session 3):** the `R-`, `D-` and `P-` numbers were proposals — each filing batch re-derives from the
headings and confirms immediately before it claims; a proposal is not an allocation. **The `B-`
range above was CLAIMED in session 4** and is no longer a proposal; see the STATUS section at the
top of this file.

## Free numbers — re-derived, not read

Run against `dev`'s headings with the procedure in
[b-number-registry.md](docs/prd/b-number-registry.md), then widened across all 23 refs. Both
agree, and both agree with session 2's recorded values.

```bash
grep -rhoE "^## \[.\] B-[0-9]{3}" --include="*.md" docs/prd/ --exclude=README.md \
  | grep -oE "[0-9]{3}$" | sort -n | tail -1
```

| prefix | highest heading | max across all 23 refs | next free | session 2 said | agrees? |
| ------ | --------------- | ---------------------- | --------- | -------------- | ------- |
| `B-`   | `B-114`         | `B-114`                | `B-115`   | `B-115`        | yes     |
| `C-`   | `C-020`         | `C-020`                | `C-021`   | `C-021`        | yes     |
| `D-`   | `D-141`         | `D-141`                | `D-142`   | `D-142`        | yes     |
| `P-`   | `P-021`         | `P-021`                | `P-022`   | `P-022`        | yes     |
| `R-`   | `R-035`         | `R-035`                | `R-036`   | `R-036`        | yes     |

Duplicate audit prints exactly `B-056` and `B-080`; `C-`, `D-`, `P-` and `R-` print nothing.
`refs/stash` is empty; both rescue tags are present and untouched.

**Every number below marked `FILE` is a PROPOSAL.** Each filing session re-derives and confirms
immediately before it claims, exactly as the registry requires. A proposal is not an allocation.
Rows marked **CLAIMED** are past that point — the heading exists, and re-deriving against them
returns `B-130`.

> **The table above is session 3's derivation and is left as written.** It was correct on
> `2a1afe3e`. After session 4's `B-` run the live values are `B-130` free and `B-114` no longer
> the highest heading; `C-`, `D-`, `P-` and `R-` are unchanged. Do not read this table as current
> — derive.

## A correction the census carries — three rows have the wrong prefix

The census routes `DEBT.md:1190`, `:1321` and `:1343` to **`bugs-designer.md` (`new D-`)**.
`bugs-designer.md` holds **`B-`** numbers, not `D-`; `D-` lives in `designer.md`. Measured on
`dev`:

| file               | prefix it holds | headings |
| ------------------ | --------------- | -------- |
| `bugs.md`          | `B-`            | 21       |
| `bugs-designer.md` | `B-`            | 58       |
| `bugs-runtime.md`  | `B-`            | 37       |
| `designer.md`      | `D-`            | 135      |
| `runtime.md`       | `R-`            | 35       |
| `caspar.md`        | `C-`            | 20       |
| `platform.md`      | `P-`            | 21       |

All three are Designer **defects**, so the destination file is right and only the prefix is
wrong. They are planned as `B-` below.

---

# a. The row → item map

Every one of the 36 LIVE rows appears exactly once, except `DEBT.md:2456`, which is a bundling
row that feeds two items — stated rather than rounded.

## The five clusters

| cluster                      | rows                      | non-row occurrences | → item                                       |
| ---------------------------- | ------------------------- | ------------------- | -------------------------------------------- |
| **A — `PRIMARY A`**          | `:119`, `:248`            | `:409`              | one bug: the `emitHealth` dedupe collapse    |
| **B — bound-row race**       | `:2207`, `:2456` _(part)_ | `:2535`             | one bug: stale item state after a bank CLEAR |
| **C — `CLEAR ALL`**          | `:1539`, `:2456` _(part)_ | `:2558`             | one bug: enabled but not effective           |
| **D — `#` vs default alias** | `:1606`, `:2621`          | —                   | one item: the two properties have no test    |
| **E — modal dialog asserts** | `:2088`, `:2091`          | —                   | one item: `dev-modal-primitive`'s owed E2E   |

**Cluster A.** `:119` is the `AWAITING OWNER` summary and says so in its own first line ("Full
write-up under _Findings to file_"); `:248` is that write-up. `:409` is a bullet inside the
`dev-b6-inspector-finish` entry at `:355` reading "A NEW BUG REPORTED AND NOT YET INVESTIGATED",
so it is a mention, not a census row. Three occurrences, one defect.

**Clusters B and C.** `:2535` and `:2558` both sit inside the entry anchored at `:2456`
(verified: the nearest preceding `###` for both is `:2456`). `:2558` cross-references `:1539`
explicitly — "See 'CLEAR ALL is always ENABLED but is not always EFFECTIVE' above". So `:2456`
introduces no third defect; its census summary already says it leaves "the bound-row race seam
and `clearAll` … both open". It contributes to two items and is counted once as a row.

**Cluster D is a supersession the census did not catch, and it matters more than the dedupe.**
Both rows are classified LIVE, but `:2621` opens "Owner's final resolution, after two earlier
readings were superseded" — and `:1606` is one of those readings. They state **opposite
models**:

- `:1606` — "`#` and the default alias are ONE number by construction … they cannot disagree."
- `:2621` — "`#` is display order, the default alias is the layer's fixed bank place — **they
  can diverge**." Untick layer 97 and the third visible row is `#3` while still being `Layer 4`.

`:2621` is current. The live debt in both is the same and survives the supersession: **there is
no test on these properties.** The trap is that filing from `:1606` alone would commission a
test asserting the invariant "they cannot disagree" — which is now the **wrong** invariant, and
a green test asserting it would pin the superseded model into the suite.

**Cluster E** is a judgement merge, not a same-defect merge: `:2088` and `:2091` are two missing
assertions in the same owed E2E suite for the same change (`dev-modal-primitive`). Filed as one
item with two acceptance bullets. Split them if a later session prefers.

## One cross-source merge

`DEBT.md:1190` and **external #10** (the Designer canvas background reaching the output) are the
same defect. `:1190` is planned as `MERGE INTO` #10's item rather than as its own number — see
§g.4 below for why `:1190`'s closure claim does not refute it.

## The arithmetic

```
36 LIVE rows
   9 rows in 5 clusters      ->  5 items
+ 27 rows mapping alone      -> 27 items
  ----                          ----
  36 rows                        32 items          (9 + 27 = 36 ✓)

"32 items" counts every distinct disposition, filed or not.
Five of them do not consume a PRD number:
  -  3 are process / OpenSpec work with no PRD number   (:33, :936, :2125)
  -  1 is CLOSE — discharged, measured in session 2     (:1295)
  -  1 merges into an external item                     (:1190 -> ext #10)
  ----
    27 numbered PRD items from the 36 LIVE rows

+  1  the UNSURE row session 2 resolved                 (DEBT.md:1531)
+  1  the raster residual session 2 measured            (task §5.3)
+  9  external items from the task §6
  ----
    38 numbered items proposed in total
```

`DEBT.md:1531` was **UNSURE**, not LIVE, so it is additional to the 36 and does not disturb the
reconciliation above.

**The 2026-08-02 reconciliation delta.** The row→item map above is unchanged — the four merges
alter what each item _costs in numbers_, not which row belongs to which item:

```
    27 numbered PRD items from the 36 LIVE rows
  -  1 :1321  -> already filed as B-078          (26)
+  1  DEBT.md:1531 (the resolved UNSURE row)     (27)
+  0  the raster residual -> already R-030's     (27)
+  7  external items (was 9; #3 -> B-104, #5 -> P-001)
  ----
    34 numbered items proposed after reconciliation
```

---

# b. The plan

`design-first? = yes` means an OpenSpec change is authored **before** the PRD item is filed —
anything touching schema, a migration, or a contract between packages.

Severity is read from the evidence in the entry, never from its tone. `unrated` where the entry
does not support one.

## `bugs-runtime.md` — `B-` (Runtime defects)

| source                      | description                                                                                    | existing item?                          | verdict     | dest              | prefix | number    | severity | design-first? |
| --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | ----------- | ----------------- | ------ | --------- | -------- | ------------- |
| `:119` + `:248` _(+`:409`)_ | `PRIMARY A` sticks in `connecting`: `emitHealth` dedupes on a key that collapses 4 FSM states  | related: `B-046` (bugs-runtime.md:628)  | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-115** | high     | no            |
| `:230`                      | `delimiters.json` lives in the template dir, so every boot warns a template is corrupt         | related: `R-034` (runtime.md:1357)      | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-116** | medium   | no            |
| `:796`                      | The reachability gate disabled the entire console in TEST MODE; fix landed, wants filing       | related: `R-006` (runtime.md:170)       | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-117** | medium   | no            |
| `:1012`                     | `enterRehearse` reports a flat `mute-failed`; CasparCG never refuses `MIXER VOLUME` (measured) | related: `R-029` (runtime.md:1256)      | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-118** | high     | no            |
| `:1048`                     | Whether `unknown` had a connected server is INFERRED; a second defect is not ruled out         | related: `B-093` (bugs-runtime.md:1799) | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-119** | unrated  | no            |
| `:1064`                     | `PLAY` is enabled on a bound row whose template has left the registry — take fails at air time | related: `C-011` (caspar.md:166)        | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-120** | on-air   | no            |
| `:1104`                     | `CG ADD` site 2 (reconnect reconciliation) is not rehearse-guarded — re-ADDs unmuted           | related: `R-022` (runtime.md:898)       | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-121** | on-air   | no            |
| `:1539` + `:2456`           | `CLEAR ALL` filters on the very statuses that may be wrong — returns success having sent none  | related: `R-012` (runtime.md:523)       | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-122** | on-air   | no            |
| `:1714`                     | `FailoverBanner` is `position: fixed` and overlays the monitor strip                           | none                                    | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-123** | low      | no            |
| `:1722`                     | `clampInspector`'s `MIN_WORKSPACE_PX` ignores ~54px of shell chrome                            | none                                    | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-124** | low      | no            |
| `:2207` + `:2456`           | Bound-row race: the unbound branch CLEARs a just-loaded producer, item state stays `loaded`    | none                                    | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-125** | on-air   | no            |
| `DEBT.md:1531`              | Adopt-`CLEAR` returned 202, the following `CG ADD` returned 404, layer 71 left empty           | related: `B-056` (bugs-runtime.md:953)  | **CLAIMED** | `bugs-runtime.md` | `B-`   | **B-126** | on-air   | no            |

**`B-115` is a regression caused by `B-046`, and the item must say so.** `B-046`
([bugs-runtime.md:628](docs/prd/bugs-runtime.md), `[x]`) shipped the dedupe: its own note records
"`emitHealth` dedupes by effective liveness (churn + primary double-emit gone)". That dedupe is
exactly what `B-115` reports as lossy — the key collapses `disconnected | connecting |
handshaking | resyncing` into one value, so only the first of the four is ever published. **Not a
merge**: `B-046` is closed and its stated goal (kill health churn) was achieved. `B-115` is the
cost of that fix, and it should cite `B-046` as its origin so nobody "fixes" it by reverting the
dedupe and reviving the churn.

**`B-126` is the mirror of the runtime `B-056`, not a duplicate of it.** `B-056` (runtime,
[bugs-runtime.md:953](docs/prd/bugs-runtime.md), `[x]`) is _the adopt-`CLEAR` did not land and
`load()` proceeded anyway_ — an unadopted live orphan renders. `B-126` is the opposite half: the
`CLEAR` **did** land (202) and the `CG ADD` after it failed (404), leaving the layer empty. Same
seam — the CLEAR/ADD pair is not atomic — opposite failure modes. Merging them would bury one.

## `bugs-designer.md` — `B-` (Designer defects; the census's `new D-` corrected)

| source                 | description                                                                      | existing item?                             | verdict           | dest               | prefix | number    | severity | design-first? |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ----------------- | ------------------ | ------ | --------- | -------- | ------------- |
| `:1321`                | Flake: Designer multi-select group-drag spec times out under a loaded gate       | **`B-078`** (bugs.md:728, `[ ]`)           | **DONE — merged** | —                  | —      | —         | medium   | no            |
| `:1343`                | Flake: Designer VP8+alpha seek-fragile canvas test hits a decode error           | related: `B-078` (bugs.md:728)             | **CLAIMED**       | `bugs-designer.md` | `B-`   | **B-127** | medium   | no            |
| external #3            | JSON save/import loses assets — owner has a reproduction, mechanism undiagnosed  | **`B-104`** (bugs-designer.md:1341, `[ ]`) | **DONE — merged** | —                  | —      | —         | high     | no            |
| external #9            | The ticker separator combo lists every asset, including fonts and videos         | related: `D-039` (designer.md:1019)        | **CLAIMED**       | `bugs-designer.md` | `B-`   | **B-128** | medium   | no            |
| external #10 + `:1190` | The canvas background colour leaks into the output; output must stay transparent | none                                       | **CLAIMED**       | `bugs-designer.md` | `B-`   | **B-129** | on-air   | **yes**       |

**`B-127` (the VP8 flake) is deliberately NOT merged into `B-078`, though its own `DEBT.md`
entry groups them.** `DEBT.md:1321` calls the group-drag timeout "the same class as the VP8 flake
below" — and for the group-drag half that is right: a _late_ locator assertion under load is
precisely `B-078`'s mechanism, and the entry itself names "the B-073/B-098 contention signature",
which is `B-078`'s own family. But the VP8 failure is `PipelineStatus::PIPELINE_ERROR_DECODE` — a
Chrome **media-pipeline decode fault** on one fixture the test's own name calls "seek-fragile",
not an assertion that ran out of time. Filing it inside a harness-contention item would hide a
decode bug behind a known-flaky banner, which is how a real failure gets waved through — the
entry's own closing words. Kept separate, cross-referenced.

**`B-129` (canvas background) found nothing, and that was searched, not assumed.** No heading in
any of the seven PRD files mentions `background` or `transparent` in this sense, and a body sweep
for `scene.background` / "canvas background" / "backdrop" across `docs/prd/` returns only
unrelated hits (`B-016`'s gradient-text box background, `B-027`'s pasteboard colours). Both `[x]`
and `[~]` states were included.

## `bugs.md` — `B-` (cross-cutting)

| source      | description                                                                      | existing item?                     | verdict           | dest | prefix | number | severity | design-first? |
| ----------- | -------------------------------------------------------------------------------- | ---------------------------------- | ----------------- | ---- | ------ | ------ | -------- | ------------- |
| external #5 | The app's UI font loads from a CDN; on a LAN-only or air-gapped machine it hangs | **`P-001`** (platform.md:5, `[ ]`) | **DONE — merged** | —    | —      | —      | high     | no            |

**No proposal survives in `bugs.md`, so this batch disappears.** `P-001` — "Bundle Vazirmatn
offline" ⟨medium⟩, `[ ]` open — is the same defect stated as work: _"Ship the Vazirmatn font with
the apps instead of loading it from the jsdelivr CDN"_, with the reason already written as
_"Broadcast machines are often air-gapped; a CDN `<link>` breaks Persian rendering offline"_, and
acceptance bullets already drafted. The only thing the external item adds is **severity**: it was
reported as a LAN-only/air-gapped hang, which is stronger than `P-001`'s recorded `medium`. The
filing session should raise `P-001`'s priority rather than mint a number beside it.

## `runtime.md` — `R-` (Runtime work items)

| source            | description                                                                                    | existing item?                       | verdict           | dest         | prefix | number    | severity | design-first? |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------- | ------------ | ------ | --------- | -------- | ------------- |
| `:195`            | A version/shape marker on the persisted bridge configs — costed, judged its own change         | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-036** | medium   | **yes**       |
| `:355`            | `dev-b6-inspector-finish` remainder: §3 `ROTATOR — ITEM 3` schema decision + the §7 split row  | related: `R-028` (runtime.md:1067)   | **CLAIMED**       | `runtime.md` | `R-`   | **R-037** | medium   | **yes**       |
| `:686`            | Three clear-reason Zod enums cannot carry the real error code                                  | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-038** | medium   | **yes**       |
| `:1360`           | No E2E covers the scrub DRAG, only `arrowStep`                                                 | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-039** | low      | no            |
| `:1420`           | Two same-named sequences render identical Inspector headings — needs a wording decision        | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-040** | low      | no            |
| `:1606` + `:2621` | No test on `#`-vs-alias divergence, alias stability, or gap-not-renumber                       | related: `R-033` (runtime.md:1203)   | **CLAIMED**       | `runtime.md` | `R-`   | **R-041** | medium   | no            |
| `:1832`           | `mute-before-ADD` so LOAD can run during rehearse; on 2.5.0 volume must land BEFORE `CG ADD`   | related: `R-029` (runtime.md:1256)   | **CLAIMED**       | `runtime.md` | `R-`   | **R-042** | on-air   | **yes**       |
| `:1891`           | The APASAI mark is an auto-trace of a raster — replace with real vector before release         | related: `R-035` (runtime.md:1385)   | **CLAIMED**       | `runtime.md` | `R-`   | **R-043** | medium   | no            |
| `:2088` + `:2091` | Nothing asserts the migrated dialogs still OPEN, nor that `Cancel` leaves state byte-identical | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-044** | medium   | no            |
| `:2107`           | `AWAITING_ROW_REASON` sits with the verbs, not in the shared `reachWording` module             | none                                 | **CLAIMED**       | `runtime.md` | `R-`   | **R-045** | low      | no            |
| task §5.3         | The raster residual: a dead `window.innerWidth` fallback, and the `unreadable` silence         | **`R-030`** (runtime.md:1306, `[ ]`) | **DONE — merged** | —            | —      | —         | medium   | no            |
| external #8       | `next` should not be offered on every sequence — keep `NEXT`, disable it, explain in tooltip   | related: `D-031` (designer.md:934)   | **CLAIMED**       | `runtime.md` | `R-`   | **R-046** | medium   | **yes**       |

**The raster residual is `R-030`'s own unmet acceptance, not a new item.** `R-030` is still `[ ]`
OPEN, and its third acceptance bullet reads verbatim: _"WHEN the bridge supplies channel geometry
as a query parameter THEN that is used; WHEN it is absent THEN `window.innerWidth`/`innerHeight`;
WHEN neither is available THEN 1920×1080."_ Session 2 measured that the middle branch **can never
run** — the bridge appends `cw`/`ch` unconditionally, so source 1 always wins. That is a
three-source chain `R-030` specifies and the implementation cannot satisfy. Filing it as a second
number would split one feature across two items while the first is still open. The residual, and
the stale `OUTPUT_FRAME` body text already noted in §h, both land on `R-030`.

**`R-043` (the APASAI mark) stays separate from `R-035`.** `R-035` is `[~]` and its acceptance is
entirely about splash **behaviour** — first-paint, the phase readout, the monotone percentage, the
8000/3000 ms floors. Nothing in it specifies the mark's provenance, so "replace the auto-traced
raster with a real vector" is an asset deliverable `R-035` never covered and will outlive its
archive.

## `designer.md` — `D-` (Designer work items)

| source       | description                                                                                | existing item?                          | verdict     | dest          | prefix | number    | severity | design-first? |
| ------------ | ------------------------------------------------------------------------------------------ | --------------------------------------- | ----------- | ------------- | ------ | --------- | -------- | ------------- |
| external #1  | Brand Pack Factory                                                                         | none                                    | **CLAIMED** | `designer.md` | `D-`   | **D-142** | unrated  | **yes**       |
| external #2  | Designer `.vcg` import                                                                     | related: `R-001` (runtime.md:6)         | **CLAIMED** | `designer.md` | `D-`   | **D-143** | unrated  | **yes**       |
| external #6  | The Designer splash never got a `D-` number — retroactive item for shipped work            | related: `R-035` (runtime.md:1385)      | **CLAIMED** | `designer.md` | `D-`   | **D-144** | low      | no            |
| external #11 | A guide layer: canvas only, absent from preview and export; one predicate, three consumers | related: `D-015` / `D-072` — see note ↓ | **CLAIMED** | `designer.md` | `D-`   | **D-145** | unrated  | **yes**       |
| `:2044`      | No in-app about/version surface in either product, though `__CG_BUILD__` is ready          | none                                    | **CLAIMED** | `designer.md` | `D-`   | **D-146** | low      | no            |

**`D-143` is the Designer half of a capability the Runtime already has.** `R-001` ⟨`[x]`,
[runtime.md:6](docs/prd/runtime.md)⟩ is _the Runtime_ importing a `.vcg` for playout; `D-143` is
_the Designer_ importing one back for editing. Different product, different direction, different
failure modes — related, not the same.

**`D-145` is NOT `D-015` or `D-072`, and the near-miss is worth naming.** Both existing items use
the word "guide": `D-015` ⟨`[x]`⟩ is _View menu: ruler + snapping toggles_ and `D-072` ⟨`[x]`⟩ is
_Guide coordinate readout on hover / drag_ — both about **ruler guides**, the draggable reference
lines. The owner's item is a **guide layer**: marking a real scene _element_ as reference-only so
it renders on canvas but is absent from preview and export (`G` icon beside hide/lock, right-click
`set as guide`). Same word, different object. Merging on the word would bury the feature.

## `platform.md` — `P-` (process and tooling rules)

| source  | description                                                                                     | existing item?                 | verdict     | dest          | prefix | number    | severity | design-first? |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------ | ----------- | ------------- | ------ | --------- | -------- | ------------- |
| `:180`  | An item-number claim derives across EVERY ref, never from one branch — generalised (see below)  | related: `B-075` (bugs.md:373) | **CLAIMED** | `platform.md` | `P-`   | **P-022** | medium   | no            |
| `:1456` | A control test that reaches a different implementation than the one under test is not a control | none                           | **CLAIMED** | `platform.md` | `P-`   | **P-023** | medium   | no            |
| `:1732` | Pattern (twice): an observer effect silently no-ops when its target is absent on first render   | none                           | **CLAIMED** | `platform.md` | `P-`   | **P-024** | medium   | no            |

**`P-022` vs `B-075` — enforcement is not procedure.** `B-075` ⟨`[x]`, [bugs.md:373](docs/prd/bugs.md)⟩
built the CI guard that stops a duplicate `B-` number from being MERGED. It enforces uniqueness
for **`B-` only, over the three bug files**. `P-022` is the _claiming_ procedure across all five
prefixes — derive from headings, across every ref, immediately before commit. Session 2 wrote that
procedure into `b-number-registry.md`, so it is documented; it is **not** enforced for `C-`/`D-`/
`P-`/`R-`, which is exactly the gap the `R-031` double-claim fell through. Kept as its own item.

**On `P-022`'s scope.** `DEBT.md:180` is written as a fast-mode rule — "a claim must check
**both** branches". That framing is already obsolete: `main` is frozen, the trees were
byte-identical at session 2, and the registry now carries an **all-ref** derivation that is a
strict superset of "both branches". The durable rule is what should be filed, not the
two-branch wording. Filed rather than closed because `platform.md` is where this repo's process
rules live (`P-009` gate hook, `P-011` ship, `P-013` lock, `P-014` merge policy) and the rule
outlives fast mode.

## `caspar.md` — `C-`

**No `C-` number is proposed.** Every census row targeting `caspar.md` is `PROCESS` (hardware
verification owed), not `LIVE`, so nothing in this pass needs a `C-`. `C-021` stays free.

---

# c. What will NOT be filed

| source         | why not                                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:1295`        | **CLOSE — discharged.** Session 2 measured it: `OUTPUT_FRAME` exists nowhere in code, the raster is channel-derived (`caspar-runtime.ts:3689` → `position.ts:260`). The residual lands on `R-030`. |
| `:1190`        | **MERGE INTO `B-129`.** Same defect as external #10; its closure claim is scope-limited, see §g.4.                                                                                                 |
| `:1321`        | **MERGE INTO `B-078`** (bugs.md:728). The group-drag timeout is `B-078`'s own mechanism, and the entry names its family (B-073/B-098) without naming the item.                                     |
| external #3    | **MERGE INTO `B-104`** (bugs-designer.md:1341). Same defect; `B-104` is open, high, DATA-LOSS class, and explicitly asks for the reproduction the owner has.                                       |
| external #5    | **MERGE INTO `P-001`** (platform.md:5). Same defect stated as work — bundle Vazirmatn instead of the jsdelivr CDN. Raise `P-001`'s priority rather than mint a number beside it.                   |
| task §5.3      | **MERGE INTO `R-030`** (runtime.md:1306). The raster residual is `R-030`'s third acceptance bullet going unmet; `R-030` is still `[ ]`.                                                            |
| `:2456`        | **MERGE INTO `B-122` + `B-125`.** A bundling row; both halves are already canonical elsewhere.                                                                                                     |
| `:248`, `:409` | **MERGE INTO `B-115`.**                                                                                                                                                                            |
| `:2621`        | **MERGE INTO `R-041`** — and `:1606`'s model is SUPERSEDED by it. See cluster D.                                                                                                                   |
| `:2091`        | **MERGE INTO `R-044`.**                                                                                                                                                                            |
| `:33`          | Process, no number: the §3 refusal E2E is unwritten and a Linux `gate:e2e` is owed. Already on the `DEBT-SWEEP.md` §5 checklist.                                                                   |
| `:2125`        | Process, no number: the `dev-r030` task file's "run after r022" header is stale. A one-line docs fix; the change dir does not exist in `openspec/changes/`.                                        |
| external #4    | **Not a numbered item.** The `tools/` ship boundary (only `caspar-bridge` ships) is an addendum that travels with `prompt-dev-server-install.md`.                                                  |
| external #7    | Process, no number: the OpenSpec spec-delta for the visual layer. Already on the `DEBT-SWEEP.md` §5 checklist.                                                                                     |
| external #12   | **CLOSE — discharged by session 2.** `b-number-registry.md` was stale at `R-029`/`R-030` while the truth was `R-035`; repaired, and the "next free" pointer retired.                               |
| `DEBT.md:978`  | **CLOSE — discharged.** The census's other UNSURE row. Session 2 measured `listOnly` at `caspar-runtime.ts:1055` and the seven-verb CasparCG gating at `LayersPanel.tsx:179`/`:399`/`:428`.        |

---

# d. Mechanism not diagnosed

These are filed **with their reproduction and an explicit "mechanism unknown" note**. In this
repo a guessed cause has twice sent work chasing a phantom, so no cause is written into any of
them.

| item      | what is known                                                                                             | what is NOT known                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **B-119** | `mute-failed` can only come from an unreachable server, which also makes every slot read `unknown`        | Whether a CONNECTED server ever reported `unknown` — a second defect the rule would mask |
| **B-104** | The owner has a reproduction: JSON save then import loses assets                                          | The mechanism, entirely. Do not guess a cause from the exporter's shape                  |
| **B-128** | The ticker separator combo lists every asset, fonts and videos included                                   | The mechanism — **and the prior question below**                                         |
| **B-129** | The canvas background colour reaches the output; output must be transparent unless a real element says so | Whether `:1190`'s "measured dead" reading covers the non-transparent case (it does not)  |

The asset-loss row is listed under **`B-104`**, not a new number — it merged there. `B-104`
already carries two candidate break points and states that "the exact repro conditions MUST be
pinned during the fix"; the owner's reproduction is precisely that missing input, so it is added
to `B-104` rather than filed beside it. The "mechanism unknown" discipline still applies: do not
promote either of `B-104`'s candidates to a cause because a repro now exists.

**`B-128` carries a question that must be answered before anyone "fixes" it.** What happens if
a font or a video **is** selected as a ticker separator? If the answer is _silently nothing_,
there is a worse bug underneath and filtering the picker would hide it. The item must state
this and must not be closed by adding a filter alone.

**`B-129` carries a migration.** Templates that currently hold a non-transparent
`scene.background` will change behaviour **on air**, so the change must be deliberate and
announced. The fix shape is **making the wrong state unrepresentable** — "editor backdrop" and
"authored background" are two facts collapsed into one field — not keeping two values in sync.
That is why it is `design-first: yes`.

**`D-145` carries an open decision.** Does the exporter strip guide layers, or keep them behind
a flag? Keeping them means an older Runtime renders them, so **stripping is the safer default**;
the item states it as a decision, not as settled. Its correctness constraint: three consumers
(canvas, preview, export) means the predicate lives in **one** place — the `positionQuery`
lesson is that the second consumer is what creates drift.

**`R-046` (the `NEXT` item) must carry two things explicitly or they will be lost.** (a) R-021 stage-2b says do
not ship a control for a capability that does not exist, while the layer-UI clause 8 says keep
it and **disable** it — already reconciled in favour of **keep `NEXT`, disable it, explain why
in the tooltip**. (b) The owner's migration decision is that the default is **"has it"**, which
preserves today's behaviour, because "does not have it" would silently strip a capability from
already-delivered templates.

---

# e. UNSURE — one row, with the question that settles it

| row    | why it cannot be classified                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:936` | `dev-list-vs-layer` v3 lists §5–§8 as not started, "incl. the seven-verb CasparCG gating". Session 2 measured that gating as **present** (`LayersPanel.tsx:179`, consumed at `:399`/`:428`). So part of §5–§8 has landed — but **which part?** |

**The question:** which of v3's §5–§8 remain undone? It cannot be answered from the repo: there
is no `dev-list-vs-layer` directory in `openspec/changes/` (active or archived), so the section
decomposition exists only in the task prompt that produced it. Either that prompt is recovered,
or the remaining work is re-derived from the code and re-scoped. **Do not file `:936` from its
census summary** — that would commission the seven-verb gating a second time.

---

# f. Batching order

One batch per destination file. On-air-class items first; the canvas-background item (now
`B-129`) leads the whole queue per the task's §6.10. Within a batch, `design-first: yes` items
need their OpenSpec change authored before the PRD item is filed.

| #   | batch                                 | items                                                                               | why here                                                                |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 0   | **merges — no numbers claimed**       | evidence onto `B-078`, `B-104`, `P-001`, `R-030`                                    | do these FIRST: they are edits to open items and cannot gap a run       |
| 1   | **`bugs-designer.md`** (on-air first) | `B-129`, then `B-127`, `B-128`                                                      | `B-129` is on-air class and first in the queue by instruction           |
| 2   | **`bugs-runtime.md`**                 | `B-120`, `B-121`, `B-122`, `B-125`, `B-126`, then `B-115`–`B-119`, `B-123`, `B-124` | five on-air items lead; the two layout bugs land last                   |
| 3   | **`runtime.md`**                      | `R-042`, then `R-036`–`R-041`, `R-043`–`R-046`                                      | `R-042` is the on-air ordering constraint; the design-first four follow |
| 4   | **`designer.md`**                     | `D-142`–`D-146`                                                                     | features; three are design-first and gate on their OpenSpec change      |
| 5   | **`platform.md`**                     | `P-022`–`P-024`                                                                     | process rules; no code depends on them, so they land last               |

**The `bugs.md` batch is gone.** Its only proposal merged into `P-001`, so no cross-cutting `B-`
is filed at all. That removes the ordering hazard the previous version of this plan carried: the
`B-` run is now claimed entirely within batches 1 and 2.

**Numbers are still allocated per prefix, not per batch**, so batch 1 and batch 2 together must
claim `B-115`–`B-129` with no gap. If a batch is re-ordered or split, re-derive the whole `B-`
run rather than reusing the proposals above — a proposal is not a reservation.

**Batch 0 exists because a merge cannot gap a number run.** The four merges are edits to items
that are already open (`B-078`, `B-104`, `P-001`, `R-030` are all `[ ]`), so they can land before
any number is claimed and they de-risk the rest: if the owner disagrees with a merge, the affected
item comes back into the run _before_ the numbering is fixed.

---

# g. The four contradictions settled — plus a fifth

Recorded here rather than in `DEBT.md`, which stays read-only.

**1. Three stale snapshots of one chain — `:1251` and `:1277` against `:602` and `:1254`.**
Current reading: `:602` (`dev-r028-b5` shipped in three commits) and `:1254` (r022 and r030 both
shipped) are **current**; `:1251` and `:1277` are **stale snapshots**, already marked OBSOLETE by
the census. They are consistent as a timeline — newest entry at the top of the section — and the
only real defect is that nothing in the file says so. A reader landing on `:1277` gets no signal
it was overtaken. No item; the risk is retired by this plan naming them.

**2. `:2603` against `:2486` — `CLEAR` on an unbound row.** `:2486` is current: CLEAR is enabled
on every row. `:2603` describes it as disabled and itself calls that "the interim state, not the
intent" — superseded in place. Census marking (OBSOLETE) confirmed.

**3. `:836` and `:892` against `:688` — `dev-offline-ux`.** `:688` is current and explicit:
"`dev-offline-ux` is CLOSED and superseded; discard every version of it." Both version entries
are OBSOLETE. Confirmed. Note this does **not** reach `:978`, which is `dev-list-vs-layer`, a
different change — closed instead by session 2's measurement (see §c).

**4. `:1190`'s "measured dead" is TRUE BUT NARROWER THAN IT READS, and `B-129` must say so.**
The entry is not false and must not be filed as if it were. What it actually measured: in the
PVW-white reproduction, `.cg-stage` read `rgba(0, 0, 0, 0)` **and both scenes involved were
authored `background: 'transparent'`**. That establishes the background mechanism was not the
cause **of the PVW white box**. It establishes nothing about a scene authored with a
non-transparent `scene.background`, which is exactly external #10's case — the measurement never
had such a scene in it. So `:1190` closes one question and leaves #10's open. `B-129` must state
this explicitly rather than calling `:1190` wrong.

**5. A FIFTH contradiction the census did not catch — `:1606` against `:2621`.** Both LIVE, and
they assert opposite models of the `#` column versus the default alias. `:2621` is the owner's
final resolution and supersedes `:1606`. Full detail in cluster D above. This one is dangerous
in a way the other four are not: the other four would waste a reader's time, while filing from
`:1606` would commission a **test asserting the superseded invariant**, pinning the wrong model
into the suite as a green assertion.

---

# h. What session 2 measured, carried here so it is not re-derived

**The raster residual (now MERGED INTO `R-030`) — the task's §5.3 question is ANSWERED, and the
answer is narrower than feared.** The question was whether `RasterMismatchBanner` fires for an
_unconfigured_ channel or only a _declared-but-mismatched_ one.

Measured: `rasterVerdict` (`packages/shared-ipc/src/channels/channelSettings.ts`) returns
`'unconfigured'` only when the channel has **no entry in `state.settings`** — but
`ChannelSettingsStore.hydrate` back-fills **every declared channel** with
`defaultChannelSettings(channel)` (= 1920×1080) at `channel-settings-store.ts:106`. So a
declared-but-never-configured channel does get an entry, its 1920×1080 claim is then compared
against the observed `INFO` reading, and on a real 720p channel that is a **`mismatch` — the
banner fires**. The worst case is covered.

Two real residuals remain, and they are what the `R-030` merge carries:

1. **A dead fallback that looks like a safety net.** `resolveChannelRaster` step 2 —
   `window.innerWidth`/`innerHeight`, the one source that would measure the real CEF surface —
   **can never run**, because the bridge appends `cw`/`ch` unconditionally
   (`caspar-runtime.ts:3689`, and its own comment says the query "is never empty") and step 1
   always wins. Unreachable code that reads as a correction path is a maintenance hazard.
2. **`unreadable` is deliberate silence.** When `INFO` cannot be read the verdict is
   `unreadable`, the banner stays quiet by design ("a gap in the check, not evidence of a
   fault"), and placement silently uses 1920×1080. That trade-off is defensible and documented;
   it is recorded so it is a known gap rather than a surprise.

**`R-030`'s body text is stale (no new number).** The item is still `[ ]` in
`docs/prd/runtime.md` and its prose still names `OUTPUT_FRAME`, a constant that no longer exists
in the code. The defect `DEBT.md:1295` recorded is discharged. The body update rides with the
raster-residual merge above and does **not** consume a number.

---

# i. Three process defects that are ALREADY FILED — do not re-file them

These are **not** in the plan above and must not be added to it. They are recorded here so the
process-discharge session finds the existing item instead of minting a number beside it. Each was
verified against `dev`.

| the observation                                                                | already filed as                                      | state |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- | ----- |
| pnpm warns on every run — the `pnpm` field in `package.json` is no longer read | **`B-050`** ([bugs.md:241](docs/prd/bugs.md))         | `[ ]` |
| `CLAUDE.md`'s worktree model is missing facts that caused wrong actions        | **`P-019`** ([platform.md:744](docs/prd/platform.md)) | `[ ]` |
| Rescue tags exist only on one disk; a re-clone would destroy them              | **`P-020`** ([platform.md:789](docs/prd/platform.md)) | `[ ]` |

## `P-020` is fully dischargeable — measured, not assumed

`P-020` names **two** specific local-only tags: `parked/openspec-archive-2026-07-19` and
`stash-rescue/2026-07-26-runtime-modal` (the second "has not actually been created yet" at filing
time). Both now exist on `origin`.

Measured on 2026-08-02 by comparing `git tag -l` against `git ls-remote --tags origin`:

```
local tags:  16      origin tags: 22
local-only tags (present locally, absent on origin):  NONE
```

**Zero local-only tags.** `origin` is a strict superset — it additionally carries five
`snapshot/2026-07-20-*` tags and `stash-rescue/2026-07-26-runtime-modal` that this checkout has
not fetched (they point at commits outside `dev`'s history, so a plain `git fetch` does not pull
them). That is the safe direction: the backup holds more than the disk.

So the concrete half of `P-020` — those two tags being unpushed — is **discharged in full**, not
partly. What remains is its standing acceptance ("WHEN a rescue tag is created THEN it is pushed,
or its non-durability is recorded as a deliberate choice"), which is a rule rather than a task.
Whether that closes `P-020` or leaves it open as documentation is the owner's call; the evidence
for closing it is above.

**A side finding worth one line:** `stash-rescue/2026-07-26-runtime-modal` is the rescue of the
`feat/runtime-modal-and-context-menu` stash that an earlier sweep prompt described as sitting on
`stash@{0}`. It was tagged and pushed, which is why the stash stack later read as two unrelated
entries and now reads as empty. Nothing was lost.
