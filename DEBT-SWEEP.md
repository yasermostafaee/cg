Censused through DEBT.md:177

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
