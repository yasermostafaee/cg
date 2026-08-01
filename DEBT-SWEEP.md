Censused through DEBT.md:1848

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
