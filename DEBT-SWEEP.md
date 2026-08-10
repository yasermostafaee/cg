Censused through DEBT.md:2707 — complete.

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

| line         | summary                                                                                 | bucket  | target     | evidence                                                                            |
| ------------ | --------------------------------------------------------------------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------- |
| DEBT.md:2079 | No OpenSpec artifacts and no PRD item for the `Modal` contract and five changed dialogs | PROCESS | openspec   |                                                                                     |
| DEBT.md:2082 | ~~The §3 in-viewport E2E is owed (`toBeInViewport`)~~ — **DISCHARGED 2026-08-10**       | PROCESS | openspec   | `apps/runtime/tests/e2e/modal-message-in-viewport.spec.ts`; CI run cited in DEBT.md |
| DEBT.md:2088 | Nothing asserts the migrated dialogs still OPEN from their real entry points            | LIVE    | runtime.md |                                                                                     |
| DEBT.md:2091 | `Cancel` leaving state byte-identical is asserted only for the config dialog            | LIVE    | runtime.md |                                                                                     |

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

## DEBT.md:2241–2687 — `## Decisions taken fast`

| line         | summary                                                                                          | bucket       | target                     | evidence     |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------ | -------------------------- | ------------ |
| DEBT.md:2243 | `awaiting` shows LOAD disabled; the notice strip reserves height; `linkDown` outranks `awaiting` | DECISION     | runtime.md                 |              |
| DEBT.md:2260 | Nothing writes the authored position; the byte-identical test would assert nothing               | DECISION     | runtime.md                 |              |
| DEBT.md:2297 | The mute is `MIXER VOLUME 0` and the producer stays; CLEAR-then-re-ADD rejected                  | DECISION     | runtime.md                 |              |
| DEBT.md:2312 | REHEARSE is violet — green, sky, amber and red each ruled out for a stated reason                | DECISION     | runtime.md                 |              |
| DEBT.md:2325 | Wide vs compact field rows decided by field KIND, not width alone                                | DECISION     | runtime.md                 |              |
| DEBT.md:2342 | The container query is on the panel, not the viewport — a media query answers wrongly            | DECISION     | runtime.md                 |              |
| DEBT.md:2352 | Auto-grow textareas carry no resize handle; raise the ~200px cap instead                         | DECISION     | runtime.md                 |              |
| DEBT.md:2359 | The drag handle is `aria-hidden`; the ↑/↓ buttons are the accessible path                        | DECISION     | runtime.md                 |              |
| DEBT.md:2367 | The sequence label was fixed in `@cg/shared-schema`, so the Designer's wording moved too         | DECISION     | designer.md                |              |
| DEBT.md:2380 | The real layer number stays on the row as a secondary column — a softening of task 4.2           | DECISION     | runtime.md                 |              |
| DEBT.md:2395 | Row `#` counts from the top of the displayed list, which is descending layer order               | DECISION     | runtime.md                 |              |
| DEBT.md:2402 | Template name and description became droppable columns, not text stacked under the alias         | DECISION     | runtime.md                 |              |
| DEBT.md:2412 | Verbs are icon-only at every width, not only when narrow                                         | DECISION     | runtime.md                 |              |
| DEBT.md:2421 | The channel tab strip renders even with one channel, costing ~28px                               | DECISION     | runtime.md                 |              |
| DEBT.md:2428 | `Panel` outside its provider degrades rather than throws — a throw would blank the console       | DECISION     | runtime.md                 |              |
| DEBT.md:2438 | PGM/PVW placement is not RTL-flipped — it follows the hardware convention                        | DECISION     | runtime.md                 |              |
| DEBT.md:2444 | Two tests re-expressed onto `data-row-state` rather than loosened                                | DECISION     | runtime.md                 |              |
| DEBT.md:2456 | `dev-clear-bank-scoped` shipped; the bound-row race seam and `clearAll` are both left open       | LIVE         | bugs-runtime.md (`new B-`) |              |
| DEBT.md:2603 | CLEAR is disabled on a genuinely unbound row — "the interim state, not the intent"               | OBSOLETE     | —                          | DEBT.md:2486 |
| DEBT.md:2621 | `#` and the default alias diverge on a non-contiguous tick set; neither property has a test      | LIVE         | runtime.md                 |              |
| DEBT.md:2640 | The bank moved to 70–99 and `logo-bug` to 40–49; owner re-scoped it as NOT a hardware debt       | DECISION     | runtime.md                 |              |
| DEBT.md:2679 | Records that the code landed as one commit because the pieces are mutually dependent             | OUT OF SCOPE | —                          |              |

## DEBT.md:2688–2707 — `## Environment notes (this machine, not debt)`

Read in full. The section's self-declaration holds: all four bullets describe the state of the
owner's own machine (`~/.cg-runtime/` bridge config, a rebuilt `dist/`, a stale bridge holding
port 5280), not the product. Recorded as one row per §7 rather than skipped.

| line         | summary                                                                                                  | bucket       | target | evidence |
| ------------ | -------------------------------------------------------------------------------------------------------- | ------------ | ------ | -------- |
| DEBT.md:2688 | Four machine-local notes: stored aliases, the created bank file, the bridge rebuild, a stale port holder | OUT OF SCOPE | —      |          |

> **One thing inside it is an owner action, not just a note.** DEBT.md:2690 records that the
> saved aliases on this machine now contradict the `#` column (layer 70 is stored as `Layer 1`
> but displays as `#4`), deliberately not rewritten because it is the owner's own config. The
> remedy is in the file: open Configure, clear the four Name fields, Apply. It is carried into
> the checklist below so it is not lost behind the section's out-of-scope marking.

