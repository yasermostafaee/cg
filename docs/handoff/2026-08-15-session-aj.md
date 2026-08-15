# Session AJ — the operator surface, designed as ONE surface (re-verified)

**Read at `ec65480d71952db4fc6d997f74474d186ae38d0f`, pulled 2026-08-15.** Verified
`HEAD == origin/dev`, working tree clean, before a single file was read.
**Branch:** `dev` · **Ships:** design + docs only, no product code.

---

## 0. Why this session exists, and the commit that was never landed

Session AI produced a full design of this surface and stated throughout that it had "re-measured
at HEAD (`2a44247`)". **`2a44247` was not HEAD.** The clone was **68 commits behind
`origin/dev`**, `git status` was clean, and nothing announced it. The 68 missing commits are
sessions AC–AH, which touched four of the files AI examined.

That work is commit **`15d6754`**, preserved as the local branch **`ai-stale`** (parent
`2a44247`). **It was never landed and must not be.** Its own commit message asserts _"find four
of the six items already built"_ — a count measured on the wrong tree, baked into the message
where the next reader would cite it. A design written on the wrong tree is worse than no design.

It was used as INPUT to this session and nothing else: read in place with `git show ai-stale:…`,
never copied forward unmarked.

**Two permanent rules came out of it:**

- **`git pull --ff-only` is step 0 of every session**, before reading a single file.
- 🔴 **Never `reset --hard` a commit away — `git branch <name> <sha>` first.** The abandoned work
  here survived only because the reflog had not expired.

## 1. Blast radius — `2a44247..ec65480`, computed before re-reading anything

`git rev-list --count` per path, plus a tree-hash comparison. This is what decided where to look
hard versus glance: an IDENTICAL file cannot have invalidated a claim about it.

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

🔴 **`VERB_COUNT` was checked FIRST and did not move.** `layerTable.ts` and
`LayerTableHeader.tsx` are byte-identical across the whole span, so `VERB_COUNT` is still 6,
`VERB_HEADS` still has six entries, and every degradation rule, density minimum and
header-alignment claim computed off that number stands. The obvious hypothesis — that AF/AG/AH
widened the block to fit the two new controls — is **false**; they went to the menu.

## 2. What CHANGED versus `ai-stale` — six claims, one materially

| #   | `ai-stale` said                                                  | the real tree at `ec65480`                                                                                                                                                         |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | R-021 stage 4 task 3.1 is in code but its box is unticked        | **Every stage 4 box is ticked** (`e326a96`). The whole finding was a stale-tree artefact and is DELETED                                                                            |
| 2   | R-028 `§6` is open                                               | **`§§6–7` landed** (`25c2142`)                                                                                                                                                     |
| 3   | `§4` is an open gate blocking `live-source-multibox` 6.9e        | **6.9e shipped.** `§4` becomes a rule to write down, not a placement to choose                                                                                                     |
| 4   | (could not be raised)                                            | **NEW `§4.2`** — SOURCE/AUDIO are the first row affordances whose PRESENCE varies by row                                                                                           |
| 5   | REMOVE lacks the gate every other verb has                       | **Still true, and WIDER** — R-021 stage 4 added a fifth gate (`blocked`) to PLAY/NEXT/SOURCE/AUDIO; REMOVE did not get that one either                                             |
| 6   | `§5`: read the existing `isOnAir` on both sides — a confirmation | 🔴 **MATERIALLY CHANGED.** B-122 rewrote `isOnAir`'s contract; the bridge grew its own canonical `isOnAirStatus`. Four candidates now, and **(A) is no longer the recommendation** |

**Nothing recorded as ALREADY BUILT turned out to be unbuilt, and nothing recorded as UNBUILT
turned out to be built.** That direction was predictable — no session in the span set out to
build or delete this surface — but it is stated as a result, not assumed: R-031's eight points,
R-032's bullets, R-033's ten, and R-017's three unbuilt halves were each re-read on the real tree.

## 3. The three things worth reading first

### 3.1 R-017 is real, unbuilt, separable — and the gap has WIDENED

CONFIRMED at `ec65480`, in a file that changed three times in the span, so this was re-read
rather than assumed:

- `layerRowActions.ts` still declares `act('load-remove', 'REMOVE', false, …)`.
- `LayersPanel.tsx` still disables REMOVE ALL on `linkDown || items.length === 0`.
- `stack.remove` still answers `{ accepted }`; `stack.remove-all` still `{ ok, removed }`.

**And R-021 stage 4 added a fifth verb gate, `blocked`, wiring it into PLAY, NEXT, SOURCE and
AUDIO. REMOVE did not get that one either.** Re-counted, REMOVE is now the only verb on the row
with no state condition whatsoever — and the only irreversible one.

### 3.2 §5's recommendation INVERTED, and this is the correction that mattered most

