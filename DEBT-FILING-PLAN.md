# DEBT-FILING-PLAN.md — dedupe, destinations and batching

Session 3 of the `DEBT.md` sweep. Turns the census in [DEBT-SWEEP.md](DEBT-SWEEP.md) into a
filing plan. **Nothing is filed by this pass.** No item number is claimed, no file under
`docs/prd/` or `openspec/` is touched, no product code is written.

Derived on `dev` at `2a1afe3e`. `dev` is the single source of truth for item numbers until the
owner's final merge into frozen `main`.

## Headline

**The 36 LIVE census rows collapse into 32 distinct items**, of which **27 need a PRD number**.
Adding the one UNSURE row session 2 resolved, the raster residual session 2 measured, and the
nine external items from the task's §6, the plan proposes **38 numbered items**.

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

**Every number below is a PROPOSAL.** Each filing session re-derives and confirms immediately
before it claims, exactly as the registry requires. A proposal is not an allocation.

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

---

# b. The plan

`design-first? = yes` means an OpenSpec change is authored **before** the PRD item is filed —
anything touching schema, a migration, or a contract between packages.

Severity is read from the evidence in the entry, never from its tone. `unrated` where the entry
does not support one.

## `bugs-runtime.md` — `B-` (Runtime defects)

| source                      | description                                                                                    | verdict | dest              | prefix | number    | severity | design-first? |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------- | ----------------- | ------ | --------- | -------- | ------------- |
| `:119` + `:248` _(+`:409`)_ | `PRIMARY A` sticks in `connecting`: `emitHealth` dedupes on a key that collapses 4 FSM states  | FILE    | `bugs-runtime.md` | `B-`   | **B-115** | high     | no            |
| `:230`                      | `delimiters.json` lives in the template dir, so every boot warns a template is corrupt         | FILE    | `bugs-runtime.md` | `B-`   | **B-116** | medium   | no            |
| `:796`                      | The reachability gate disabled the entire console in TEST MODE; fix landed, wants filing       | FILE    | `bugs-runtime.md` | `B-`   | **B-117** | medium   | no            |
| `:1012`                     | `enterRehearse` reports a flat `mute-failed`; CasparCG never refuses `MIXER VOLUME` (measured) | FILE    | `bugs-runtime.md` | `B-`   | **B-118** | high     | no            |
| `:1048`                     | Whether `unknown` had a connected server is INFERRED; a second defect is not ruled out         | FILE    | `bugs-runtime.md` | `B-`   | **B-119** | unrated  | no            |
| `:1064`                     | `PLAY` is enabled on a bound row whose template has left the registry — take fails at air time | FILE    | `bugs-runtime.md` | `B-`   | **B-120** | on-air   | no            |
| `:1104`                     | `CG ADD` site 2 (reconnect reconciliation) is not rehearse-guarded — re-ADDs unmuted           | FILE    | `bugs-runtime.md` | `B-`   | **B-121** | on-air   | no            |
| `:1539` + `:2456`           | `CLEAR ALL` filters on the very statuses that may be wrong — returns success having sent none  | FILE    | `bugs-runtime.md` | `B-`   | **B-122** | on-air   | no            |
| `:1714`                     | `FailoverBanner` is `position: fixed` and overlays the monitor strip                           | FILE    | `bugs-runtime.md` | `B-`   | **B-123** | low      | no            |
| `:1722`                     | `clampInspector`'s `MIN_WORKSPACE_PX` ignores ~54px of shell chrome                            | FILE    | `bugs-runtime.md` | `B-`   | **B-124** | low      | no            |
| `:2207` + `:2456`           | Bound-row race: the unbound branch CLEARs a just-loaded producer, item state stays `loaded`    | FILE    | `bugs-runtime.md` | `B-`   | **B-125** | on-air   | no            |
| `DEBT.md:1531`              | Adopt-`CLEAR` returned 202, the following `CG ADD` returned 404, layer 71 left empty           | FILE    | `bugs-runtime.md` | `B-`   | **B-126** | on-air   | no            |

## `bugs-designer.md` — `B-` (Designer defects; the census's `new D-` corrected)

