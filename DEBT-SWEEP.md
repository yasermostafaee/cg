Censused through DEBT.md:2240

# DEBT-SWEEP.md — a census of `DEBT.md`

Read-only classification of every entry in `DEBT.md` (2707 lines / 179522 bytes, identical on
`origin/main` and `origin/dev`). **Nothing is filed by this pass.** No item numbers are claimed,
no file under `docs/prd/` or `openspec/` is touched.

## The unit of a census row

**One row per `###` heading.** Where a `##` section contains no `###` headings, the unit is one
top-level bullet, anchored at the bullet's own line. A `###` entry that bundles several distinct
debts gets **one** row whose summary names the parts and whose bucket is the strongest demand it
makes, ranked `LIVE > DECISION > PROCESS > DISCHARGED > OBSOLETE > OUT OF SCOPE`; the bundled
parts are expanded in the §5 extractions at the foot of this file, so no part is lost.

## Buckets

`LIVE` · `DISCHARGED` · `OBSOLETE` · `PROCESS` · `DECISION` · `UNSURE`, plus one added class:

**`OUT OF SCOPE`** — the entry is a record, a manifest or a pointer that makes no demand of
anyone. The task grants this treatment explicitly for `## Environment notes`; I extended it to
the handover's narrative subsections rather than parking them in `UNSURE`, because they are not
uncertain — they are simply not debt. Every use carries its reason in the summary. Flagged here
because it is a deviation from the six buckets specified.

**Evidence rule.** `DISCHARGED` and `OBSOLETE` are written only where `DEBT.md` itself says so,
and the `evidence` cell gives the line that says it. No source was read to close any entry.

---

## Lines 1–4 — before the first heading

Title (`# DEBT.md — what fast mode on \`dev\` deferred`) and a horizontal rule. **No entries.**

## DEBT.md:5–113 — `## OVERNIGHT HANDOVER — 2026-08-01`

| line       | summary                                                                     | bucket       | target     | evidence |
| ---------- | --------------------------------------------------------------------------- | ------------ | ---------- | -------- |
| DEBT.md:9  | Manifest of the 8 commits the overnight run pushed to `origin/dev`          | OUT OF SCOPE | —          |          |
| DEBT.md:33 | Two owed: the §3 refusal E2E is unwritten; a Linux `gate:e2e` is owed       | LIVE         | openspec   |          |
| DEBT.md:45 | Pointer only — restates the four AWAITING OWNER items in the next section   | OUT OF SCOPE | —          |          |
| DEBT.md:60 | Gates green on final tree; Windows `gate:e2e` non-authoritative, Linux owed | PROCESS      | —          |          |
| DEBT.md:84 | Eight visual changes across all modal chrome the owner should eyeball first | DECISION     | runtime.md |          |

## DEBT.md:114–177 — `## AWAITING OWNER — 2026-08-01 (overnight run)`

| line        | summary                                                                                   | bucket   | target          | evidence |
| ----------- | ----------------------------------------------------------------------------------------- | -------- | --------------- | -------- |
| DEBT.md:119 | `PRIMARY A` sticks in `connecting`; `emitHealth` collapses 4 FSM states to one dedupe key | LIVE     | bugs-runtime.md |          |
| DEBT.md:139 | Modal `destructive` maps to solid amber, so `Remove` confirms changed colour              | DECISION | runtime.md      |          |
| DEBT.md:150 | `Reset to defaults` (delimiters) promoted from ghost to `destructive`                     | DECISION | runtime.md      |          |
| DEBT.md:157 | `CLEAR` is now gated on the `awaiting` window — narrows an on-air escape hatch            | DECISION | runtime.md      |          |

> Lines 170–174 are a closing paragraph about the file's own purpose, sitting visually under
> `### 4.` but belonging to the file as a whole. Not an entry. It ends "Do not start that
> reconciliation without the owner asking for it" — this sweep **is** that reconciliation.

## DEBT.md:178–1848 — `## Findings to file` (part 1: 178–1143)