---

# The three extractions

## Skipped process — checklist

Deduplicated, as commands and steps. Sources include non-PROCESS rows whose bundled parts are
process debts, so nothing is lost to the strongest-demand rule.

**Gates to run**

- [ ] `pnpm gate` — never run uncached across the workspace for: R-035 splash (DEBT.md:1857),
      the Designer splash + splash kit (DEBT.md:1983), b4 (DEBT.md:2158), `dev-clear-bank-scoped`
      (DEBT.md:2190), b3 and earlier (DEBT.md:2214).
- [ ] `pnpm gate:e2e` **on Linux/WSL** — owed, and **not discharged by any Windows run**, for:
      the overnight modal work (DEBT.md:42, DEBT.md:2087), `dev-awaiting-verbs` (DEBT.md:2105),
      r022 and r030 (DEBT.md:2120), R-035 splash (DEBT.md:1864), the Designer splash
      (DEBT.md:1981), b4 (DEBT.md:2172), `dev-clear-bank-scoped` (DEBT.md:2194), b3 and earlier
      (DEBT.md:2219).
- [ ] `pnpm gate:e2e` **on Windows** — not yet run at all for r022/r030 (DEBT.md:2120), and the
      R-035 splash specs were edited but never executed (DEBT.md:1860).
- [ ] Suite-timing measurement for both splash runs (DEBT.md:1860, DEBT.md:1983).

**OpenSpec**

- [ ] `pnpm openspec validate --all --strict` — never run for the splash work (DEBT.md:1871) or
      the Designer splash (DEBT.md:1975).
- [ ] Reconcile the spec-delta in `openspec/changes/runtime-splash-screen/` — its `spec.md`,
      `design.md` and `tasks.md` still describe the step counter and the placeholder brand slot
      (DEBT.md:1867).
- [ ] Author change artifacts that do not exist at all: `dev-modal-primitive` (DEBT.md:2079),
      `dev-awaiting-verbs` (DEBT.md:2098), `dev-r030-channel-raster` and `dev-r022-rehearse`
      (DEBT.md:2114), the Designer splash + splash kit (DEBT.md:1975), `dev-clear-bank-scoped`'s
      new capability and channel (DEBT.md:2209), b4 (DEBT.md:2179), b3 and earlier (DEBT.md:2227).
- [ ] Flip `R-030` and `R-022` in `docs/prd/runtime.md` to `[~]` (DEBT.md:2114).
- [ ] Correct the stale header in the `dev-r030-channel-raster` task file — it says "run after
      `dev-r022-rehearse`" and the order was flipped (DEBT.md:2125).
- [ ] **No archive is pending.** No change directory named in `DEBT.md` is described as ready to
      archive; every one of them is owed authoring first.

**Tests owed**

- [x] Write the §3 in-viewport refusal assertion with Playwright's `toBeInViewport()` against a
      scrolled `Candidate layers` list (DEBT.md:2082, DEBT.md:38).
      **DISCHARGED 2026-08-10:** `apps/runtime/tests/e2e/modal-message-in-viewport.spec.ts`.
      Driven against `Live sources` rather than `Candidate layers` — the offline mock's
      `setFixedLayers` accepts everything and no shared fixed-layers validator exists to
      refuse with, whereas `Live sources` refuses through `checkSourceMappings`, the same
      validator the bridge runs. Same primitive, same mechanism, and its body genuinely
      overflows (asserted). Includes a negative control: the last element inside the
      scrolled body — where the refusal used to be appended — is asserted OUT of the
      viewport at the same scroll position, so the check can fail. Verified red against the
      reintroduced in-body placement.
- [ ] Assert the migrated dialogs still open from their real entry points (DEBT.md:2088).
- [ ] Assert `Cancel` leaves state byte-identical for the destructive dialogs, not only the
      config dialog (DEBT.md:2091).
- [ ] E2E on the scrub DRAG, not only `arrowStep` (DEBT.md:1383).
- [ ] Tests for `#`-vs-alias divergence and alias stability (DEBT.md:2638), and for the
      gap-not-renumber property (DEBT.md:1615).

**Verification and reconciliation**

- [x] Verify `B-113`, `B-114` and `R-034` against `origin/main` and **every ref**
      (`git for-each-ref` plus the `docs/prd/*` files on `main`) — DEBT.md:1625.
      **DISCHARGED 2026-08-02 (session 2):** all three are real, unique headings and carry
      IDENTICAL titles on every one of the 10 refs that has them — `B-113`
      `bugs-runtime.md:2451`, `B-114` `:2494`, `R-034` `runtime.md:1357`. No competing claim.
- [ ] Re-word `R-006` and `B-087` in `docs/prd/*` to name the air colour by role, not by hue, and
      audit the surface for reds that no longer mean danger (DEBT.md:1583).
- [ ] Sweep the source for remaining retired `M<n>` milestone references (DEBT.md:1697).
- [ ] Engine doc-sync for `AutoGrowTextarea` + `editorTextDirection` (DEBT.md:2181) and for
      `Panel`, `Tooltip` and the `layerTable` column model (DEBT.md:2233).
- [ ] Owner action on this machine: open Configure, clear the four Name fields, Apply — so the
      stored aliases stop contradicting the `#` column (DEBT.md:2690).

