# Design — the operator surface, as ONE surface

**DESIGN ONLY. This change ships no product code.** Every implementation task in `tasks.md`
carries a `⟨GATE: §x⟩` and is blocked until the owner answers that section. `§0` below is the
only complete section: it is RECON, settled against the tree, and nothing in it is a proposal.

Six `high` PRD items — `R-017`, `R-021`, `R-028`, `R-031`, `R-032`, `R-033` — describe ONE
screen. They were filed at different times from different angles, and three of them were filed
from chat reviews, which is why several of their points describe work that has since landed.
Building them separately is how a second spelling of one rule gets shipped; session AH already
hit that in practice (see `§0.7`). So they are designed once, here.

---

## §0 — WHAT IS TRUE AT HEAD

**Read at `ec65480`** — verified `HEAD == origin/dev`, working tree clean, pulled 2026-08-15.
Every claim cites the file that decides it, located BY SYMBOL rather than by line wherever a line
number could go stale. Where reading could not settle a question the code was read to the branch,
not to the doc comment.

Every claim below is marked against the corresponding claim in the abandoned commit `15d6754`
(local branch `ai-stale`, parent `2a44247`, never landed — see `§0.2a`):
**CONFIRMED** = same answer on the real tree · **CHANGED** = the real tree says otherwise ·
**CANNOT VERIFY** = neither tree settles it.

### §0.0 Blast radius — which of the cited files the 68 commits actually touched

`git rev-list --count 2a44247..ec65480 -- <path>`, plus a tree-hash comparison, for every path
this design cites. This is the evidence that the re-verification was real rather than re-asserted:
an IDENTICAL file cannot have invalidated a claim about it, and a CHANGED one is presumed to have
until re-read.

| path                                   | commits | tree hash |
| -------------------------------------- | ------: | --------- |
| `layers/layerTable.ts`                 |       0 | IDENTICAL |
| `layers/LayerTableHeader.tsx`          |       0 | IDENTICAL |
| `layers/PlayoutPanel.tsx`              |       0 | IDENTICAL |
| `layers/playoutOccupancy.ts`           |       0 | IDENTICAL |
| `channels/ChannelScope.tsx`            |       0 | IDENTICAL |
| `ui/Tooltip.tsx`                       |       0 | IDENTICAL |
| `ui/Panel.tsx`                         |       0 | IDENTICAL |
| `ui/controls.css`                      |       0 | IDENTICAL |
| `fixedLayers/FixedBankConfigModal.tsx` |       0 | IDENTICAL |
| `fixedLayers/useTemplatePicker.tsx`    |       0 | IDENTICAL |
| `renderer/App.tsx`                     |       0 | IDENTICAL |
| `shared-ipc/channels/playoutLayers.ts` |       0 | IDENTICAL |
| `layers/LayersPanel.tsx`               |       1 | CHANGED   |
| `stack/onAir.ts`                       |       1 | CHANGED   |
| `layers/LayerRow.tsx`                  |       3 | CHANGED   |
| `layers/layerRowActions.ts`            |       3 | CHANGED   |
| `shared-ipc/channels/stack.ts`         |       5 | CHANGED   |
| `caspar-bridge/caspar-runtime.ts`      |      10 | CHANGED   |

🔴 **The number that propagates furthest is `VERB_COUNT`, and it did not move.** `layerTable.ts`
and `LayerTableHeader.tsx` are byte-identical across the whole span, so `VERB_COUNT` is still 6,
`VERB_HEADS` still has six entries, and every degradation rule, density minimum and
header-alignment claim computed off that number stands unchanged. This was checked FIRST, before
anything else in this section, because sessions AF/AG/AH added two row controls and the obvious
hypothesis was that they had widened the block. They did not — they went to the menu (`§0.2`).

**Six claims CHANGED in total, one of them materially.** The list is `§0.10`.

### §0.1 The verdict, per item

| item      | filed as | actually at HEAD                                                                             |
| --------- | -------- | -------------------------------------------------------------------------------------------- |
| **R-028** | `[~]`    | parts A + B shipped; `§4` (row surface), `§5` (verbs) and `§§6–7` all landed                 |
| **R-021** | `[~]`    | **every stage landed**, stage 4 included (`e326a96`) — all task boxes ticked                 |
| **R-031** | `[~]`    | **all eight points TRUE** — see `§0.3`                                                       |
| **R-032** | `[~]`    | **every acceptance bullet TRUE** — see `§0.4`; one gap against R-033, see `§0.5` G2          |
| **R-033** | `[ ]`    | **ten of twelve TRUE**, two SUPERSEDED by a later owner decision, two real gaps — see `§0.5` |
| **R-017** | `[ ]`    | **UNBUILT, all three halves** — see `§0.6`                                                   |

The headline: **five of the six items are substantially or entirely built, and the one that is
not is the only on-air-safety item in the set.** That inverts the natural reading of six open
`high` items, and it is the single most useful thing this recon produced.

### §0.2 The verb-block collision has ALREADY been resolved — by precedent, not by rule

This is the finding that most changes what is left to do, and it arrived after the collision
rather than before it, which is the whole problem this design exists to stop repeating.

Session AH could not put an audio control inline on a row (`§0.7` says why). Sessions AG and AH
then shipped BOTH controls the collision was about — `R-048`'s SOURCE swap (`6c56217`,
`bee6ba3`) and `C-015` 6.5f's plate AUDIO — and they solved it the same way twice:

```
...(deps.hasLivePlates ? [ act('swap-source', 'SOURCE', …, 'menu', …) ] : []),
...(deps.hasLivePlates ? [ act('plate-audio',  'AUDIO',  …, 'menu', …) ] : []),
```