| line         | summary                                                                                            | bucket     | target                     | evidence    |
| ------------ | -------------------------------------------------------------------------------------------------- | ---------- | -------------------------- | ----------- |
| DEBT.md:180  | Item-number registry is split across `main`/`dev`; a claim must check both branches                | LIVE       | platform.md (`new P-`)     |             |
| DEBT.md:195  | Version/shape marker on persisted bridge configs — costed, judged an OpenSpec change of its own    | LIVE       | runtime.md (`new R-`)      |             |
| DEBT.md:230  | `delimiters.json` lives in the template dir, so every boot warns a template is corrupt             | LIVE       | bugs-runtime.md (`new B-`) |             |
| DEBT.md:248  | `PRIMARY A` sticks in `connecting`: `emitHealth` dedupe collapses 4 states; connect unbounded      | LIVE       | bugs-runtime.md (`new B-`) |             |
| DEBT.md:355  | `dev-b6-inspector-finish` 7 of 9; §3 `ROTATOR — ITEM 3` needs a schema decision, §7 split row owed | LIVE       | runtime.md                 |             |
| DEBT.md:415  | `dev-modal-primitive` shipped; the §3 in-viewport refusal assertion still needs Playwright         | PROCESS    | openspec                   |             |
| DEBT.md:477  | `dev-awaiting-verbs` shipped; `CLEAR` narrowed during `awaiting` — flagged for the owner           | DECISION   | runtime.md                 |             |
| DEBT.md:555  | `dev-loading-row` shipped; its named follow-up closed by `dev-awaiting-verbs`                      | DISCHARGED | —                          | DEBT.md:598 |
| DEBT.md:602  | `dev-r028-b5` Inspector restyle shipped; `resize: vertical` vs autogrow left to reconcile          | DECISION   | runtime.md                 |             |
| DEBT.md:686  | `dev-offline-polish` all eight done; three clear-reason Zod enums still can't carry the real code  | LIVE       | runtime.md                 |             |
| DEBT.md:796  | Reachability gate disabled the whole console in TEST MODE; fix landed, wants filing as a class     | LIVE       | bugs-runtime.md (`new B-`) |             |
| DEBT.md:836  | `dev-offline-ux` v8 — §1a and §3–§9 not started                                                    | OBSOLETE   | —                          | DEBT.md:688 |
| DEBT.md:892  | `dev-offline-ux` v3 — §2, §3, §6–§10 not started                                                   | OBSOLETE   | —                          | DEBT.md:688 |
| DEBT.md:936  | `dev-list-vs-layer` v3 — §5–§8 not started, incl. the seven-verb CasparCG gating                   | LIVE       | openspec                   |             |
| DEBT.md:978  | `dev-list-vs-layer` (earlier version) — §2–§6 not started                                          | UNSURE     | openspec                   |             |
| DEBT.md:1012 | `MIXER VOLUME` is never refused; `enterRehearse` must stop reporting a flat `mute-failed`          | LIVE       | bugs-runtime.md (`new B-`) |             |
| DEBT.md:1048 | Whether `unknown` had a connected server is inferred, not measured; needs one owner observation    | LIVE       | bugs-runtime.md            |             |
| DEBT.md:1064 | `PLAY` is enabled on a bound row whose template has left the registry — the take fails at air time | LIVE       | bugs-runtime.md (`new B-`) |             |
| DEBT.md:1104 | `CG ADD` site 2 (reconnect reconciliation) is not rehearse-guarded — re-ADDs unmuted               | LIVE       | bugs-runtime.md (`new B-`) |             |

**On DEBT.md:836 and DEBT.md:892 — the only two rows in this census closed by a later entry.**
Both are `dev-offline-ux` version entries listing unstarted sections. DEBT.md:688, inside the
`dev-offline-polish` entry, states: "`dev-offline-ux` is CLOSED and superseded; discard every
version of it." That is `DEBT.md` correcting itself in place, which is what the evidence rule
requires. DEBT.md:978 is **not** covered by it — it is `dev-list-vs-layer`, a different change,
and nothing in the file supersedes it, so it stays UNSURE rather than being swept along.