**Hardware — needs a CasparCG this session cannot reach**

- [ ] Configure a 720p5000 channel and confirm proportional placement (DEBT.md:2135).
- [ ] Confirm `parseVideoModeFromInfo` against real `INFO` XML, not the mock stub (DEBT.md:2141).
- [ ] Confirm `MIXER … VOLUME` is accepted on real 2.3.2 — never sent to this plant
      (DEBT.md:2147); the 2.5.0 mute premise is inherited, not re-measured (DEBT.md:2152).
- [ ] Verify a real `CLEAR` reaches a real layer for `dev-clear-bank-scoped` (DEBT.md:2202), and
      an end-to-end load/take/update/stop/clear for b3 and earlier (DEBT.md:2235).
- [ ] Run the ten-second `PRIMARY A` diagnostic: with the pill stuck on CONNECTING, refresh the
      browser. Word changes → publish bug; word stays → a real connect problem (DEBT.md:331).
- [ ] Observe whether the link indicator read LIVE when `unknown` was seen — the one observation
      that separates a display bug from a second defect (DEBT.md:1061).

**Not process — recorded so it is not mistaken for it**

- `pnpm gate` **was** run uncached and green for r030 and r022 (DEBT.md:2118) and for the
  overnight run's final tree (DEBT.md:64). `pnpm gate:e2e` **was** run and is green on Windows
  for b4, `dev-clear-bank-scoped`, b3-and-earlier and the overnight run.

## Decisions awaiting ratification

The four `## AWAITING OWNER` items are folded in first, as §5.2 requires.