**Both went to the CONTEXT MENU, both are CONDITIONALLY present, and the verb block was left at
exactly six.** `layerTable.ts` and `LayerTableHeader.tsx` are byte-identical across the whole
span — `VERB_COUNT` is still 6, `VERB_HEADS` still has six entries. So the rule this design was
going to propose is already the rule the code follows.

Two consequences, and they pull in opposite directions:

- **`§4` stops being an open question and becomes a rule to WRITE DOWN.** It was answered
  correctly, twice, by two sessions that each had to rediscover the constraint from the same
  module comment. The third one should not have to.
- **The surface acquired its first conditionally-PRESENT affordances**, and the decision to make
  them absent rather than disabled was ALSO already argued — in `live-source-multibox` 6.9e's own
  text. So that is not a new gate either; it is a rule that lives nowhere. See `§4.2`.

### §0.2a Why this document exists twice, and what happened to the first one

An earlier pass of this design was written against a local checkout that was **68 commits behind
`origin/dev`**, with a clean `git status` and nothing announcing it. It stated throughout that it
had "re-measured at HEAD (`2a44247`)". It had not: `2a44247` had not been HEAD for some time, and
the 68 missing commits were sessions AC–AH, which touched four of the files it examined.

That pass is commit `15d6754`, kept as the local branch **`ai-stale`**. **It was never landed and
must not be** — its own commit message asserts a count measured on the wrong tree. It is INPUT to
this document and nothing else.

What survived and what did not, kept separate on purpose:

- **The design REASONING survived.** Whether R-031's eight points fight R-033's twelve is a
  judgment about two descriptions of one screen, not a measurement, and the tree cannot change
  it. The one-surface description, the named collisions, the gate structure and the landing order
  are carried forward.
- **Every RECON CLAIM was re-measured**, and six changed — `§0.10`. One of them, `§5`, inverts a
  recommendation.
- **One part was REDONE rather than re-checked**: how AUDIO and SOURCE live on the row. The
  earlier pass designed their placement from a _description_ of them, having never seen the code,
  because the code was in the 68 commits. It is now read (`§0.2`) and the section it produced is
  a different section.

Recorded because the failure mode is silent: a stale checkout looks exactly like a current one,
`git status` says clean either way, and a recon is the one kind of work whose entire value is
that it read the real thing. **`git pull --ff-only` before reading a single file**, and
**`git branch <name> <sha>` before ever discarding a commit** — the abandoned work here survived
only because the reflog had not expired.

### §0.10 The six claims that CHANGED

| #   | `ai-stale` said                                                                | the real tree at `ec65480`                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | R-021 stage 4 task 3.1 is in code but its box is unticked                      | **Every stage 4 box is ticked** (`e326a96`); 3.2, 3.3, 4.3, 4.4 all landed too. The whole finding was an artefact of the stale tree and is DELETED                                                                                   |
| 2   | R-028 `§6` (retiring the dynamic path) is open                                 | **`§§6–7` landed** (`25c2142`), with `#declaredLayerClass` as the ONE canonical enumeration of the three classes                                                                                                                     |
| 3   | `§4` is an open gate blocking `live-source-multibox` 6.9e                      | **6.9e shipped.** SOURCE and AUDIO went to the context menu, conditionally, twice, correctly. `§4` becomes a rule to write down, not a placement to choose                                                                           |
| 4   | (not raised — could not be)                                                    | **NEW: `§4.2`.** SOURCE/AUDIO are the first row affordances whose PRESENCE varies by row, and the C6 boundary does not cleanly decide absent-vs-disabled                                                                             |
| 5   | R-017's REMOVE lacks the gate every other verb has                             | **Still true, and WIDER.** R-021 stage 4 added a fifth gate (`blocked`) to PLAY/NEXT/SOURCE/AUDIO and REMOVE did not get that one either                                                                                             |
| 6   | `§5`: read the existing `isOnAir` on both sides — a confirmation, not a choice | 🔴 **MATERIALLY CHANGED.** B-122 rewrote `isOnAir`'s contract ("must never gate a clear path again"), and the bridge grew its own canonical `isOnAirStatus`. Four candidates now, and the recommendation is no longer (A) — see `§5` |

**Nothing that `ai-stale` recorded as ALREADY BUILT turned out to be unbuilt**, and nothing it
recorded as UNBUILT turned out to be built. That direction was predictable — no session in the
span set out to build or delete the operator surface — and it is stated as a result rather than
assumed: R-031's eight points, R-032's bullets, R-033's ten, and R-017's three unbuilt halves
were each re-read on the real tree.

### §0.3 R-031's eight points — all eight TRUE · **CONFIRMED at `ec65480`**

Seven of the eight rest on files with ZERO commits in the span (`§0.0`); the eighth (point 7,
verbs on the row) rests on `layerRowActions.ts`, which CHANGED — re-read, and the verb
declaration's shape rule is intact with two menu entries added beside it.

| #   | the point                                      | where it is true                                                                                                                    |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | layer count + which are active set in Settings | `FixedBankConfigModal.tsx`, opened by **Configure** in the Layers header (the item's own Notes accept this as the Settings surface) |
| 2   | the Library panel is DELETED                   | `LibraryPanel` / `StackPanel` / `StackRow` / `FixedLayersPanel` / `FixedRow` are gone from the tree; `App.tsx:~213` records it      |
| 3   | Fixed Layers and Stack MERGE into one list     | `LayersPanel.tsx` — one list, `rows` from the declared bank                                                                         |
| 4   | the section is called just **Layers**          | `<Panel id="layers" title="LAYERS">`                                                                                                |
| 5   | Load means import + load in ONE action         | `useTemplatePicker.tsx` + `fixedSlotLoad.ts` (`importAndLoadOntoFixedSlot`), behind the row's single LOAD                           |
| 6   | nothing is appended to a list below            | there is no stack list; every item lives on a declared row                                                                          |
| 7   | verb buttons live on the layer ROW             | `LayerRow.tsx` renders `buttonActions(layerRowActions(...))` inline                                                                 |
| 8   | buttons present-but-DISABLED before a load     | `layerRowActions.ts` — "THE SHAPE NEVER CHANGES"; every row declares the same verbs in the same order                               |