## DEBT.md:178–1848 — `## Findings to file` (part 2: 1144–1848)

Two rows below are anchored inside a `###` entry rather than at its heading, breaking the
one-row-per-heading rule deliberately. Both are flagged `(sub)` and both are justified in the
note that follows the table.

| line                   | summary                                                                                            | bucket     | target                      | evidence     |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ---------- | --------------------------- | ------------ |
| DEBT.md:1144           | The PVW white 16:9 area was an opaque canvas forced by a `color-scheme` mismatch — fixed           | DISCHARGED | —                           | DEBT.md:1146 |
| DEBT.md:1190 **(sub)** | Claims the `scene.background` → `.cg-stage` cause is "measured dead" — the owner says it is not    | LIVE       | bugs-designer.md (`new D-`) |              |
| DEBT.md:1213           | PVW composite + position override fixed; per-row transport left as an open design question         | DECISION   | runtime.md                  |              |
| DEBT.md:1251           | `dev-r028-b5` was not started                                                                      | OBSOLETE   | —                           | DEBT.md:602  |
| DEBT.md:1277           | Chain stopped: `dev-r022-rehearse` and `dev-r030-channel-raster` never started                     | OBSOLETE   | —                           | DEBT.md:1254 |
| DEBT.md:1295           | Non-1080 channels mis-place every graphic — `OUTPUT_FRAME` hardcoded 1920×1080                     | LIVE       | bugs-runtime.md (`new B-`)  |              |
| DEBT.md:1321           | Flake: Designer multi-select group-drag spec times out under a loaded gate                         | LIVE       | bugs-designer.md (`new D-`) |              |
| DEBT.md:1343           | Flake: Designer VP8+alpha seek-fragile canvas test hits a decode error                             | LIVE       | bugs-designer.md (`new D-`) |              |
| DEBT.md:1360           | Owner UI review batch shipped; no E2E covers the scrub DRAG, only `arrowStep`                      | LIVE       | runtime.md                  |              |
| DEBT.md:1388           | `--verb`'s `width:100%` stretched Inspector icon buttons to 286px — fixed via a third shape        | DISCHARGED | —                           | DEBT.md:1400 |
| DEBT.md:1420           | Two same-named sequences render identical Inspector headings; needs a wording decision             | LIVE       | runtime.md                  |              |
| DEBT.md:1442           | `Reload` and `Grant access` are still accent-coloured affordances                                  | DECISION   | runtime.md                  |              |
| DEBT.md:1456           | VOID notice + the lesson: a control test reaching a different implementation is not a control test | LIVE       | platform.md (`new P-`)      |              |
| DEBT.md:1479           | "CasparCG 2.5.0 cannot load our templates" — wrong; CEF was dead in that instance                  | OBSOLETE   | —                           | DEBT.md:1456 |
| DEBT.md:1531 **(sub)** | Adopt-`CLEAR` succeeded, `CG ADD` failed, layer left empty — B-100 shape by a new route            | UNSURE     | bugs-runtime.md             |              |
| DEBT.md:1539           | `CLEAR ALL` filters on the very statuses that may be wrong — reports success having sent nothing   | LIVE       | bugs-runtime.md (`new B-`)  |              |
| DEBT.md:1569           | R-006 and B-087 still say air is "red"; air is now green — PRD re-wording owed                     | PROCESS    | runtime.md                  |              |
| DEBT.md:1606           | `#` and the default alias share one number; the gap-not-renumber property has no test              | LIVE       | runtime.md                  |              |
| DEBT.md:1618           | `B-113`, `B-114`, `R-034` claimed on `dev`; all three still owe a full-ref verification            | PROCESS    | —                           |              |
| DEBT.md:1641           | Description column could drop the wire's own report at 1280px — fixed via the state-cell tooltip   | DISCHARGED | —                           | DEBT.md:1656 |
| DEBT.md:1665           | The LOAD/REMOVE toggle cannot be named by one column header word                                   | DECISION   | runtime.md                  |              |
| DEBT.md:1678           | Bulk verbs in the Layers header keep their colour while row verbs went neutral                     | DECISION   | runtime.md                  |              |
| DEBT.md:1687           | Retired `M0–M12` milestone references — visible copy fixed, a comment sweep still owed             | PROCESS    | —                           |              |
| DEBT.md:1700           | PREVIEW and PROGRAM are empty for different reasons — now encoded per panel                        | DISCHARGED | —                           | DEBT.md:1709 |
| DEBT.md:1714           | `FailoverBanner` is `position: fixed` and overlays the monitor strip                               | LIVE       | bugs-runtime.md (`new B-`)  |              |
| DEBT.md:1722           | `clampInspector`'s `MIN_WORKSPACE_PX` ignores ~54px of shell chrome                                | LIVE       | bugs-runtime.md (`new B-`)  |              |
| DEBT.md:1732           | Pattern (2 occurrences): an observer effect silently no-ops when its target is absent              | LIVE       | platform.md (`new P-`)      |              |
| DEBT.md:1762           | A panel fullscreen round-trip destroyed unapplied drafts — closed by `dev-draft-loss`              | DISCHARGED | —                           | DEBT.md:1762 |
| DEBT.md:1800           | The draft-loss diagnosis as first written                                                          | OBSOLETE   | —                           | DEBT.md:1800 |
| DEBT.md:1832           | `mute-before-ADD` upgrade deferred; on 2.5.0 the volume must land before the `CG ADD`              | LIVE       | runtime.md (`new R-`)       |              |