| #   | decision                                                                                                     | what changes if the owner reverses it                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`PRIMARY A` stuck in `connecting`** — diagnosed as a publish bug, deliberately not fixed (DEBT.md:119)     | Authorising the fix touches connection-health publishing and reconnect timing on a live playout link. Leaving it means the pill goes on lying about a normal reconnect loop.                                                                                                                  |
| 2   | **Modal `destructive` → solid amber** (DEBT.md:139)                                                          | Reverting to the red outline makes `Remove` a weaker signal than `Clear all`. Keeping red as a distinct data-destroying role is a fourth role — one line in `ROLE_VARIANT`.                                                                                                                   |
| 3   | **`Reset to defaults` is `destructive`** (DEBT.md:150)                                                       | `cancel` is the other defensible role; it is a config reset, not an on-air act. One line in `DelimitersModal`.                                                                                                                                                                                |
| 4   | **`CLEAR` held during the `awaiting` window** (DEBT.md:157)                                                  | Reversing re-opens the guess between `stack.out` and `clearLayer` with no itemId — which can clear a layer out from under a live item. Keeping it narrows an on-air escape hatch.                                                                                                             |
| 5   | **Eight visible changes to modal chrome, app-wide** (DEBT.md:84)                                             | The owner's eyes are the acceptance. The reserved ~1.65rem strip above the Layers table is the one permanent change to the most-used panel.                                                                                                                                                   |
| 6   | **`resize: vertical` was not followed from the Inspector mock** (DEBT.md:646)                                | Either amend the mock to accept autogrow, or make a drag pin the height and disable autogrow for that item — the second is a behaviour change.                                                                                                                                                |
| 7   | **PVW transport drives every rehearsing frame, not the selected one** (DEBT.md:1245)                         | Per-row transport is a real design question, not a tweak: judging whether two graphics collide requires running them together.                                                                                                                                                                |
| 8   | **`Reload` and `Grant access` stay accent-coloured** (DEBT.md:1442)                                          | One `variant` word per button. `Grant access` only appears in an attention state, so its accent is arguably state-adjacent.                                                                                                                                                                   |
| 9   | **The LOAD/REMOVE column header reads `LOAD`** (DEBT.md:1665)                                                | The alternatives are two columns (costs 44px, re-introduces an appearing/disappearing control) or a header word that changes with the rows.                                                                                                                                                   |
| 10  | **Bulk verbs keep their colour while row verbs went neutral** (DEBT.md:1678)                                 | A `variant` change per button. They are rare, bulk and destructive, and there is one of each rather than one per row.                                                                                                                                                                         |
| 11  | **Nine R-035 splash decisions** (DEBT.md:1904)                                                               | Notably `--r-success` over the task's `#34d399`, a `scaleX` rail, the foot at 18px, and `--r-splash-glow` repointed to brand blue. Each is one value.                                                                                                                                         |
| 12  | **The splash entrance rests at ~2.05 s, past the 1.6 s intent** (DEBT.md:1949)                               | Two `animation-delay` values would compress the stagger; the author judged that it would make the entrance feel rushed.                                                                                                                                                                       |
| 13  | **Six Designer-splash decisions** (DEBT.md:1986)                                                             | Notably `LOADING PROJECTS` dropped for `STARTING INTERFACE`, source-not-`dist` exports, and the coral kept because the Designer is not an air surface.                                                                                                                                        |
| 14  | **Both products hold 8000 ms cold / 3000 ms warm** (DEBT.md:2049)                                            | Already owner-confirmed. The reservation on record: a Runtime cold start is also a recovery path, so the eight seconds are sometimes paid at the least calm moment there is. The agreed remedy is an `Esc`-to-skip door — **not built, and the floor must not be quietly shortened instead**. |
| 15  | **`awaiting` shows LOAD disabled; the strip reserves height; `linkDown` outranks `awaiting`** (DEBT.md:2243) | Each reversible in about one line.                                                                                                                                                                                                                                                            |
| 16  | **The mute is `MIXER VOLUME 0` and the producer stays** (DEBT.md:2297)                                       | Owner decision, recorded. CLEAR-then-re-ADD is the rejected alternative and has a known field failure.                                                                                                                                                                                        |
| 17  | **REHEARSE is violet** (DEBT.md:2312)                                                                        | Green, sky, amber and red were each ruled out for a stated reason; violet is new to the state vocabulary on purpose.                                                                                                                                                                          |
| 18  | **Seven b4 layout / a11y decisions** (DEBT.md:2325, 2342, 2352, 2359, 2367, 2380, 2395)                      | Field-kind row layout, the panel container query, no resize handle, the `aria-hidden` grip, the source-level sequence label (which moved the Designer's wording too), the layer number staying on the row, and row `#` counting from the top.                                                 |
| 19  | **Four Layers-table decisions** (DEBT.md:2402, 2412, 2421, 2438)                                             | Name/description as droppable columns, icon-only verbs at every width, the tab strip with one channel, and PGM/PVW not RTL-flipped.                                                                                                                                                           |
| 20  | **`Panel` degrades rather than throws outside its provider** (DEBT.md:2428)                                  | The reversal traded "one button absent" for "the operator's whole surface blank".                                                                                                                                                                                                             |
| 21  | **Two tests re-expressed onto `data-row-state`** (DEBT.md:2444)                                              | Asserting the role rather than a hex is the more durable form — and is exactly why the suite stayed green through the red→green air-colour change (DEBT.md:1578).                                                                                                                             |
| 22  | **The bank is 70–99 and `logo-bug` moved to 40–49** (DEBT.md:2640)                                           | Owner has re-scoped this as **not** a hardware debt: the operator picks the row, so a template type's range no longer decides where a logo lands.                                                                                                                                             |

## Numbers claimed during fast mode

Every `B-`/`C-`/`D-`/`P-`/`R-` identifier appearing anywhere in `DEBT.md`, as found. Nothing
here is verified against any registry — that is the next session's job.

| id        | occurrences | lines                                         |
| --------- | ----------- | --------------------------------------------- |
| B-039     | 6           | 515, 729, 1070, 1113, 2486, 2596              |
| B-044     | 1           | 715                                           |
| B-046     | 1           | 282                                           |
| B-070     | 1           | 1081                                          |
| B-073     | 2           | 1336, 1337                                    |
| B-080     | 1           | 328                                           |
| B-087     | 4           | 1569, 1574, 1583, 2450                        |
| B-092     | 1           | 546                                           |
| B-093     | 1           | 716                                           |
| B-094     | 1           | 1643                                          |
| B-098     | 2           | 1336, 1338                                    |
| B-100     | 5           | 347, 905, 987, 1238, 1534                     |
| B-101     | 2           | 347, 885                                      |
| **B-113** | 1           | 1620                                          |
| **B-114** | 1           | 1620                                          |
| C-016     | 2           | 1692, 1707                                    |
| C-018     | 1           | 1305                                          |
| D-054     | 1           | 1323                                          |
| D-083     | 2           | 395, 401                                      |
| R-001     | 1           | 1636                                          |
| R-006     | 8           | 802, 816, 828, 1569, 1574, 1583, 1592, 2449   |
| R-009     | 1           | 2614                                          |
| R-011     | 2           | 1318, 2269                                    |
| R-022     | 3           | 1116, 1703, 2115                              |
| R-028     | 7           | 1003, 1070, 1079, 2179, 2228, 2668            |
| R-029     | 3           | 909, 1840, 2302                               |
| R-030     | 5           | 1228, 1629, 1873, 2114, 2281                  |
| R-031     | 10          | 189, 1629, 1634, 1638, 1872, 1874, 1878, 2027 |
| R-032     | 2           | 1630, 1634                                    |
| R-033     | 2           | 1630, 1635                                    |
| **R-034** | 6           | 1620, 1629, 1631, 1636, 1876                  |
| R-035     | 7           | 193, 1639, 1849, 1876, 1904, 1973, 2028       |
| R-036     | 1           | 1639                                          |

**Two disagreements with the expected list, both reportable findings.**

1. **There is no `R-030`→`R-034` gap in `DEBT.md`.** `R-031`, `R-032` and `R-033` all appear
   (lines 1629–1635). DEBT.md:1634 answers it explicitly and in place: "**ANSWERED, 2026-08-01.**
   There is no gap" — `R-031` (the operator surface), `R-032` (a PLAYOUT tab) and `R-033` (the
   Layers table) all exist as real headings in `docs/prd/runtime.md` on `dev`, so the space is
   contiguous `R-001`…`R-034`. The one real collision — a `main`-side session filing the splash
   as `R-031` because `dev`'s was invisible from `main` — was resolved by renumbering the splash
   to **`R-035`**. DEBT.md:1639 records **next free: `R-036`**.
2. **No `P-` identifier appears anywhere in `DEBT.md`** (zero matches). The process rules this
   file wants filed — the split-registry rule (DEBT.md:180), the observer-effect pattern
   (DEBT.md:1732), the control-test lesson (DEBT.md:1456) — are all described without a number,
   which is correct under fast mode but means the `P-` space is untouched by this file.

`B-113`, `B-114` and `R-034` are present exactly as expected, all three on DEBT.md:1620, and
DEBT.md:1625 records that all three still owe a full-ref verification.

---

# Verification

**Bucket counts**