| source                 | description                                                                      | verdict | dest               | prefix | number    | severity | design-first? |
| ---------------------- | -------------------------------------------------------------------------------- | ------- | ------------------ | ------ | --------- | -------- | ------------- |
| `:1321`                | Flake: Designer multi-select group-drag spec times out under a loaded gate       | FILE    | `bugs-designer.md` | `B-`   | **B-127** | medium   | no            |
| `:1343`                | Flake: Designer VP8+alpha seek-fragile canvas test hits a decode error           | FILE    | `bugs-designer.md` | `B-`   | **B-128** | medium   | no            |
| external #3            | JSON save/import loses assets — owner has a reproduction, mechanism undiagnosed  | FILE    | `bugs-designer.md` | `B-`   | **B-129** | high     | no            |
| external #9            | The ticker separator combo lists every asset, including fonts and videos         | FILE    | `bugs-designer.md` | `B-`   | **B-130** | medium   | no            |
| external #10 + `:1190` | The canvas background colour leaks into the output; output must stay transparent | FILE    | `bugs-designer.md` | `B-`   | **B-131** | on-air   | **yes**       |

## `bugs.md` — `B-` (cross-cutting)

| source      | description                                                                      | verdict | dest      | prefix | number    | severity | design-first? |
| ----------- | -------------------------------------------------------------------------------- | ------- | --------- | ------ | --------- | -------- | ------------- |
| external #5 | The app's UI font loads from a CDN; on a LAN-only or air-gapped machine it hangs | FILE    | `bugs.md` | `B-`   | **B-132** | high     | no            |

## `runtime.md` — `R-` (Runtime work items)

| source            | description                                                                                    | verdict | dest         | prefix | number    | severity | design-first? |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------- | ------------ | ------ | --------- | -------- | ------------- |
| `:195`            | A version/shape marker on the persisted bridge configs — costed, judged its own change         | FILE    | `runtime.md` | `R-`   | **R-036** | medium   | **yes**       |
| `:355`            | `dev-b6-inspector-finish` remainder: §3 `ROTATOR — ITEM 3` schema decision + the §7 split row  | FILE    | `runtime.md` | `R-`   | **R-037** | medium   | **yes**       |
| `:686`            | Three clear-reason Zod enums cannot carry the real error code                                  | FILE    | `runtime.md` | `R-`   | **R-038** | medium   | **yes**       |
| `:1360`           | No E2E covers the scrub DRAG, only `arrowStep`                                                 | FILE    | `runtime.md` | `R-`   | **R-039** | low      | no            |
| `:1420`           | Two same-named sequences render identical Inspector headings — needs a wording decision        | FILE    | `runtime.md` | `R-`   | **R-040** | low      | no            |
| `:1606` + `:2621` | No test on `#`-vs-alias divergence, alias stability, or gap-not-renumber                       | FILE    | `runtime.md` | `R-`   | **R-041** | medium   | no            |
| `:1832`           | `mute-before-ADD` so LOAD can run during rehearse; on 2.5.0 volume must land BEFORE `CG ADD`   | FILE    | `runtime.md` | `R-`   | **R-042** | on-air   | **yes**       |
| `:1891`           | The APASAI mark is an auto-trace of a raster — replace with real vector before release         | FILE    | `runtime.md` | `R-`   | **R-043** | medium   | no            |
| `:2088` + `:2091` | Nothing asserts the migrated dialogs still OPEN, nor that `Cancel` leaves state byte-identical | FILE    | `runtime.md` | `R-`   | **R-044** | medium   | no            |
| `:2107`           | `AWAITING_ROW_REASON` sits with the verbs, not in the shared `reachWording` module             | FILE    | `runtime.md` | `R-`   | **R-045** | low      | no            |
| task §5.3         | The raster residual: a dead `window.innerWidth` fallback, and the `unreadable` silence         | FILE    | `runtime.md` | `R-`   | **R-046** | medium   | no            |
| external #8       | `next` should not be offered on every sequence — keep `NEXT`, disable it, explain in tooltip   | FILE    | `runtime.md` | `R-`   | **R-047** | medium   | **yes**       |

## `designer.md` — `D-` (Designer work items)

| source       | description                                                                                | verdict | dest          | prefix | number    | severity | design-first? |
| ------------ | ------------------------------------------------------------------------------------------ | ------- | ------------- | ------ | --------- | -------- | ------------- |
| external #1  | Brand Pack Factory                                                                         | FILE    | `designer.md` | `D-`   | **D-142** | unrated  | **yes**       |
| external #2  | Designer `.vcg` import                                                                     | FILE    | `designer.md` | `D-`   | **D-143** | unrated  | **yes**       |
| external #6  | The Designer splash never got a `D-` number — retroactive item for shipped work            | FILE    | `designer.md` | `D-`   | **D-144** | low      | no            |
| external #11 | A guide layer: canvas only, absent from preview and export; one predicate, three consumers | FILE    | `designer.md` | `D-`   | **D-145** | unrated  | **yes**       |
| `:2044`      | No in-app about/version surface in either product, though `__CG_BUILD__` is ready          | FILE    | `designer.md` | `D-`   | **D-146** | low      | no            |