### Why the two sub-rows exist

**DEBT.md:1190 — this is the entry §3 of the task warned about, and it is not what the task
expected to find.** The task describes "a note from the PVW investigation observing that
`buildScene` paints a background on `.cg-stage` whenever `scene.background !== 'transparent'`",
to be classified LIVE. **No such note exists in `DEBT.md`.** The string `buildScene` appears
nowhere in the file (0 hits, case-insensitive); `scene.background` appears exactly once, at
DEBT.md:1191. What survives is not the observation but its **closure**: DEBT.md:1190–1193 says
the two candidate causes "are both DEAD, and were measured dead". The note was removed and
replaced by a claim that its mechanism is dead. Per §3 — the owner has independently confirmed a
live defect with that mechanism candidate — the row is LIVE, and the closure claim at
DEBT.md:1190 is the thing that must not be trusted.

**DEBT.md:1531 — the void at DEBT.md:1456 may not cover it.** DEBT.md:1481 voids the 2.5.0
entry's "conclusion and its recommendation". DEBT.md:1531 is neither: it is a separate
observation from the same log — the adopt-`CLEAR` committed and the `CG ADD` after it failed,
leaving layer 71 empty — explicitly labelled "worth its own item". Whether the void reaches it
cannot be settled from `DEBT.md`, so it is UNSURE rather than swept into the OBSOLETE parent.

## DEBT.md:1849–1960 — `## R-035 SPLASH — the readout and the visual layer`

| line         | summary                                                                                      | bucket   | target                | evidence |
| ------------ | -------------------------------------------------------------------------------------------- | -------- | --------------------- | -------- |
| DEBT.md:1855 | No `pnpm gate`, no E2E run, no Linux `gate:e2e`, no OpenSpec spec-delta for the visual layer | PROCESS  | openspec              |          |
| DEBT.md:1891 | The APASAI mark is an auto-trace of a raster — replace with real vector before release       | LIVE     | runtime.md (`new R-`) |          |
| DEBT.md:1904 | Nine splash decisions taken fast (token choices, `scaleX` rail, foot inset, glow repoint)    | DECISION | runtime.md            |          |
| DEBT.md:1949 | The entrance rests at ~2.05 s, past the 1.6 s intent; a warm reload never shows it settled   | DECISION | runtime.md            |          |