| bucket       | rows    |
| ------------ | ------- |
| LIVE         | 36      |
| PROCESS      | 33      |
| DECISION     | 32      |
| OBSOLETE     | 8       |
| DISCHARGED   | 7       |
| OUT OF SCOPE | 6       |
| UNSURE       | 2       |
| **total**    | **124** |

Per section: 5 + 4 + 19 + 30 + 4 + 5 + 34 + 22 + 1 = **124**. The two totals agree.

**UNSURE ratio: 2 / 124 = 1.6%**, far below the one-third threshold that would mean `DEBT.md`
cannot be classified from itself. Both are named and reasoned above (DEBT.md:978, DEBT.md:1531).

**Section map.** Every range in the task's §7 table is correct as written against the file; no
correction is needed. Lines 1–4 hold the title and a horizontal rule and carry no entry.

## Contradictions inside `DEBT.md`

The most valuable output of this pass, because each is invisible to any later reader who opens
only one of the two entries.

1. **DEBT.md:1190 vs. the owner's own knowledge — the one the task predicted.** The file states
   the `scene.background` → `.cg-stage` cause is "measured dead". The owner has independently
   confirmed a live defect with that mechanism. `DEBT.md` is actively wrong here, and the note
   that recorded the mechanism is gone rather than merely superseded.
2. **DEBT.md:1251 / DEBT.md:1277 vs. DEBT.md:602 and DEBT.md:1254 — three snapshots of the same
   chain.** DEBT.md:1277 says `dev-r022-rehearse` and `dev-r030-channel-raster` were never
   started; DEBT.md:1254 says both shipped; DEBT.md:1251 says `dev-r028-b5` was not started and
   DEBT.md:602 says it shipped in three commits. Read as a timeline (newest entry at the top of
   the section) these are consistent stale snapshots, not conflicts — but nothing in the file
   says so, and a reader who lands on DEBT.md:1277 has no signal that it was overtaken.
3. **DEBT.md:1295 is the dangerous case of that same pattern.** It records a live on-air defect
   (non-1080 channels mis-place every graphic) and attributes the fix to
   `dev-r030-channel-raster`, "which was not started" — while DEBT.md:1254, a newer entry, says
   r030 shipped. **Nothing anywhere in the file says the non-1080 defect was fixed.** It is
   classified LIVE on that basis. Confirming it either way needs the source, which this pass
   does not read.
4. **DEBT.md:2603 vs. DEBT.md:2486.** DEBT.md:2603 describes CLEAR as disabled on an unbound row
   and calls that "the interim state, not the intent"; DEBT.md:2486, in the `✅ DONE` entry above
   it, says CLEAR is now enabled on every row. Superseded in place.
5. **DEBT.md:836 / DEBT.md:892 vs. DEBT.md:688.** Two `dev-offline-ux` entries list unstarted
   sections; DEBT.md:688 says the whole change is "CLOSED and superseded; discard every version
   of it".
6. **The same debt is recorded in three places without cross-reference.** The `dev-clear-bank-scoped`
   bound-row race appears at DEBT.md:2207 and DEBT.md:2535; `CLEAR ALL` being enabled but
   ineffective appears at DEBT.md:1539 and again at DEBT.md:2558; `PRIMARY A` appears at
   DEBT.md:119, DEBT.md:248 and DEBT.md:409. Filing from this census must dedupe, or the same
   defect gets three numbers.

---

# CLOSING RECORD — the sweep, 2026-08-03 (session 6)

## `DEBT.md` is now a FROZEN EVIDENCE ARCHIVE — do not edit it

**`DEBT.md` is `179522` bytes and must stay that way.** Verify with
`git cat-file -s dev:DEBT.md`.

**Why, and it is not sentiment: 34 filed PRD items cite `DEBT.md:NNNN` as their evidence.**
Inserting a header, reformatting, emptying it, or running a formatter over it shifts every line
number and breaks all 34 citations **silently** — nothing errors, the numbers simply stop pointing
at anything. So "empty `DEBT.md`" resolves to freezing it, and **its closure is recorded HERE
rather than in it**.

Prettier already accepts it as written (`pnpm exec prettier --check DEBT.md` passes), so no
`.prettierignore` entry was needed. If a future formatting change ever wants to touch it, add the
ignore rather than let it reformat.

## The four LIVE census rows with no filed item — all correct

| row     | disposition                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------- |
| `:1295` | **Closed, discharged.** Session 2 measured `OUTPUT_FRAME` gone; the residual landed on `R-030`.      |
| `:33`   | **Process, not an item.** An unwritten E2E + an owed Linux `gate:e2e` — both on the checklist above. |
| `:2125` | **Process, not an item.** A stale header in a task file whose change dir does not exist.             |
| `:936`  | **RESOLVED 2026-08-03.** The spec was recovered; see below.                                          |

## `:936` resolved — `dev-list-vs-layer` v3 §5–§8, measured against the source

The specification was never in the repo, so it could not be recovered FROM the repo — it was
supplied to session 6. Each section measured, nothing implemented:

| §   | verdict               | evidence                                                                                                                             |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| §5  | **PARTIAL → `B-130`** | menu entry gone, picker kept; but three E2E specs were DELETED rather than re-pointed against an explicit "do not delete them"       |
| §6  | **LANDED in full**    | `layerRowActions.ts:253` (unknown = unreachable), verbs at `:503`/`:575`/`:588`/`:600`, **LOAD exempt** `:435`–`:455`, ON PVW `:560` |
| §7  | **LANDED**            | the refusal was removed entirely; the pattern sweep produced `caspar-runtime.ts:3630`–`:3643`; remainder is `R-038`                  |
| §8  | **LANDED**            | the bare green `LIVE` became `BRIDGE LIVE` — `LinkIndicator.tsx:72`, and `:82` for the checking state                                |

