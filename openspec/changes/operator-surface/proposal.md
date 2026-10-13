# The operator surface, designed as ONE surface

## Why

Six `high` PRD items describe ONE screen — `R-017`, `R-021`, `R-028`, `R-031`, `R-032`,
`R-033`. They were filed at different times from different angles, three of them transcribed
from chat reviews, and **they will fight if they are built separately.**

They already have. Session AH tried to put an audio control inline on a layer row and could
not, because the verb block is a fixed six-column grid whose sticky header prints a word
directly above each glyph — a conditional control shifts every head to the right of it onto the
wrong button. That is R-033's grid meeting R-031's verbs, discovered by collision rather than by
design. Sessions AG and AH then shipped BOTH controls the collision was about — R-048's SOURCE
swap and C-015 6.5f's plate AUDIO — and each solved it the same way, independently, from the
same module comment. **The constraint held; nobody wrote it down.**

**The recon changed what this work is.** Read against the tree at `ec65480`, five of the six
items are substantially or entirely built:

| item      | filed as | at HEAD                                                                    |
| --------- | -------- | -------------------------------------------------------------------------- |
| **R-031** | `[~]`    | **all eight points TRUE**                                                  |
| **R-032** | `[~]`    | **every acceptance bullet TRUE**                                           |
| **R-033** | `[ ]`    | **ten of twelve TRUE**, two SUPERSEDED by a later owner decision, two gaps |
| **R-021** | `[~]`    | **every stage landed**, stage 4 included (`e326a96`)                       |
| **R-028** | `[~]`    | parts A + B shipped, `§§6–7` landed too                                    |
| **R-017** | `[ ]`    | **UNBUILT, all three halves** — and the only on-air-safety item in the set |

So the useful output is not a rebuild. It is: a statement of what is already true so five items
stop reading as five backlogs; the conflicts between them named and resolved in one place; the
two real gaps identified; and the owner's open calls collected as numbered gates instead of
being re-discovered one collision at a time.

**The one thing that is genuinely dangerous today** is `R-017`: `layerRowActions.ts` declares
REMOVE with no on-air gate at all (`act('load-remove', 'REMOVE', false, …)` — its only
conditions are the centrally OR-ed `linkDown || awaiting`), `LayersPanel.tsx` disables REMOVE
ALL on `linkDown || items.length === 0` with no `onAirCount` term, and neither `stack.remove`
nor `stack.remove-all` has anywhere in its response shape to put a refusal. On a live graphic,
REMOVE is enabled, unconfirmed by any air check, and does two irreversible things at once.

**And the gap has widened since the item was filed.** R-021 stage 4 added a fifth verb gate,
`blocked`, and wired it into PLAY, NEXT, SOURCE and AUDIO. REMOVE did not get that one either.
At `ec65480` it is the only verb on the row with no state condition at all — and the only one
that cannot be undone.

## What changes

**Nothing in the product. This change ships a DESIGN.** Every implementation task in `tasks.md`
carries a `⟨GATE: §x⟩` and is blocked until the owner answers that section — the same
design-first shape used before, and the reason is the same: several of these decisions are the
owner's taste about a control room, and guessing them produces work that has to be undone.

What lands now:

- **`design.md` `§0`** — the only complete section: what is true at HEAD, per item, cited to the
  file that decides it. Including the two supersessions, the two gaps, and the three ownership
  classes checked rather than assumed.
- **`§0.9` — the seven collisions between R-031, R-032 and R-033**, five resolved (four already
  resolved in code) and two live. In particular the C6 boundary, where three rules that look
  contradictory are all correct: a control disabled because of the ROW's changing state is
  present-and-disabled; a control absent because of a permanent property of SOMEONE ELSE's layer
  is absent; an ENABLED control that can only reject is forbidden.
- **Eight numbered owner gates**, each with candidates and their costs — of which **four
  (`§4.1`, `§4.2`, `§7`, `§8`) are CONFIRMATIONS against shipped behaviour rather than open
  choices**, because the recon found the work already done and, in two cases, already argued.
  `§5` moved the other way: it was filed as a confirmation and the re-verification turned it into
  a real decision with four candidates.
- **Every claim marked CONFIRMED / CHANGED / CANNOT VERIFY** against the abandoned earlier pass,
  with a blast-radius table (`§0.0`) showing which of the cited files the intervening 68 commits
  actually touched — so the re-verification is legible as evidence rather than as re-assertion.
- **A spec delta** for the rules this design settles without owner input, written as SHALL:
  one column model per channel surface, the verb-block admission rule, table semantics, and
  R-017's refusal.
- **A landing order** with the one hard coupling identified — `§3` and the ARIA gap must land in
  the same commit or the rule gets written twice.

## Impact

- **Specs:** `runtime-ui` — four ADDED requirements, one MODIFIED (Remove-All).
- **Code: none.** No source, test, or build file changes in this change as it stands.
- **PRD:** cross-references written into `R-017` / `R-021` / `R-028` / `R-031` / `R-032` /
  `R-033` so the five items stop drifting apart, plus the per-item HEAD status recorded on each.
- **Blocks nothing.** `§4` was written to unblock `live-source-multibox` 6.9e and no longer
  needs to — 6.9e shipped, and shipped correctly. What `§4.1` buys is that the fourth control's
  author reads a rule instead of hitting a wall.
- **Gate:** docs-only. `pnpm openspec validate --strict` + `pnpm format:check` + full `pnpm
gate`. **No `gate:e2e` is owed** — no file matching `UI_RENDER_PATTERNS` is touched.