## DEBT.md:1961–2072 — `## DESIGNER SPLASH + the shared splash kit`

| line         | summary                                                                                        | bucket     | target                 | evidence     |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------- | ---------------------- | ------------ |
| DEBT.md:1967 | No `D-` number, no PRD entry, no OpenSpec change dir, no `pnpm gate`; Linux `gate:e2e` owed    | PROCESS    | designer.md (`new D-`) |              |
| DEBT.md:1986 | Six Designer-splash decisions taken fast (dropped phase label, source exports, floors, coral)  | DECISION   | designer.md            |              |
| DEBT.md:2019 | Two Runtime splash E2E specs were faults in the specs; both repaired, no product code touched  | DISCHARGED | —                      | DEBT.md:2041 |
| DEBT.md:2044 | No in-app about/version surface in either product, though `__CG_BUILD__` is ready for one      | LIVE       | designer.md            |              |
| DEBT.md:2049 | Both products hold 8000 ms cold / 3000 ms warm; the `Esc`-to-skip door is agreed but not built | DECISION   | runtime.md             |              |

## DEBT.md:2073–2240 — `## Skipped process`

This section has **no `###` headings**: it is bold group labels over bullet lists, so per the
stated rule each top-level bullet is one entry. That makes it denser than a `###`-structured
section carrying the same weight of debt — the asymmetry is a consequence of applying one rule
consistently, not of treating this section differently.

**`dev-modal-primitive`:**

| line         | summary                                                                                 | bucket  | target     | evidence |
| ------------ | --------------------------------------------------------------------------------------- | ------- | ---------- | -------- |
| DEBT.md:2079 | No OpenSpec artifacts and no PRD item for the `Modal` contract and five changed dialogs | PROCESS | openspec   |          |
| DEBT.md:2082 | The §3 in-viewport E2E is owed (`toBeInViewport`); a Linux `gate:e2e` owed regardless   | PROCESS | openspec   |          |
| DEBT.md:2088 | Nothing asserts the migrated dialogs still OPEN from their real entry points            | LIVE    | runtime.md |          |
| DEBT.md:2091 | `Cancel` leaving state byte-identical is asserted only for the config dialog            | LIVE    | runtime.md |          |

**`dev-awaiting-verbs`:**

| line         | summary                                                                                              | bucket  | target     | evidence |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------- | ---------- | -------- |
| DEBT.md:2098 | No OpenSpec artifacts, no PRD item; the `awaiting` row state and `CLEAR`'s narrowing are spec-worthy | PROCESS | openspec   |          |
| DEBT.md:2102 | No E2E spec added (the window is not holdable at that layer); Linux `gate:e2e` owed                  | PROCESS | openspec   |          |
| DEBT.md:2107 | `AWAITING_ROW_REASON` sits with the verbs, not in the shared `reachWording` module                   | LIVE    | runtime.md |          |

**`dev-r030-channel-raster` + `dev-r022-rehearse`:**

| line         | summary                                                                             | bucket       | target   | evidence    |
| ------------ | ----------------------------------------------------------------------------------- | ------------ | -------- | ----------- |
| DEBT.md:2114 | No OpenSpec artifacts for either; `R-030`/`R-022` not flipped to `[~]`              | PROCESS      | openspec |             |
| DEBT.md:2118 | Records that `pnpm gate` WAS run uncached and green — explicitly not a skipped item | OUT OF SCOPE | —        |             |
| DEBT.md:2120 | `gate:e2e` not run; Linux owed for both; no E2E spec written for either             | PROCESS      | openspec |             |
| DEBT.md:2125 | The `dev-r030` task file's "run after r022" header is stale — the order was flipped | LIVE         | openspec |             |
| DEBT.md:2131 | `dev-r028-b5` was not started                                                       | OBSOLETE     | —        | DEBT.md:602 |

**Nothing in either feature is verified on air:**