## Final free number per prefix

**`B-131` · `C-021` · `D-147` · `P-026` · `R-047`**

`B-` moved to `B-131` because session 6 filed `B-130`. The other four are unchanged from session 5.

> ⚠ **SUPERSEDED 2026-08-03 by the re-verification pass** — `B-131` and `R-047` have since been
> claimed. Current free numbers are **`B-132` · `C-021` · `D-147` · `P-026` · `R-048`**. See
> "THE RE-VERIFICATION PASS" at the foot of this file. Derive before claiming regardless
> ([[P-022]]); this pointer exists so the line above is not read as current.

## A pattern worth remembering: a locator can point at the containing entry

Six of the plan's `DEBT.md` locators pointed at an entry heading rather than at the finding inside
it. Five were harmless. **One was not:** `B-120`'s `DEBT.md:1064` opens by measuring the
**opposite** of what the plan claimed — _"`PLAY` on a cleared row REACHES AIR … Nothing to fix
there"_ — and the actual residual is at `:1092`. Filing from the cited line would have described a
non-defect.

| item    | plan said      | actual         |
| ------- | -------------- | -------------- |
| `B-120` | `DEBT.md:1064` | `DEBT.md:1092` |
| `R-037` | `DEBT.md:355`  | `:393`, `:406` |
| `R-038` | `DEBT.md:686`  | `DEBT.md:756`  |
| `R-039` | `DEBT.md:1360` | `DEBT.md:1383` |
| `D-144` | `DEBT.md:1967` | `DEBT.md:1968` |
| `D-146` | `DEBT.md:2044` | `DEBT.md:2045` |

**The rule it earns:** an index built by one session records where it LOOKED, not where the fact
IS. Read the entry and find the line before citing it.

## 🔴 A SECOND pattern, and it is the more expensive one: a debt note goes STALE

**A debt note that was accurate when written becomes a FALSE CLAIM the moment its subject is
resolved and nothing records the discharge.** Third instance in this sweep:

1. **A stash described as live** that had in fact been rescued to a tag and dropped on 2026-07-26.
2. **`R-030`'s `OUTPUT_FRAME` prose**, which survived the constant it named being deleted.
3. **[[B-118]]** — filed 2026-08-02 from `DEBT.md:1012`, closed 2026-08-03 **with no work done**,
   because `enterRehearse` had already stopped producing `mute-failed` entirely. The measurement
   was true; the code it described had moved.

### The exposure this implies, stated plainly and NOT acted on

**Every filing session verified that a plan locator matched what `DEBT.md` said. NONE verified that
the defect still existed in the code.** Those are different questions. `DEBT.md` was written across
30 July – 1 August, and a row written early could have been fixed by a later fast-mode session two
days later — which is exactly what happened to `B-118`.

**So an unknown number of the other code-defect items among `B-115`–`B-129` and `R-036`–`R-046`
carry the same exposure.** This is recorded as owed work, not discharged and not estimated: a
re-verification pass — take each item, read the code it describes, confirm the defect is still
present — is **the owner's call**, not session 6's. Session 6 measured only the items it had reason
to open.

## One line of owed HARDWARE measurement, deliberately not an item

From [[B-118]]'s closure: the rehearse mute is best-effort and entry never fails on it, so with the
mute unlanded a resident producer stays unmuted while the row claims PVW — and on 2.5.0 a resident
producer's audio can be on air ([[R-029]]). **The code states this exchange deliberately and argues
it is safe, so filing it as a defect would record a decision as a bug on no evidence** — something
this repo has twice paid for. The question belongs with the [[C-018]] / [[C-019]] hardware work,
where the plant is available:

> **On 2.5.0, with the mute unlanded, does a resident producer stay AUDIBLE while the row claims
> PVW?** If yes, it becomes an item then, with a measurement behind it.

## The §5 checklist — disposition, 2026-08-03

Only one box was ticked, because only one was verified. The rest are dispositioned rather than
silently left open.

**Discharged**

- **Verify `B-113`/`B-114`/`R-034` across every ref** — ticked above; session 2 measured it.

**Discharged for the CURRENT TREE only — deliberately NOT ticked**

- **`pnpm gate` uncached** and **`pnpm openspec validate --all --strict`**. Session 6 ran both green
  over the merged tree, which contains all the work listed. That is **not** the same as each change
  having been green in isolation, which is what those entries asked for, so they are not ticked.
  Whether a per-change re-run is worth it is a judgement call the owner should make; the tree is
  green today.

**Converted into numbered items — no longer loose process debt**

- the scrub-DRAG E2E → **`R-039`**
- `#`-vs-alias divergence, alias stability, gap-not-renumber → **`R-041`**
- migrated dialogs still OPEN, and `Cancel` byte-identity → **`R-044`**
- the §3 in-viewport refusal assertion is the one test entry still unnumbered; it rides with the
  `dev-modal-primitive` artifacts below.

**Cannot be discharged here, with what would settle each**

- **Linux `gate:e2e` (9 items) · Windows `gate:e2e` for r022/r030 · splash suite-timing** — needs a
  Linux/WSL box. A Windows run is explicitly non-authoritative.
