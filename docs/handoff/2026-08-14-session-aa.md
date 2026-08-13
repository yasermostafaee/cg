# Handoff — 2026-08-14, session AA (D-133: the loop range — authorable, looping the hold, on the timeline)

`tasks.md` §1–§3 of `openspec/changes/timeline-drives-loop-and-media/` are **BUILT**. With them,
**every section of that change is done** and the change is archive-ready the moment its E2E debt
is discharged. **That discharge landed** — run 31744207434, with the `e2e` job RAN and green; see
the foot of this doc.

Three commits on `dev`, pushed and verified (`git ls-remote origin dev` = local HEAD):

| commit     | what                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| `41668eca` | docs — session AB's own corrections to its handoff, found uncommitted in the tree |
| `04053b61` | feat — **D-133 §1–§3** (designer + template-runtime), the session's work          |
| `de1e5565` | docs — the owner's settled §10.1 folded into `media-phases-follow-composition`    |

---

## What was built

The mapping was already decided in `design.md` §3 and **needed no revision**: the loop range IS
`[contentStart → outPoint]`, and looping is a **rendering of the existing HOLD**. No new lifecycle
phase, no new `PlayoutMode`, no new stored field. The finding the item invited ("say so explicitly
if the shipped lifecycle genuinely cannot express this") is still not triggered.

### §1 — authoring (`PlayoutSection.tsx`)

The `hasContent` half of the "Pin content start" gate is gone, so a **shapes-only** scene with an
out-point can author the range. `lifecycle !== undefined` is KEPT (§9.2). The gate at the
Hold-source select and the `ContentHoldChecklist` is **untouched by design** — §8 risk 5's recorded
residual, unchanged and still unnumbered.

"No change to the out-point path" is a decision to make no change, so it carries a test rather than
a comment: **the loop-range surface never calls `setLifecycle`**, with the out-point path clicked
in the same test as the CONTROL that proves the spy discriminates.

### §2 — playback (`PlayoutController.startHoldLoop`)

A content-driven hold now replays `[contentStart → outPoint]` instead of parking on one frame. One
`FrameDriver` in the **shipped** `'loop'` mode (the pre-D-020 full-range loop — a machine that
already wraps by modulo, not a new one), opened from `onIntroEnd`'s content-driven branch and
nowhere else.

🔴 **The seam invariant is structural, not guarded.** The loop driver's only output is `applyFrame`,
so a wrap **cannot** reach a content driver to reset it — there is no path. That is the design's
whole point: the restart the item forbids is _unreachable_, not forbidden-and-checked. If a future
edit ever needs a guard there, it has built the wrong thing.

Two conditions keep it narrow, and **both reuse answers that already existed**:

- **Content-driven only.** `manual`/`static` return earlier (they ignore `holdSource` entirely), and
  B-032 has already resolved a driver-less `content-driven` back to `timed` in
  `effectivePlayoutFor` — so _reaching_ `startHoldLoop` means real drivers exist. No new predicate.
- **A range with something to replay.** `playRange`'s own collapse predicate, **extracted** as the
  shared `frameDependent` — one definition, two readers.

`startOutro()` now stops the driver up front rather than relying on `playRange`'s stop, which can be
deferred behind an async `beforeOutro` gate or a pause. A hold loop still wrapping the furniture
while the graphic exits would have been visible on air.

### §3 — timeline (⚠ load-bearing for the item's acceptance)

Draggable grips stay in the scene lane (a grip needs a row); the **indicator lines** and the range
band are body-level overlays beside the playhead, so "full timeline height" is a structural property
rather than a styling one. Drawn **by default** from the EFFECTIVE content start — the marker when
pinned, else the same `contentStartDefaultFrom` the pin button writes (one definition, now three
callers). An unpinned start draws **dashed**: a derivation must not be presented as an authored
decision. A degenerate range draws nothing.

### The three loops — a decision, now recorded (design §3.4)

**Preview loop** (the transport toggle — `aria-label` changed from the bare `Loop`; nothing on
screen is called plain "Loop" any more), **Loop cycle** (the shipped mode) and **Hold loop** (this
range). Each is named for where it lives; "Hold loop" was chosen because the WHERE is also the whole
of why the range can be inert, so one name carries both facts.

⚠ §3.4 **corrects its own earlier count**: it said _two_ loops and deferred naming to
implementation. There are **three** — the transport toggle predates both playout loops and simply
was not in view when that section was written.

### §9.1's inert explanation

One caption states the range and, when it has no playback effect, names the missing condition **in
the runtime's own resolution order**: mode first (`manual`/`static` ignore `holdSource` entirely),
then the effective driver set (a driver-less `content-driven` is _already_ timed everywhere, so
"switch the select" would be a lie), only then the select. Tests read the CLAIM and assert the
**wrong advice is absent** — a hint naming the wrong reason would sail through a presence check and
teach the operator a fix that cannot work.

---

## Tests

| suite                                             | count | what it pins                                                                                                |
| ------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `template-runtime/tests/hold-loop-range.test.ts`  | 8     | the wrap, the seam invariant, no repeat consumed, OUT after the Nth, both INERT holds, the shared predicate |
| `designer/tests/loop-range-authoring.dom.test.ts` | 10    | the gate, the `setLifecycle` abstention, all four caption claims                                            |
| `designer/tests/loop-range-timeline.dom.test.ts`  | 7     | present-by-default, the range's frames, the structural full height                                          |
| `designer/tests/e2e/loop-range.spec.ts`           | 4     | the same scenarios where CSS actually runs — heights MEASURED                                               |

**Verified discriminating**, not assumed: commenting out `startHoldLoop()` fails 3 of the 8 runtime
tests. The seam-invariant test alone still passes without the loop (no loop ⇒ no wrap ⇒ no call),
which is precisely why it **counts its two seams in the same test** — otherwise it would be a
guarantee that had quietly stopped guarding anything.

**The playback half is deliberately NOT in the E2E.** The wrap, the seam invariant and leaving the
loop are covered against an injected clock; a real-timer E2E cannot separate "the furniture replayed
the range" from "the furniture repainted for some other reason" without reproducing that clock. Same
division `content-start-hold-entry.spec.ts` already draws.

---

## 🔴 A latent trap in the E2E fixtures, found by failing on it

Authoring a second keyframe as `setInspectorNumber(...)` **followed by**
`toggleInspectorKeyframe(...)` **deletes the keyframe it just made.** Once a track exists,
`commitAnimatable` routes the value edit to a keyframe at the playhead (D-006), so the diamond click
afterwards _toggles it off_. This spec first failed exactly that way — a degenerate `frames 38 → 38`
loop that drew nothing — and the fixture now sets the value alone and asserts the diamond reads
`at-frame`.

⚠ **`content-start-hold-entry.spec.ts` (lines ~29-34) has the identical sequence** and its inline
comment claims a keyframe at ~frame 8 that is not there. Its assertions do not depend on it (it
polls for a crawl within 1.5 s, which passes either way), so nothing is red — but the comment is
false and the test is weaker than it reads. **Not touched here** (out of scope, and changing an
unrelated timing spec on the way past is how a green suite acquires a mystery). Worth an item.

---

## What was NOT changed, and why

- **§10.2's content-driven-hold decision** — still the owner's, still open.
- **The `hasContentElement` divergence** at the Hold-source select / `ContentHoldChecklist` — §8
  risk 5's residual, deliberately left, still no number minted.
- **`updateElement` cannot reach a grouped element** (design §9A.2) — untouched, still the owner's
  to file.
- **Session AB's mirror defect** on the marker-less content-start path — untouched; its two `OPEN`
  tests still assert the asymmetry rather than blessing either side.

---

## Gate

- `pnpm gate` — **85/85 tasks, `0 cached, 85 total`**, exit 0. `format:check` clean after the
  prettier pass, included in the commits.
- `pnpm openspec validate --all --strict` — **50/50**.
- `@cg/template-runtime` — **889/889 across 70 files**.
- Windows `loop-range.spec.ts` — 4/4 (useful signal, **non-authoritative**, discharges nothing).

## ✅ The Linux E2E debt is DISCHARGED

`de1e5565` — <https://github.com/yasermostafaee/cg/actions/runs/31744207434>: run
`conclusion: success`, and the **`E2E (Playwright)` job RAN** (`completed success`, not skipped —
a skipped `e2e` proves nothing about render behaviour, `P-029`). Both halves checked, not just the
run's existence.

§1–§3 alter the Inspector, timeline rendering AND on-air playback, so the debt was real and it
follows the pushed HEAD. §1–§3 ride in `04053b61`; `de1e5565` is a later `dev` HEAD that CONTAINS
it (two docs-only commits on top), which the discharge rule allows explicitly. This **supersedes**
the previous discharge (`710f0ab0`, run 31683317925) rather than joining it — that run verified a
tree since replaced. The URL is written into `tasks.md` §7 beside the ticked box, so the evidence
outlives this session.

## Nothing blocks archiving

**Every section of `timeline-drives-loop-and-media` is complete** — §0–§0b (design + corrections),
§1–§3 (D-133), §4–§5 (D-135, both halves), §5a (D-133's E2E), §6 (the carve-out), §7 (docs + gate +
the discharge above) — and all five owner decisions (§9.1–§9.5) are answered. D-133 and D-135 are
both `[~]` with the change dir.

**The change is ARCHIVE-READY. Archive only on the owner's confirmation** — not done here, per
workflow step 7.

## Flagged per the commit policy

1. **On-air / product source** — this changes what a content-driven hold RENDERS on air. The
   furniture now moves during a hold where it previously froze. Verified by CI, but it is broadcast
   output and deserves the owner's eyes.
2. **The owed Linux `gate:e2e` — DISCHARGED**, URL above and in `tasks.md` §7. Nothing outstanding.
3. No shared config touched (no root `package.json`, `turbo.json`, `pnpm-lock.yaml`, `CLAUDE.md`, or
   gate-hook changes) — nothing for the next session to pull specially.