| line         | summary                                                                                   | bucket  | target    | evidence |
| ------------ | ----------------------------------------------------------------------------------------- | ------- | --------- | -------- |
| DEBT.md:2135 | r030 — a 720p channel is the useful manual check; scale maths seen only in unit tests     | PROCESS | caspar.md |          |
| DEBT.md:2141 | r030 — the video-mode read is confirmed against the mock's `INFO` stub, never real `INFO` | PROCESS | caspar.md |          |
| DEBT.md:2147 | r022 — `MIXER … VOLUME` has never been sent to this plant; unvalidated on 2.3.2           | PROCESS | caspar.md |          |
| DEBT.md:2152 | r022 — the 2.5.0 premise behind the mute is inherited from earlier recon, not re-measured | PROCESS | caspar.md |          |

**b4 (the Inspector task):**

| line         | summary                                                                                      | bucket       | target   | evidence |
| ------------ | -------------------------------------------------------------------------------------------- | ------------ | -------- | -------- |
| DEBT.md:2158 | No `pnpm gate` — affected workspaces' own tasks only, no uncached cross-workspace run        | PROCESS      | —        |          |
| DEBT.md:2164 | E2E run and green on Windows (superseding "not run at all"); Linux still owed                | PROCESS      | —        |          |
| DEBT.md:2174 | Item 6 asserted in jsdom, which has no bidi engine — needs a real browser or the owner's eye | PROCESS      | —        |          |
| DEBT.md:2179 | No OpenSpec, no PRD edits, no numbers; the R-028 spec no longer describes the Inspector      | PROCESS      | openspec |          |
| DEBT.md:2181 | Engine doc-sync not done for `AutoGrowTextarea` and `editorTextDirection`                    | PROCESS      | —        |          |
| DEBT.md:2183 | Records that the hardware/adversarial requirement did not fire for b4 — not a debt           | OUT OF SCOPE | —        |          |

**`dev-clear-bank-scoped`:**

| line         | summary                                                                                     | bucket  | target                     | evidence |
| ------------ | ------------------------------------------------------------------------------------------- | ------- | -------------------------- | -------- |
| DEBT.md:2190 | No `pnpm gate` — affected workspaces' own tasks only                                        | PROCESS | —                          |          |
| DEBT.md:2194 | E2E run and green on Windows; Linux still owed                                              | PROCESS | —                          |          |
| DEBT.md:2202 | Not verifiable on air from this machine — the whole point is a real `CLEAR` to a real layer | PROCESS | caspar.md                  |          |
| DEBT.md:2207 | The bound-row race seam is left open — "worth filing as an item"                            | LIVE    | bugs-runtime.md (`new B-`) |          |
| DEBT.md:2209 | No OpenSpec, no PRD edit, no number for the new capability or the new channel               | PROCESS | openspec                   |          |

**Earlier tasks (b3 and before):**

| line         | summary                                                                                 | bucket  | target    | evidence |
| ------------ | --------------------------------------------------------------------------------------- | ------- | --------- | -------- |
| DEBT.md:2214 | No `pnpm gate` — affected workspace's own tasks only                                    | PROCESS | —         |          |
| DEBT.md:2219 | E2E run and green on Windows; Linux still owed                                          | PROCESS | —         |          |
| DEBT.md:2227 | No OpenSpec anything; the R-028 spec describes a row that no longer exists in that form | PROCESS | openspec  |          |
| DEBT.md:2230 | No PR, no merge, no branch cleanup, no archive                                          | PROCESS | —         |          |
| DEBT.md:2231 | No `docs/prd/*` edits and no numbers claimed for 13 items plus the findings             | PROCESS | —         |          |
| DEBT.md:2233 | Engine doc-sync not done for `Panel`, `Tooltip` and the `layerTable` column model       | PROCESS | —         |          |
| DEBT.md:2235 | No hardware verification of on-air behaviour — nothing could be put on air at all       | PROCESS | caspar.md |          |