- **All six hardware entries** (720p5000 placement, real `INFO` XML, `MIXER VOLUME` on 2.3.2, a real
  `CLEAR` to a real layer, the ten-second `PRIMARY A` refresh test, the `unknown`-while-LIVE
  observation) — needs the plant, and two of them need the OWNER at the machine.
- **Author the missing change artifacts** (`dev-modal-primitive`, `dev-awaiting-verbs`,
  `dev-r030`/`dev-r022`, the Designer splash, `dev-clear-bank-scoped`, b4, b3-and-earlier) — seven
  change dirs of authoring. Out of scope for a closing session by construction.
- **Flip `R-030` and `R-022` to `[~]`** — out of session 6's scope fence (it may not edit existing
  items beyond the two authorised). Note `R-030` should **not** be flipped blindly: session 4
  recorded an UNMET acceptance on it, so it is arguably still `[ ]`.
- **Re-word `R-006`/`B-087` air colour by role not hue** · **Engine doc-sync** — both need edits to
  files outside the fence.
- **Sweep retired `M<n>` milestone references** — **measured, still owed.** Genuine milestone
  references remain in at least eleven places, e.g. `IssuesPanel.tsx:44` (M7.3),
  `keyframe-helpers.ts:31` (M12), `ToolRail.tsx:38`–`:39` (M6/M6.4), `store.ts:32`–`:36`
  (M7/M6/M6.5/M6.4), `AuditPanel.tsx:78` (M8.5), `FailoverBanner.tsx:40` (M9.0),
  `LockOverlay.tsx:8`/`:160` (M8.4), `timeline/README.md:24` (M12). Discharging it means editing
  product-code comments, which a docs session must not do.
- **Owner action: clear the four Name fields in Configure** — only the owner can.
- **Reconcile the `runtime-splash-screen` spec-delta** — **measured: this is MORE than a small
  delta, so per instruction it is recorded and NOT authored.** It spans four files — `design.md`
  (135 lines, §5 is titled "Three labels, a step counter"), `proposal.md` (68), `tasks.md` (109)
  and `specs/runtime-ui/spec.md` — and the shipped model (a monotone PERCENTAGE, no terminal
  `READY`) is barely represented in them. Reconciling means re-authoring the readout model across a
  design doc, a proposal, a task list and a capability spec. **It wants its own numbered item
  (`R-047` is free);** session 6 did not file it because filing a new number in the last commit of a
  cleanup is the anti-pattern this record exists to name.
- **"No archive is pending"** — a statement, not a task. Still true.

# THE RE-VERIFICATION PASS — 2026-08-03

The exposure recorded above at "The exposure this implies, stated plainly and NOT acted on" was
answered. Every in-scope item was read against the code it describes.

## The headline number

**30 in-scope items checked. 1 came back ALREADY FIXED.**

- **29 STILL PRESENT**
- **1 ALREADY FIXED** — [[B-117]]
- **0 CANNOT TELL**

**The `DEBT.md` file had drifted far less than [[B-118]] suggested it might.** That is the useful
result, and it is worth stating in the direction it actually points: the sweep's filing sessions
produced items that overwhelmingly describe real, present defects. One item in thirty was stale,
and it was the one that already said so in its own body.

## What was in scope, and what was not

**In scope — 30 items,** each sourced from a `DEBT.md` row and describing behaviour in code:

- `B-115`, `B-116`, `B-117`, `B-119`–`B-130` (15 items; `B-118` already closed on 2026-08-03)
- `R-036`–`R-046` (11 items)
- The four items the sweep MERGED evidence into: `B-078`, `B-104`, `P-001`, `R-030`. The items
  predate the sweep; the **evidence folded into them during it** carries the same exposure, so the
  folded blocks — not the whole entries — were what got verified.

**Out of scope, named rather than silently skipped:**

- `D-142`–`D-146` — features and stubs, not defects. There is no "still present" to measure.
- `P-022`–`P-025` — process rules. A rule cannot be "already fixed".
- Anything whose source is not a `DEBT.md` row.
- **The context-menu wiring finding** (`claude/findings-context-menu-wiring.md`) — real, unfiled,
  and its number claim is **deliberately deferred**. Not filed, not numbered, not fixed here.

## The one closure — `B-117`

Closed `[x]` with a closing note whose first line reads:

> ### CLOSING NOTE — 2026-08-03. **NO WORK WAS DONE FOR THIS ITEM.**

**Evidence for the fix:** `apps/runtime/src/renderer/hooks/useCasparReachable.ts:96` —
`if (link === 'offline-mock') return 'reachable';` — the link branch inside `resolveCasparReach`
(`:92-99`) precedes any health read, where the pre-fix version answered from `useConnections()`
alone. Landed in `8613772` (2026-07-31), _"fix(runtime): test mode refused the verbs it exists to
simulate"_, with a regression pin at `apps/runtime/tests/testModeHonesty.dom.test.ts:131`.

**And it is a DIFFERENT failure from [[B-118]], which is the part worth recording.** B-118 was
filed from a row whose subject had silently moved and the filing session did not know. **B-117's
filing session DID know**: `docs/prd/bugs-runtime.md:2623-2624` reads _"**Fixed** in `8613772`, the
session after the gate landed. Filed here as a **bug class**, not as a fix note."_ The body was
correct and the **checkbox** contradicted it. So the sweep's stale-note class has a sibling: **an
unchecked box left on an entry that documents its own fix.** Same symptom — a PRD carrying a
resolved defect as open — different cause, and a cause no locator check would ever catch.