Point 8 is not merely satisfied, it is **argued in code** at the exact place a later reader
would undo it — including the NEXT case the owner caught in review (a verb that vanished when a
single-step template landed, shifting its neighbours under the operator's finger).

**Consequence for the Library's cost (the recon question that expected hidden dependencies):
the cost is PAID, not pending.** What was deleted is the PANEL. The template REGISTRY survives
and has six consumers, all working: `useTemplatePicker` (list / remove / import),
`Inspector` (`templates.get` for the field schema, `templates.list`), `useTemplateIndex` →
the row's template label (`list` + `onChanged`), `PreviewPanel` and `RehearsalStage`
(`templates.html`), `SourcesModal` (`list`, for Live Source plate assignments), and
`fixedSlotLoad` (`get`). R-005's remove-a-template — which had no other surface once the panel
went — was re-homed into the picker dialog rather than lost. The one question this leaves is
`§1`.

### §0.4 R-032's acceptance — every bullet TRUE · **CONFIRMED at `ec65480`**

`PlayoutPanel.tsx`, `playoutOccupancy.ts` and `shared-ipc/channels/playoutLayers.ts` are all
byte-identical across the span, so this section could be confirmed by tree hash plus a re-read of
the badge condition in `LayersPanel.tsx` (which did change, for an unrelated reason).

| the bullet                                                                                                                     | where                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| yellow indicator on the tab when something is on a reserved layer                                                              | `LayersPanel.tsx` — `badge: { tone: 'warn' }`, gated on `hasPlayoutOccupant(playout) && !linkDown` |
| opening it lists every reserved layer with what is observed                                                                    | `PlayoutPanel.tsx`                                                                                 |
| `html` occupant ⇒ clear offered, individually and clear-all                                                                    | `playoutOccupancy.ts` `clearablePlayoutLayers`, `PlayoutPanel` CLEAR / CLEAR ALL                   |
| any other kind ⇒ NO control at all, the row says why, bridge refuses independently                                             | `playoutOccupancy.ts` (control absent, sentence printed) + `playoutLayers.ts` `not-html`           |
| unverifiable ⇒ reads UNKNOWN in its own right, no clear                                                                        | `playoutOccupancy.ts` — `unknown` and `empty` are separate branches with opposite sentences        |
| clear-all confirm-gated, names how many and WHICH, states plainly these are not our layers, EXCLUDES non-html and unverifiable | `PlayoutPanel.clearAll` — the dialog body does all four                                            |
| the R-009 sweep still excludes reserved layers, `layers.clear` still refuses them                                              | part A, untouched; argued again at the top of `playoutLayers.ts`                                   |

The badge is correct on the hard case: it fires on `kind === 'producer'` only, so an `unknown`
never raises it — **the absence of a claim is not a claim** — and `linkDown` masks it, because a
frozen snapshot cannot back a warning.

**The R-028 `§5.3` reversal is quoted, not paraphrased, in two places in the tree** —
`PlayoutPanel.tsx`'s module doc and `packages/shared-ipc/src/channels/playoutLayers.ts` — with
the owner's reasoning as the specification: the original prohibition existed to stop the
operator killing the antenna feed or a live channel, and declaring the graphics layers in
advance is what changes that. Both copies also carry the honest limit: `html` means "not a video
feed", never "unimportant"; an html producer there may be the station's own graphics package and
clearing it takes real graphics off air. That is accepted and intended.

### §0.5 R-033's twelve points · **CONFIRMED at `ec65480`** (both gaps re-measured, both stand)

**TRUE (10).**

| #   | point                                                                         | where                                                                                                  |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 3   | rigid column grid, ellipsis inside the column                                 | `layerTable.ts` — every column a fixed px width or an explicit `minmax(floor, Nfr)`                    |
| 4   | channel tabs as the OUTER axis                                                | `ChannelScope.tsx` wraps the whole workspace; LAYERS/PLAYOUT nest inside `LayersPanel`                 |
| 5   | graceful degradation under panel drag                                         | `resolveDensity` / `minWidthFor`; three densities; the verb block never drops                          |
| 6   | ONE tooltip mechanism, inherited by default                                   | `ui/Tooltip.tsx` — delegated off any `title`, ported from the Designer's `InputTooltip`                |
| 7   | PGM/Preview reserved now, resizable, fullscreen                               | `MonitorStrip` in `App.tsx` + `ShellDivider` + `Panel`'s fullscreen                                    |
| 8   | Configure modal scales to the count and scrolls                               | `FixedBankConfigModal.tsx` — 88vh, scrolling body                                                      |
| 9   | the whole row is the click target                                             | `LayerRow.tsx` — `role="button"` on the row, controls excluded by `closest(...)`, keyboard parity      |
| 10  | neutral buttons, colour on hover only; state carried by a large coloured icon | `controls.css` `--r-verb-*` hover fills; `variant="verb"`; the state cell is the row's one loud signal |
| 11a | icon-only verbs UNDER a sticky header that names each                         | `LayerTableHeader.tsx` — sticky inside the scroll area, one head per verb button                       |
| 12  | fullscreen as a property of the panel primitive                               | `ui/Panel.tsx` — which is how the Inspector finally got one                                            |

Point 10's hardest half — "disabled versus enabled obviously different on the dark background
without colour doing the work" — is **also** done, and done by SHAPE:
`controls.css` `.cg-btn--verb:disabled` drops the fill AND the border, so an enabled verb is a
raised chip and a disabled one is a bare dimmed glyph. `--neutral` and `--icon` deliberately KEEP
their boundary, because they stand alone rather than in a column of peers. Two treatments, split
on purpose. **This already answers how `R-017`'s disabled REMOVE composes with the
neutral-buttons rule: it inherits, and adds nothing.**

**SUPERSEDED (2) — by a later owner decision, recorded in `layerTable.ts`.**

- **Point 1's "the REAL layer number kept on the row as a small fixed-width secondary"** — the
  LAYER column was removed altogether. The fact moved to the row's own `title` and
  `aria-label`, and to the Inspector.
- **Point 2's "description beneath the alias"** — the DESCRIPTION column was removed. The
  wire's occupancy report moved into the STATE cell's tooltip, which always ends with CasparCG's
  own words for it.

Both removals are argued where they were made and both are safe by the same construction — the
fact moved somewhere always reachable rather than being deleted. **But point 1's supersession
collides with a shipped R-028 acceptance bullet**, and that is a live tension, not a settled
one — see `§2`.

**GAPS (2).**

- **G1 — point 11's "a real table" is true visually and FALSE semantically.**
  `LayerTableHeader.tsx:164` carries `role="row"` with **no `role="table"` / `rowgroup`
  ancestor** — an orphan `row` is invalid ARIA — and the body rows carry `role="button"`
  (`LayerRow.tsx:635`), not `role="row"`. So a screen reader is handed no table structure at
  all, and the header words are announced as loose text rather than as the column headers of the
  glyphs beneath them. That matters more here than on an ordinary table: the header word is
  **the third channel that retires the icon-only misread risk**, and this product's STOP
  (graceful) and CLEAR (hard kill) are the inverse of the reference product's. `aria-label` on
  each button carries the verb, so nothing is unreachable — what is missing is the ASSOCIATION
  between the head and the control it names.
- **G2 — point 3's rigid grid is applied to ONE of the two surfaces inside the tab strip.**
  `PlayoutPanel.tsx` lays its rows out with `gridTemplateColumns: 'auto 1fr auto'` — the exact
  `auto`-sizing pattern `layerTable.ts` exists to replace, and whose failure mode that module
  documents by measurement ("a row aliased `lower-third` started its template name 20px further
  right than a row aliased `logo`"). It has no sticky header and no density ladder. See `§3`.

### §0.6 R-017 — unbuilt, all three halves · **CONFIRMED at `ec65480`, and the gap is WIDER**

The item's recon was written against `StackRow.tsx`, which no longer exists. Re-measured at
HEAD, **the finding survives the move intact**:

- **the row.** `layerRowActions.ts:526-534` — the REMOVE half of the LOAD/REMOVE toggle is
  `act('load-remove', 'REMOVE', false, …)`. Its only gates are the ones `act` ORs in centrally:
  `linkDown || awaiting`. **REMOVE still has no opinion about on-air state.**
  🔴 **And the gap has WIDENED since the item was filed.** R-021 stage 4 added a FIFTH gate,
  `blocked` (`restoreBlocked` — the row's layer is held by a producer that is not ours), and it
  was wired into PLAY, NEXT, SOURCE and AUDIO. REMOVE did not get it either. Re-counted at
  `ec65480`: PLAY gates on `empty || playing || rehearsing || blocked || needsCaspar`; NEXT on
  `empty || !onAir || !hasNext || blocked || needsCaspar`; UPDATE on `empty || !onAir || !dirty
|| needsCaspar`; STOP on `empty || !onAir || … || needsCaspar`; CLEAR on
  `needsCaspar || awaiting`; SOURCE and AUDIO on `empty || blocked || needsCaspar`. **REMOVE is
  the only verb on the row with no state condition whatsoever** — and it is the only one that is
  irreversible.
- **the bulk.** `LayersPanel.tsx` — `<Button … disabled={linkDown || items.length === 0}>` for
  REMOVE ALL. No `onAirCount` term, though `onAirCount` is computed four lines above it and
  already gates STOP ALL.
- **the bridge.** `packages/shared-ipc/src/channels/stack.ts` — `stack.remove` answers
  `{ accepted: boolean }` and `stack.remove-all` answers `{ ok, removed }`. **Neither response
  shape has anywhere to put a reason**, and neither implementation refuses anything. This is new
  capability across two different shapes, as the item says.

The item's ONE-AUTHORITY conflict is still live and still real: the renderer's `isOnAir`
(`features/stack/onAir.ts` — `status !== 'idle' && status !== 'loaded'`) and the bridge's
`#onAirCount` are **not the same set**. See `§5`.

### §0.7 The verb block's real constraints · **CONFIRMED at `ec65480` by tree hash**

`layerTable.ts` fixes the verb block by construction:

```
VERB_COUNT      = 6          VERB_COL_PX = 48      VERB_GAP_PX = 12
VERBS_WIDTH_PX  = 6*48 + 5*12 = 348px, at EVERY density — it never drops and never reflows
VERBS_GRID      = repeat(6, 48px)  — shared by the header's word row AND the row's button row
```

`LayerTableHeader.VERB_HEADS` holds exactly six entries and **its order must match the order
`layerRowActions` emits buttons** (LOAD/REMOVE · PLAY · ON PVW · NEXT · STOP · CLEAR; UPDATE is
menu-only). The module says what happens when it does not, from experience: the sixth button
wrapped to a second line, and every header word from NEXT rightward sat above the WRONG glyph.

**Why that is dangerous rather than untidy, stated in the tree and worth restating here: this
product's STOP is a graceful outro and its CLEAR is a hard kill — the inverse of the reference
product's — and the header word is precisely the channel that retires the misread.** A
misaligned head does not make the table look wrong; it makes CLEAR look like STOP.

**So a CONDITIONAL per-row control cannot go in the verb block.** A control present on some rows
and not others either shifts every head to its right, or occupies a column whose head is a word
that is false for most rows. That is the wall session AH met when the audio control could not go
inline.

**And that is exactly the answer sessions AG and AH then reached, twice, independently** — see
`§0.2`. SOURCE and AUDIO are both `surface: 'menu'`, both spread in conditionally on
`hasLivePlates`, and the verb block is untouched at six. The constraint held; what did not
happen is anyone writing the constraint down as a RULE, so the next control's author will
rediscover it from the same module comment or from the same collision. `§4`.

### §0.8 The three ownership classes — and whether the PLAYOUT tab leaks · **CONFIRMED**

R-028 `§6.5` settles three classes: **fixed operator rows 70–99** (the declared bank),
**reserved playout 60–69** (`reservedLayers`, C-015), **bridge-owned Live Source 10–59**.

Checked, not assumed: **the PLAYOUT tab does NOT list Live Source layers.** `PlayoutPanel` takes
`usePlayoutLayers()`, which is the `playoutLayers.state` channel, which is the declared
RESERVED set and nothing else. There is no `liveLayers()` accessor in the tree at HEAD.

The exposure is FUTURE, not present, and it is worth naming because the mechanism that would
create it is the convenient one: R-028 `§6.5` warns in its own text that the third class is
**not** `reservedLayers`, and the moment someone declares Live Source layers by adding them to
`reservedLayers` — the only existing "layers we do not allocate" list — they appear in this tab
with a CLEAR button, because the tab's only filter after that is `kind === 'html'` and a Live
Source carrier is not html. The `not-html` gate would in fact refuse the clear, so the failure
mode is a tab full of rows the operator cannot act on rather than a destroyed carrier — but the
first class would have leaked into the second's surface. Recorded as a constraint on `§6.5`'s
implementation, not as work here.

### §0.9 The conflicts between R-031, R-032 and R-033 — named and resolved

| #   | the collision                                                                                                                                        | resolution                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | R-031 pt 7 puts verbs on the row; R-033 pt 11 makes them icon-only in a table                                                                        | **Not a conflict — pt 11 is pt 7's implementation.** Both true in code. The header word is what makes icon-only safe; do not ship one without the other (R-033's own note)                                         |
| C2  | R-033 pt 1 keeps the real layer number on the row; the shipped code removed the column; R-028's acceptance says it is VISIBLE                        | **LIVE — `§2`.** Three sources, two answers                                                                                                                                                                        |
| C3  | R-033 pt 2 puts the description beneath the alias; the shipped code removed the column                                                               | **LIVE — `§2`**, same shape as C2 but weaker: no acceptance bullet demands it                                                                                                                                      |
| C4  | R-032 adds a tab; R-033 pt 4 puts CHANNEL tabs outside it                                                                                            | **Resolved in code by NESTING** — `ChannelScope` outer, LAYERS/PLAYOUT inner. Both items' notes demanded exactly this ("Channel 1 \| Channel 2 \| Playout in one strip is ambiguous about whose playout it means") |
| C5  | R-032's PLAYOUT rows vs R-033 pt 3's rigid grid                                                                                                      | **LIVE — `§3`.** The rule exists and was applied to one of the two surfaces                                                                                                                                        |
| C6  | R-031 pt 8 (present-but-disabled) vs R-021 stage 2b (never an enabled control that can only reject) vs R-032 (NO control at all where not clearable) | **Resolved — three rules, ONE boundary. See below.** A THIRD case has since appeared that the boundary does not cleanly decide (`§4.2`)                                                                            |
| C7  | R-017's disabled REMOVE vs R-033 pt 10's neutral buttons                                                                                             | **Resolved in `controls.css`** — `--verb:disabled` drops fill AND border; disabled reads as disabled by SHAPE, not by colour                                                                                       |

**C6 is the one worth writing down, because all three rules are right and they look like they
disagree.** The boundary is _what kind of fact the unavailability is_:

- **A property of the row's own state, which WILL change** ⇒ the control is PRESENT and
  DISABLED, with a title naming the remedy. LOAD while the bridge is down, PLAY on an idle row,
  NEXT on a single-step template. This is R-031 point 8, and it wins as written.
- **A permanent property of what is on SOMEONE ELSE'S layer** ⇒ NO control at all, and the
  reason printed in the row. A video on a playout layer is not going to become clearable. This
  is R-032's rule.
- **An ENABLED control that can only ever reject** ⇒ forbidden outright. This is R-021 stage
  2b's rule, and a DISABLED control is not an instance of it.

`PlayoutPanel.tsx` already argues exactly this split for its own two cases — reachability
(transient, so the control stays present and disabled) versus layer state (permanent, so the
control is absent) — and warns against conflating them. **That module comment is the ONE place
this rule lives. Nothing in this design restates it as a second rule; `tasks.md` points at it.**

⚠ **The boundary now has a THIRD case it was not written for, and it does not cleanly decide
it.** SOURCE and AUDIO are absent — not disabled — on a row whose template declares no plates.
That fact is permanent for as long as this template sits on this row, and changes the instant it
is re-loaded, so it is on the line between the first two bullets rather than inside either.
`§4.2` puts it to the owner, and the answer belongs in that same module comment as a third case,
never as a fourth statement of the rule.

---

## §1 — GATE: the Library is deleted. Does the template PICKER go too?

**Status: the panel is gone and its capabilities were re-homed (`§0.3`). This gate is about the
one surface that still shows a LIST of templates.**

R-031 point 2 says the Library is DELETED — not hidden, not demoted. The panel is. But LOAD
opens `useTemplatePicker`, a dialog listing every already-imported template, with importing a
new `.vcg` as one option inside it. A strict reading of point 2 could call that the Library
wearing a different hat.

| candidate                                                                                          | cost                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) The picker stays.** A list reached inside one action is a STEP, not a panel. _(recommended)_ | A list of templates still exists in the product. If the owner's intent was "no template ever sits anywhere but on a row", this does not deliver it                                                                                                                                                               |
| **(B) LOAD always opens the file chooser; no list anywhere.**                                      | Deletes R-005's remove-a-template — the picker is its only remaining surface — and forces a re-import of an already-imported `.vcg` on every load, which is the exact tedium the picker was built to fix. Also strands the second-browser case: operator B cannot load what operator A imported without the file |

### §1.1 — sub-gate, only if (A): should the picker be reachable from anywhere but LOAD?

Today it is not, deliberately (`layerRowActions.ts` §6: "there is no longer a second,
similarly-named control to choose between under time pressure"). Confirm, or name the second
entry point.

---

## §2 — GATE: R-033 points 1 and 2 were SUPERSEDED. Does the supersession stand?

**This is the sharpest thing the recon found, because three sources give two answers.**

- **R-033 point 1** (owner, chat review): the real layer number is kept on the row as a small
  fixed-width secondary.
- **R-028 acceptance** (shipped item): _"WHEN any row is displayed THEN its REAL CasparCG layer
  number is visible (a display index may sit beside it, never instead of it) — an operator may
  need it to clear that layer by hand."_
- **`layerTable.ts`** (later owner decision, in code): the LAYER column is removed; the number
  lives in the row's `title` and `aria-label`, and in the Inspector.

The code is the most recent decision, and its argument is sound as far as it goes — the fact
moved somewhere always reachable. **But "visible" and "reachable by hovering" are not the same
claim, and R-028's bullet names the exact scenario that distinguishes them: an operator reaching
for the number in order to clear that layer BY HAND, which is a thing done when the console is
not helping, i.e. under pressure and possibly with a dead link.** A tooltip requires a hover, a
dwell, and a working pointer.

| candidate                                                                                                                      | cost                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) The supersession stands.** Tooltip + `aria-label` + Inspector are enough. R-028's bullet is AMENDED to say so.           | The one scenario the bullet names gets slower. **R-028's acceptance text must actually be amended** — leaving it as-is means shipping against a criterion that is not met, which is worse than either answer                       |
| **(B) Point 1 as written.** A ~36px fixed-width secondary beside the `#`, at `full` and `compact` density, dropped at `tight`. | ~36px + one gap off the alias/template slack at two densities, and one more rung in the density ladder to get right. `minWidthFor` and `gridTemplateColumns` both change; both are unit-tested, so the cost is bounded and visible |
| **(C) Point 1 as written, but only when the link is DOWN.**                                                                    | Rejected on sight and recorded so it is not re-proposed: a column that appears on failure is a layout that moves at the worst moment — the thing this whole grid exists to prevent                                                 |

**§2.1 — the same question for the DESCRIPTION (point 2), where it is weaker.** No acceptance
bullet demands it, the state cell's tooltip carries CasparCG's own words, and re-adding it costs
a third flexible column. Default answer: the supersession stands. Confirm or overturn.

---

## §3 — GATE: does the PLAYOUT tab adopt the column model?

The rigid grid, the sticky header and the density ladder are R-033's answer to "nothing moves
when text changes length". They govern the LAYERS tab. The PLAYOUT tab — the other surface
inside the same tab strip, one click away, and the one an operator opens when another system's
graphic is on air — is laid out with `auto 1fr auto` and has no header.

**This is the "one rule, derived twice" hazard in its mildest and most likely form: not two
implementations of a rule, but one implementation and one surface that never got it.**

| candidate                                         | cost                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(A) PLAYOUT adopts the model.** _(recommended)_ | The two tables do NOT have the same columns — playout rows carry a layer number instead of a row number, no template, and a control on only some rows. So "one model" means `layerTable.ts` grows a second COLUMN SET, not that both call the same constant. Real work, and it must not turn `layerTable.ts` into a configuration language |
| **(B) PLAYOUT stays a simple list.**              | Two spellings of the same promise, and the guarantee is absent from the tab where a surprise is least welcome. Also blocks G1's semantics landing once for both                                                                                                                                                                            |

**§3.1 — if (A): does the PLAYOUT tab get a STICKY HEADER too?** Its rows have no icon-only
verbs, so the header's safety argument does not transfer — but its column-naming argument does.

---

## §4 — the verb-block admission rule: ANSWERED by precedent. Two things left.

**The placement question this design was written to gate is already decided in code** (`§0.2`).
SOURCE and AUDIO both went to the CONTEXT MENU, conditionally present on `hasLivePlates`, and
the verb block stayed at six. Nothing here proposes moving them.

### §4.1 — CONFIRM the rule, so the third control does not rediscover it

The rule the code follows, stated once:

> A control enters the verb block **ONLY IF it is declared for every row**, and its head is added
> to `VERB_HEADS` in the SAME change that adds the button. Availability that varies by STATE is
> fine — that is a disabled button in a fixed column, R-031 point 8's own pattern. Presence that
> varies by ROW is not: it either shifts every head to its right onto the wrong glyph, or claims
> a column whose head is a word most rows make false. Anything conditional goes to the context
> menu (or the Inspector), never into the block.

**This belongs in `layerTable.ts`'s `VERB_COUNT` note and `LayerTableHeader.tsx`'s head list —
the two places a violation is actually made — not in a third document.** Half of it is already
there ("Adding a button here without adding its head to `VERB_HEADS` re-opens it"); what is
missing is the conditional case, which is the half two sessions had to work out for themselves.

Confirm the wording, or say what it should be instead.

### §4.2 — CONFIRM: the conditionally-ABSENT menu item is DECIDED. It is not written where the rule lives.

The first draft of this section put the absent-vs-disabled question to the owner as an open gate.
**Reading `live-source-multibox` task 6.9e settles it — the decision was made and argued when the
control shipped**, in the task's own words:

> Offered ONLY on a row whose template declares plates — a permanently-disabled entry in thirty
> row menus is furniture that teaches the operator to stop reading the menu — and NOT gated on
> `onAir`, because patching around a dead feed on a live graphic is the entire use of it.

That is a genuine argument and it beats R-031 point 8's fixed-shape rule **for the menu
specifically**, on a ground point 8 does not cover: point 8 protects a spatial target from moving
under a reaching hand, which is a property of a fixed row of buttons and not of a vertical list
opened on demand. Task 6.5f records the owner's placement reasoning for AUDIO beside it, with two
alternatives explicitly rejected (inside the swap dialog; on the PLAYOUT tab).

**So there is nothing to decide. There is something to WRITE DOWN**, and it is a third case of
the `§0.9` C6 boundary that the boundary's own text does not cover:

> **The fixed verb BLOCK and the context MENU take different rules, and the reason is spatial.**
> In the block, availability varies by STATE and presence never does — a control that appears and
> disappears moves the target under the operator's hand. In the MENU there is no target to move:
> a list opened on demand may vary in length, and a permanently-dead entry in thirty row menus
> teaches the operator to stop reading it.

**This goes beside the C6 boundary in `PlayoutPanel.tsx` as a third case, never as a fourth
statement of the rule.** Confirm the wording, or say what it should be.

⚠ **One residual cost, recorded rather than resolved, because it is a consequence of a decision
already taken:** the menu's LENGTH now varies by row, so a muscle-memory click at the bottom of
the menu lands on REMOVE for a plate row and on something else otherwise. `menuLast` puts REMOVE
last in both cases, which mitigates it. Worth watching in use; not worth reversing a decision that
was argued.

---

## §5 — GATE: R-017's ONE AUTHORITY — which on-air set?

🔴 **CHANGED since `ai-stale`, and this is the most consequential correction in the whole
re-verification.** R-017's notes direct "read the EXISTING shared `isOnAir`". `onAir.ts` is one of
the four files the 68-commit span touched, and while its BODY is byte-for-byte the same, **B-122
rewrote its CONTRACT** — the module now carries, in its own words:

> ⭐ **B-122 — THIS IS NO LONGER CLEAR-ALL'S PREDICATE, AND MUST NOT BE MADE ONE AGAIN.** … It
> gated the EMERGENCY control on the believed status — precisely the value that may be wrong in
> the emergency … ⚠ It must never gate a clear path again, on either side of the bridge seam.

And the bridge side acquired a canonical predicate of its own in the same span —
`isOnAirStatus(status, pending)` (`caspar-runtime.ts:224`), extracted precisely because a fourth
inline copy is how one comes to disagree, citing CLAUDE.md golden rule 6, with four consumers
already (R-010's `setConfig` gate, R-030's raster gate, rehearse entry, rehearse abort). Its own
doc states the principle R-017 needs: _"Unknown must count as on air in every one of these gates,
because each one's failure mode is acting on a live graphic."_

So the choice is no longer "one of two status lists". Re-measured at `ec65480`:

| set                                                       | reads                                                                                          | misses                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| renderer `isOnAir` (`features/stack/onAir.ts`)            | status only — everything except `idle`/`loaded`, so `unverified`/`error`/`disconnected` are IN | **`pending` entirely** — it never reads the field, though `StackItemState` carries it |
| bridge `isOnAirStatus` (`caspar-runtime.ts:224`, private) | `pending \|\| playing \| on-air \| updating \| exiting \| unconfirmed`                         | `unverified`, `error`, `disconnected`                                                 |
| occupancy — "this row HOLDS A LAYER"                      | the bridge's `#slots` map, status-independent                                                  | says nothing about whether the layer is showing anything                              |

Neither existing predicate is a superset of the other, which is the fact that makes this a real
decision rather than a formality.

| candidate                                                                                                                                             | cost                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `isOnAir` on both sides** — the item's own written direction                                                                                    | It misses `pending`, so a row mid-take is removable. And it forces the BRIDGE to grow a second predicate beside `isOnAirStatus` — the exact second copy that predicate's doc was extracted to prevent. **Weaker than it looked before this re-verification**                                                     |
| **(B) `isOnAirStatus` on both sides**, promoted out of `caspar-runtime.ts` into a shared package so the renderer can import it _(recommended)_        | `unverified` / `error` / `disconnected` become removable — fail-OPEN on exactly the states where we cannot confirm what is on air, which is the wrong direction for an irreversible verb. Needs the promotion, which is mechanical. **Mitigated by (D) below**                                                   |
| **(C) Occupancy — refuse REMOVE while the row holds a layer**, the axis B-122 moved Clear-All to                                                      | Status-independent, so B-122's "the believed status may be wrong" objection cannot touch it. But it is far wider than "on air": a `loaded`-not-played row holds a layer, and R-017 explicitly wants that one removable. Would refuse the ordinary case                                                           |
| **(D) `isOnAirStatus` widened to the UNION** — add `unverified`/`error`/`disconnected` to it, then use it on both sides _(recommended if (B) is not)_ | Changes the predicate FOUR other gates already read, so rehearse and `setConfig` get stricter too. That may well be right — each of those four also fails by acting on a live graphic — but it is a change to shipped on-air behaviour and must be decided deliberately, not inherited as a side effect of R-017 |

**The recommendation is (B), and (D) only if the owner wants the union.** What must not happen is
(A) as written: it was the right answer against the tree R-017 was filed on, and the tree moved.

⚠ **Whichever wins, the answer is ONE predicate imported by both sides, never mirrored.** The
bridge's `isOnAirStatus` is module-private today, so "share it" means moving it — and moving it is
what makes mirroring unnecessary. That is the whole of R-017's ONE-AUTHORITY direction, and it
survives the correction intact even though its named answer does not.

---

## §6 — GATE: R-010's unblock copy, and the E2E that asserts it

R-017 makes Remove-All disabled while anything is on air. Four places currently name Remove-All
as the way to unblock a blocked Apply, and each becomes self-contradictory —
`ServerSettingsPanel.tsx`, `MockRuntime.ts`, the bridge's own message in `caspar-runtime.ts`,
and the assertion of that literal string in `serverSettingsPanel.dom.test.ts`.

The remedy gets SHORTER, not longer: Apply gates on the on-air COUNT, not on stack emptiness, so
**CLEAR-ALL alone unblocks it**.

| candidate                                                    | cost                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) The copy names Clear-All everywhere.** _(recommended)_ | `apps/runtime/tests/e2e/server-settings.spec.ts` step 2 clicks Remove-All and then asserts "No items loaded". After Clear-All the rows correctly REMAIN, idle — so the assertion changes SHAPE, not just wording |
| **(B) Keep naming Remove-All.**                              | The copy names a control that is disabled precisely because of the condition it is reporting                                                                                                                     |

R-010's own gate is FROZEN either way. Only the remedy wording and the recovery path move.

---

## §7 — CONFIRM: PGM / Preview are already reserved

R-033 point 7 asks for them "now". **They are already there** — `MonitorStrip` in `App.tsx`,
labelled NOT CONNECTED, height persisted and keyboard-nudgeable through `ShellDivider`, and
fullscreen-able because `Panel` gives every panel that control (point 12).

Nothing to decide unless the owner wants something different from what shipped. Listed so the
item can be closed against evidence rather than left open because nobody checked.

---

## §8 — CONFIRM: the PLAYOUT clear's confirm gate

R-032's per-layer CLEAR **is** confirm-gated (`confirmAndClearOne`), and CLEAR ALL carries its
own single confirm naming the count, the layer numbers, that these are not our layers, and the
exclusions. The bulk path deliberately does NOT re-confirm per layer — N dialogs for one
decision would be worse than none — while the BRIDGE's gate still applies per layer, so a bulk
action can never clear something the single action would refuse.

The fixed-row CLEAR is the _reverse_: not confirm-gated at all, because it is the escape hatch
and a confirm on a remedy is a delay on a graphic stuck on air.

**The asymmetry is deliberate and correct — our layer versus someone else's — and it is recorded
here so it is not "harmonised" later in either direction.** Confirm.

---

## Landing order

**R-017 is separable and should go FIRST.** It touches the REMOVE branch of `layerRowActions.ts`,
one `disabled` expression in `LayersPanel.tsx`, two response shapes in `shared-ipc`, and the
bridge. It touches **nothing** in `layerTable.ts`, `LayerTableHeader.tsx`, `ChannelScope`, the
tabs, or `PlayoutPanel`. It does not change `VERB_COUNT` or `VERB_HEADS`. And it is the only
on-air-safety item among the six: today a live graphic can be destroyed and its row dropped in
one unconfirmed click.

| wave | contents                                                                           | why together / why alone                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `§5` + `§6` → R-017 (row, bulk, bridge, copy ripple, E2E)                          | Independent of every other wave. On-air safety. The bridge half and the UI half MUST land together — a UI-only gate is not a prohibition, and a bridge-only one leaves the operator clicking a button that always fails                                                                                          |
| 2    | `§3` + G1 → the PLAYOUT grid **and** the table semantics                           | **Together, and this is the only hard coupling in the design.** If PLAYOUT adopts the column model first, the ARIA roles must then be written twice; if the roles land first, they are written for one table and immediately need extending. One rule, one place, one commit                                     |
| 3    | `§2` → R-033 points 1/2, whichever way they resolve                                | Alone. Touches only `layerTable.ts`'s column set + the header + the row. If (A), the work is amending R-028's acceptance text, not code                                                                                                                                                                          |
| 4    | `§4.1` + `§4.2` → the admission rule written down, and the conditional-menu answer | Alone, and CHEAP — `§4.1` is two comment blocks in the files where a violation is actually made. It sits late in the order only because it is no longer URGENT: the placement it would have gated is already shipped. Doing it at all is what stops the FOURTH control rediscovering the constraint by collision |
| 5    | `§1` → the picker's fate                                                           | Alone. Only if (B); (A) is a no-op                                                                                                                                                                                                                                                                               |

`§7` and `§8` produce no wave — they are confirmations against shipped behaviour.