R-017's notes direct "read the EXISTING shared `isOnAir`". `onAir.ts` is one of the changed
files. Its BODY is byte-identical — but **B-122 rewrote its contract**: _"THIS IS NO LONGER
CLEAR-ALL'S PREDICATE… It must never gate a clear path again, on either side of the bridge
seam."_ Meanwhile the bridge acquired `isOnAirStatus(status, pending)` — canonical, four
consumers, extracted explicitly under CLAUDE.md golden rule 6.

Neither is a superset of the other: the renderer's never reads `pending` at all; the bridge's
omits `unverified` / `error` / `disconnected`. `design.md` `§5` now carries four candidates and
recommends **(B)** — promote `isOnAirStatus` out of `caspar-runtime.ts` and import it on both
sides — or **(D)**, the union, if the owner wants the stricter set. **What must not happen is
(A) as written**: it was right against the tree R-017 was filed on, and the tree moved.

### 3.3 Two gaps, unchanged, and they land together

Both re-measured on files with ZERO commits in the span, so both are confirmed by tree hash plus
a re-read:

- **The table is a table visually and not semantically.** `LayerTableHeader.tsx` carries
  `role="row"` with no table-role ancestor — an orphan role — while body rows carry
  `role="button"`. No table structure reaches assistive tech, so the header words are announced
  as loose text rather than as the column headers of the glyphs beneath them. That matters here
  more than on an ordinary table: the header word is the third channel retiring the icon-only
  misread, and this product's STOP and CLEAR are inverted versus the reference product's.
- **The rigid grid never reached the PLAYOUT tab** — still `gridTemplateColumns: 'auto 1fr auto'`,
  the exact pattern `layerTable.ts` exists to replace, with no sticky header and no density ladder.

**These land in ONE commit** — the only hard coupling in the landing order. Splitting them writes
the ARIA roles twice, or writes them for one table and immediately extends them.

## 4. What AUDIO and SOURCE actually are — redone, not re-checked

AI designed their placement from a description. Read in code:

```
...(deps.hasLivePlates ? [ act('swap-source', 'SOURCE', …, 'menu', …) ] : []),
...(deps.hasLivePlates ? [ act('plate-audio',  'AUDIO',  …, 'menu', …) ] : []),
```

Both in the CONTEXT MENU, both conditionally present on `hasLivePlates`, verb block untouched at
six. **The constraint AH measured held — twice, independently, from the same module comment —
and nobody wrote it down.** That is what `§4.1` fixes, and it costs two comment blocks in the
files where a violation is actually made.

`§4.2` is what the collision never raised: these are the first row affordances whose PRESENCE
varies by row, and the C6 boundary (present-disabled vs absent vs never-enabled) does not cleanly
decide them. "This template declares no plates" is permanent while this template sits on this
row, and changes the instant it is re-loaded.

## 5. The C6 boundary — three rules that look contradictory and are all right

The rule most likely to be "simplified" by a later reader. The boundary is _what kind of fact the
unavailability is_:

- **A property of the row's own state, which WILL change** ⇒ PRESENT and DISABLED, titled with
  the remedy. (R-031 point 8.)
- **A permanent property of what is on SOMEONE ELSE'S layer** ⇒ NO control at all, reason printed
  in the row. (R-032.)
- **An ENABLED control that can only ever reject** ⇒ forbidden. A DISABLED control is not an
  instance of it. (R-021 stage 2b.)

`PlayoutPanel.tsx` already argues this split for its own two cases. **That module comment is the
ONE place this rule lives** — the design points at it and does not restate it, and `§4.2`'s
answer goes there as a third case rather than as a fourth statement.

## 6. What landed

- **`openspec/changes/operator-surface/`** — `proposal.md`, `design.md`, `tasks.md`, `runtime-ui`
  spec delta. `--strict` green. `§0` is the only complete section; every task in sections 1–6
  carries a `⟨GATE: §x⟩`.
- **PRD cross-references** re-authored from the corrected facts into all six items.
- **A pointer from `live-source-multibox` 6.9e** recording why the placement is what it is.

## 7. Gate

Docs-only: `openspec/**` + `docs/**`. `pnpm openspec validate --all --strict` green, `pnpm gate`
green (uncached).

**No Linux `gate:e2e` owed for this change** — no file matching `UI_RENDER_PATTERNS` is touched.
**Every task in sections 1–5 of `tasks.md` owes its own**, and none may be ticked on a Windows run.

## 8. Next session

`git pull --ff-only` first. Then answer the gates and take wave 1 (R-017). `§5` is now a real
decision rather than a confirmation — read `§5` before `§6`.

## NOT in this session

No behaviour change, no implementation, no plant-trip measurements, no minted numbers, no
archive, no merge to `main`, and **`ai-stale` was not pushed, merged, rebased or cherry-picked**.
`live-source-multibox`'s closing tasks (8.3 / 9.1 / 9.2) ride the next implementation session.
