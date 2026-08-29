# A new Live Source plate points at NOTHING (`B-183`), and an export refusal is drawn red (`B-184`)

## Why

The owner opened a template on the root composition and found a Live Source plate flagged
`look-source-undeclared`: its `routeKey` was `live-1` while the group declared `l1` and `l2`.
**He never typed `live-1`.**

`live-N` is the **placeholder text of the Looks panel's `+ Source` input** — the panel's suggested
next name. It was also, independently, what every new plate was born holding:

- `defaultLiveSource(…, routeKey = 'live-1')` (`element-defaults.ts`), and
- `nextLiveSourceId(scene)` from the canvas tool — the first free `live-N`, swept scene-wide.

Nothing declared either. So **drawing a box created a plate already referencing an undeclared
source**, and the group-scope preflight then reported the tool's guess as the author's mistake.

⭐ The owner's principle, stated 2026-08-26: **nothing lands unconfirmed.**

### What was measured first — and what it killed

Two hypotheses were tested against one fixture (a plate holding `live-1` in a group declaring
`l1`/`l2`), comparing what the scene holds, what the preflight reads, and what the Inspector
renders **in the same test**:

| hypothesis                                                                     | verdict                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a new plate takes its `routeKey` from the suggested-name generator, undeclared | **CONFIRMED** — `defaultLiveSource` → `"live-1"`; the canvas tool → `nextLiveSourceId`                                                                                      |
| the Inspector renders the DECLARED list and falls back to the first option     | 🔴 **FALSE.** It renders `live-1` and labels it `live-1 (undeclared)`. Measured: `select.value = "live-1"`, `options = ["live-1\|live-1 (undeclared)", "l1\|l1", "l2\|l2"]` |

So the Inspector was **already honest** and is not changed in that respect — `StyleSection.tsx`'s
own comment (_"A dangling legacy value is shown as itself, labeled undeclared, so the select never
lies about the scene"_) was true. What it could not render was the state this change introduces:
**no source at all.**

## What Changes

1. **`routeKey` becomes OPTIONAL on the element** (`@cg/shared-schema`) — and **only** on the
   element. `LookSource.routeKey` stays required: a plate may not yet have a source, a
   DECLARATION always names one.
2. **A new plate is created UNASSIGNED.** `defaultLiveSource` drops the parameter entirely, and
   `nextLiveSourceId` is **deleted** rather than left unused.
3. **A new refusal, `live-source-unassigned`**, in DOCUMENT scope so it fires with or without a
   look group. It replaces two wrong messages an absent value used to produce: the device-id
   refusal (_"is not symbolic (“undefined”)"_) and `look-source-undeclared` (_"references source
   “”"_).
4. **Both refusals name the remedy** — the panel, the row, and what belongs in it.
   `look-source-undeclared` names **both** legitimate remedies, because either may be what the
   author meant.
5. **The Looks panel draws an export refusal in `danger`, not `caution`** (`B-184`).
6. The plate's bars label reads `no source` when unassigned.

### 🔴 What is deliberately NOT changed

- **The rule is not weakened.** No tolerance, no severity downgrade, no suppression in the root
  scope. `look-source-undeclared` keeps its reasoning and its `error` severity.
- **No one-click fix button.** The owner considered and declined it: it needs an undoable scene
  mutation and is its own item.
- **Existing data is not repaired.** An undeclared `routeKey` is the author's to fix.
- **The Inspector's `(undeclared)` rendering** — already correct, verified before the work
  started, left alone.
- **The check is not extended into look compositions.** Filed separately if wanted; not done here.

### Rejected alternatives, recorded so they are not relitigated

- **Default to the first declared source** — silently binds two plates to one input and the error
  is never seen.
- **Keep `live-N` and auto-declare it** — creating a box would edit the group's source list
  without being asked.

## Impact

- Affected specs: `designer-live-source` (MODIFIED — a plate's source becomes a three-state
  contract: chosen, dangling, or unassigned).
- Affected code: `packages/shared-schema/src/elements.ts`, `packages/shared-schema/src/scene-flatten.ts`,
  `packages/vcg-format/src/live-sources.ts`, `packages/template-runtime/src/scene-builder.ts`,
  `apps/designer/src/renderer/state/element-defaults.ts`,
  `apps/designer/src/renderer/state/live-source-preflight.ts`,
  `apps/designer/src/renderer/features/canvas/CanvasOverlay.tsx`,
  `apps/designer/src/renderer/features/inspector/StyleSection.tsx`,
  `apps/designer/src/renderer/features/inspector/LooksSection.tsx` + `.css.ts`.
- Affected PRD items: `B-183` and `B-184` (both filed and fixed here).