## The verdict that was OVERTURNED, and why the adversarial pass paid for itself

**`R-042` came back ALREADY FIXED on the first pass and was downgraded to STILL PRESENT on
adversarial re-check.** Every citation in the original verdict was accurate; it failed on
inference, not quotation. Three independent reasons, each sufficient:

1. **The verdict contradicted itself** — it conceded two acceptance bullets were _"MOOT rather than
   satisfied"_ and that the item is _"obsoleted by a DIFFERENT design than the one it specifies"_.
   Unmet acceptance is not a fix, and whether a superseding design retires a `design-first` item is
   an owner decision, not a verification outcome.
2. **The hazard is live on a path never examined.** `tools/caspar-bridge/src/caspar-runtime.ts:1714-1751`
   — `enterRehearse`'s mute has been BEST-EFFORT since `815e2e4` (2026-07-31), which landed **after**
   the commit cited as the fix. Entry proceeds with `muted: false` over a resident producer, pinned
   as intended at `tools/caspar-bridge/tests/rehearse.integration.test.ts:180`. The fix commit was
   followed by a commit that widened the exposure.
3. **Partial coverage of a shared method.** The removed guard protected `#loadOnto`'s `CG ADD`; only
   one of its two callers passes `listOnly`, and `load()` at `caspar-runtime.ts:897` does not.
   Covering one of several paths is STILL PRESENT by rule.

**The lesson, stated because it generalises:** a first-pass verdict that closes an item deserves a
second reader whose job is to overturn it. Here it was one verdict in thirty, and it would have
erased an unwritten spec obligation plus two reachable routes to an on-air audio leak.

## The four undiagnosed items held STILL PRESENT by rule

`B-119`, `B-129`, `B-128`, and the evidence folded into `B-104` were filed with the mechanism
explicitly undiagnosed. **Absence of a cause that was never had is not absence of a defect**, so
each was held STILL PRESENT unless the code showed the behaviour to be impossible — and none did.
`B-128`'s write path was re-confirmed rather than re-investigated:
`apps/designer/src/renderer/features/inspector/TickerSeparatorControl.tsx:44-53` still maps every
asset with no kind predicate, and `pickImage` at `:65-78` still writes `kind: 'image'` hardcoded.

For `B-104` the pass recorded one **additional observation** without promoting it to a cause:
`assets.setActiveProject` is driven only by `projects.activeChanged`
(`apps/designer/src/platform/createDesignerBridge.ts:75-79`), which the D-088 disk paths `openDisk`
(`:228-260`) and `openRecent`'s handle branch (`:262-276`) never trigger. That is a pointer for
whoever diagnoses it, not a diagnosis.

## Two stale-document findings surfaced along the way

Both are cases of the same class this sweep exists to name — a note that was true when written.

- **`DEBT.md:1301-1303`** claims `OUTPUT_FRAME` is hardcoded at `position.ts:25` and that
  `applyOutputPosition` forces `html`/`body` to that size at `:110-111`. **Both halves are false
  today** — the constant was renamed `REFERENCE_FRAME` and moved to `position.ts:41` by `3e9bbc9`
  (2026-07-30), and `html`/`body` are sized to the **channel raster** at `:274-277`. `R-030`'s own
  2026-08-02 prose correction (`docs/prd/runtime.md:1335-1352`) is the accurate account and was
  verified line by line. `DEBT.md` is frozen, so this is recorded here rather than corrected there.
- **`tools/caspar-bridge/src/caspar-runtime.ts:1646-1650`** still asserts that the rehearse mute
  _"IS the safety condition… if it does not land, rehearse is REFUSED"_ — flatly contradicted by
  the code sixty lines below at `:1710-1754`. A stale comment inside product code, adjacent to
  `R-042`; not filed, because this session may not touch product code and the fact belongs with
  whoever takes `R-042`.

## Two owed items filed in the same session

- **`R-047`** — `docs/prd/runtime.md:1820`. The `runtime-splash-screen` spec-delta was never
  written; `design.md:50` specifies a step counter and argues against a percentage at `:54-55`,
  while `apps/runtime/index.html:1017-1020` renders a monotone floored percentage. `design-first`.
  Blocks `R-035`'s **archive**, not its delivery.
- **`B-131`** — `docs/prd/bugs-designer.md:1621`. A UTF-8 BOM in
  `apps/designer/src/renderer/features/shell/Modal.css.ts`, which is source that reaches the build.
  **Not stripped**, and the item says so: the effect on emitted output was not measured, and the
  `low` rating assumes no effect until it is. The BOM is present in every revision of the file
  (`3ed7738`, `aa0138a`), so it is **not** a `P-025` PowerShell artifact — recorded because the
  natural assumption is wrong and would send someone auditing the wrong commits.

## Free numbers after this pass

**`B-132` · `C-021` · `D-147` · `P-026` · `R-048`**

Duplicate audit unchanged: exactly `B-056` and `B-080`, both deliberate and both explained in their
entries. `B-` and `R-` are contiguous; `D-`'s gaps (`69`, `70`, `80`, `90`, `91`, `95`) are
pre-existing and untouched.

## Scope held

No product code, no tests, no `openspec/` artifacts, and no `DEBT.md` byte were changed —
`git cat-file -s dev:DEBT.md` is `179522` before and after. Work was done directly on `dev` in the
single checkout; no branch, worktree, PR, merge, stash or tag was created or removed.