## `platform.md` — `P-` (process and tooling rules)

| source  | description                                                                                     | verdict | dest          | prefix | number    | severity | design-first? |
| ------- | ----------------------------------------------------------------------------------------------- | ------- | ------------- | ------ | --------- | -------- | ------------- |
| `:180`  | An item-number claim derives across EVERY ref, never from one branch — generalised (see below)  | FILE    | `platform.md` | `P-`   | **P-022** | medium   | no            |
| `:1456` | A control test that reaches a different implementation than the one under test is not a control | FILE    | `platform.md` | `P-`   | **P-023** | medium   | no            |
| `:1732` | Pattern (twice): an observer effect silently no-ops when its target is absent on first render   | FILE    | `platform.md` | `P-`   | **P-024** | medium   | no            |

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

| source         | why not                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:1295`        | **CLOSE — discharged.** Session 2 measured it: `OUTPUT_FRAME` exists nowhere in code, the raster is channel-derived (`caspar-runtime.ts:3689` → `position.ts:260`). The residual is filed as `R-046`. |
| `:1190`        | **MERGE INTO `B-131`.** Same defect as external #10; its closure claim is scope-limited, see §g.4.                                                                                                    |
| `:2456`        | **MERGE INTO `B-122` + `B-125`.** A bundling row; both halves are already canonical elsewhere.                                                                                                        |
| `:248`, `:409` | **MERGE INTO `B-115`.**                                                                                                                                                                               |
| `:2621`        | **MERGE INTO `R-041`** — and `:1606`'s model is SUPERSEDED by it. See cluster D.                                                                                                                      |
| `:2091`        | **MERGE INTO `R-044`.**                                                                                                                                                                               |
| `:33`          | Process, no number: the §3 refusal E2E is unwritten and a Linux `gate:e2e` is owed. Already on the `DEBT-SWEEP.md` §5 checklist.                                                                      |
| `:2125`        | Process, no number: the `dev-r030` task file's "run after r022" header is stale. A one-line docs fix; the change dir does not exist in `openspec/changes/`.                                           |
| external #4    | **Not a numbered item.** The `tools/` ship boundary (only `caspar-bridge` ships) is an addendum that travels with `prompt-dev-server-install.md`.                                                     |
| external #7    | Process, no number: the OpenSpec spec-delta for the visual layer. Already on the `DEBT-SWEEP.md` §5 checklist.                                                                                        |
| external #12   | **CLOSE — discharged by session 2.** `b-number-registry.md` was stale at `R-029`/`R-030` while the truth was `R-035`; repaired, and the "next free" pointer retired.                                  |
| `DEBT.md:978`  | **CLOSE — discharged.** The census's other UNSURE row. Session 2 measured `listOnly` at `caspar-runtime.ts:1055` and the seven-verb CasparCG gating at `LayersPanel.tsx:179`/`:399`/`:428`.           |

---

# d. Mechanism not diagnosed

These are filed **with their reproduction and an explicit "mechanism unknown" note**. In this
repo a guessed cause has twice sent work chasing a phantom, so no cause is written into any of
them.

| item      | what is known                                                                                             | what is NOT known                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **B-119** | `mute-failed` can only come from an unreachable server, which also makes every slot read `unknown`        | Whether a CONNECTED server ever reported `unknown` — a second defect the rule would mask |
| **B-129** | The owner has a reproduction: JSON save then import loses assets                                          | The mechanism, entirely. Do not guess a cause from the exporter's shape                  |
| **B-130** | The ticker separator combo lists every asset, fonts and videos included                                   | The mechanism — **and the prior question below**                                         |
| **B-131** | The canvas background colour reaches the output; output must be transparent unless a real element says so | Whether `:1190`'s "measured dead" reading covers the non-transparent case (it does not)  |

**`B-130` carries a question that must be answered before anyone "fixes" it.** What happens if
a font or a video **is** selected as a ticker separator? If the answer is _silently nothing_,
there is a worse bug underneath and filtering the picker would hide it. The item must state
this and must not be closed by adding a filter alone.

**`B-131` carries a migration.** Templates that currently hold a non-transparent
`scene.background` will change behaviour **on air**, so the change must be deliberate and
announced. The fix shape is **making the wrong state unrepresentable** — "editor backdrop" and
"authored background" are two facts collapsed into one field — not keeping two values in sync.
That is why it is `design-first: yes`.

**`D-145` carries an open decision.** Does the exporter strip guide layers, or keep them behind
a flag? Keeping them means an older Runtime renders them, so **stripping is the safer default**;
the item states it as a decision, not as settled. Its correctness constraint: three consumers
(canvas, preview, export) means the predicate lives in **one** place — the `positionQuery`
lesson is that the second consumer is what creates drift.

**`R-047` must carry two things explicitly or they will be lost.** (a) R-021 stage-2b says do
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

One batch per destination file. On-air-class items first; `B-131` leads the whole queue per the
task's §6.10. Within a batch, `design-first: yes` items need their OpenSpec change authored
before the PRD item is filed.

| #   | batch                                 | items                                                                               | why here                                                                |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **`bugs-designer.md`** (on-air first) | `B-131`, then `B-127`–`B-130`                                                       | `B-131` is on-air class and first in the queue by instruction           |
| 2   | **`bugs-runtime.md`**                 | `B-120`, `B-121`, `B-122`, `B-125`, `B-126`, then `B-115`–`B-119`, `B-123`, `B-124` | five on-air items lead; the two layout bugs land last                   |
| 3   | **`bugs.md`**                         | `B-132`                                                                             | one cross-cutting deployment defect; independent of both bug batches    |
| 4   | **`runtime.md`**                      | `R-042`, then `R-036`–`R-041`, `R-043`–`R-047`                                      | `R-042` is the on-air ordering constraint; the design-first four follow |
| 5   | **`designer.md`**                     | `D-142`–`D-146`                                                                     | features; three are design-first and gate on their OpenSpec change      |
| 6   | **`platform.md`**                     | `P-022`–`P-024`                                                                     | process rules; no code depends on them, so they land last               |

**Numbers are allocated per prefix, not per batch**, so batch 3 (`B-132`) must not be filed
before batch 1 and 2 have claimed `B-115`–`B-131` — or the numbering will gap. If a batch is
re-ordered, re-derive the whole `B-` run rather than reusing the proposals above.

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

**4. `:1190`'s "measured dead" is TRUE BUT NARROWER THAN IT READS, and `B-131` must say so.**
The entry is not false and must not be filed as if it were. What it actually measured: in the
PVW-white reproduction, `.cg-stage` read `rgba(0, 0, 0, 0)` **and both scenes involved were
authored `background: 'transparent'`**. That establishes the background mechanism was not the
cause **of the PVW white box**. It establishes nothing about a scene authored with a
non-transparent `scene.background`, which is exactly external #10's case — the measurement never
had such a scene in it. So `:1190` closes one question and leaves #10's open. `B-131` must state
this explicitly rather than calling `:1190` wrong.

**5. A FIFTH contradiction the census did not catch — `:1606` against `:2621`.** Both LIVE, and
they assert opposite models of the `#` column versus the default alias. `:2621` is the owner's
final resolution and supersedes `:1606`. Full detail in cluster D above. This one is dangerous
in a way the other four are not: the other four would waste a reader's time, while filing from
`:1606` would commission a **test asserting the superseded invariant**, pinning the wrong model
into the suite as a green assertion.

---

# h. What session 2 measured, carried here so it is not re-derived

**The raster residual (`R-046`) — the task's §5.3 question is ANSWERED, and the answer is
narrower than feared.** The question was whether `RasterMismatchBanner` fires for an _unconfigured_ channel or
only a _declared-but-mismatched_ one.

Measured: `rasterVerdict` (`packages/shared-ipc/src/channels/channelSettings.ts`) returns
`'unconfigured'` only when the channel has **no entry in `state.settings`** — but
`ChannelSettingsStore.hydrate` back-fills **every declared channel** with
`defaultChannelSettings(channel)` (= 1920×1080) at `channel-settings-store.ts:106`. So a
declared-but-never-configured channel does get an entry, its 1920×1080 claim is then compared
against the observed `INFO` reading, and on a real 720p channel that is a **`mismatch` — the
banner fires**. The worst case is covered.

Two real residuals remain, and they are what `R-046` is for:

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
in the code. The defect `DEBT.md:1295` recorded is discharged. The body update rides with
whatever else `R-030` needs and does **not** consume a number.
