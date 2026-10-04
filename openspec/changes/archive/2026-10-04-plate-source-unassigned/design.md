# Design — `B-183` / `B-184`: the plate points at nothing until the author says otherwise

## 1. What was measured before anything was changed

The brief carried two hypotheses. Both were tested against one fixture — a plate holding `live-1`
under a group declaring `l1`/`l2` — comparing the scene, the preflight and the Inspector **in the
same test**, because the defect could only ever be a disagreement between them.

| hypothesis                                                                   | verdict                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| a new plate's `routeKey` comes from the suggested-name generator, undeclared | **CONFIRMED** — `defaultLiveSource(…, routeKey = 'live-1')`, and the canvas tool passed `nextLiveSourceId(scene)` |
| the Inspector renders the DECLARED list and falls back to its first option   | 🔴 **FALSE**                                                                                                      |

Measured for the second: `select.value = "live-1"`, and
`options = ["live-1|live-1 (undeclared)", "l1|l1", "l2|l2"]`.

⚠ **So half this brief was wrong, and the half that was wrong is the half that would have been
"fixed".** `StyleSection`'s own comment already said so — _"A dangling legacy value is shown as
itself, labeled undeclared, so the select never lies about the scene"_ — and the code did exactly
that. Nothing about it is changed. It is now covered by a test, because an honest control that
nothing pins is one refactor from becoming a dishonest one.

**What the Inspector genuinely could not render is the state this change introduces: no source at
all.** That is the only part of hypothesis 2 that turned out to need work, and it exists only
because hypothesis 1 was true.

## 2. Why `live-1` was there, and why the reason had expired

`element-defaults.ts` argued the default this way:

> `routeKey` defaults to `live-1`, NOT to an empty string: the id is required by the schema and
> symbolic by refinement, so an empty default would create an element that cannot be saved. `live-1`
> is also visible on the canvas (it is the bars' label), which is what tells the author there is
> something to set.

- **The first clause was TRUE and is now false by construction.** `routeKey` is optional on the
  element, so absence is storable. That is the whole reason a schema change was necessary rather
  than optional: without it there is no honest value to default to.
- **The second clause was the defect.** The label did not say _"there is something to set"_; it said
  _"this is set, to `live-1`"_. And `live-N` is the placeholder text of the Looks panel's
  `+ Source` input — a suggestion the author had not accepted. The bars now read `no source`, which
  says what the old default only pretended to.

## 3. The schema change is deliberately asymmetric

`VideoPlaceholderElement.routeKey` becomes optional. `LookSource.routeKey` does **not**.

Widening the shared `LiveSourceIdSchema` instead would have been one edit rather than two, and it
would have let a group declare an empty source — the one thing that must stay impossible. The
asymmetry states the actual rule: **a plate may not yet have a source; a declaration always names
one.**

The blast radius was measured rather than estimated: 53 files mention `routeKey`, and the compiler
found every site that needed changing — 3 packages, 2 designer files — because this is a TYPE
change and `strict` mode is the sweep. (Contrast `B-181`'s lesson about string changes, where the
compiler cannot help and only a `git grep` can.)

⚠ **And the compiler was not a complete sweep here, for a reason worth recording:**
`apps/designer/tsconfig.json` includes `src/**/*` only, so **the designer's tests are never
typechecked**. Two test files kept calling `defaultLiveSource(id, x, y, 'guest-1')` with a fourth
argument that no longer exists, and `pnpm typecheck` stayed green. They were found by `git grep`,
not by `tsc`. Filed as `B-186`.

## 4. Two mistakes, two messages

An absent `routeKey` used to fall into two checks that both then said something false:

| check                    | what it said about an unassigned plate                   |
| ------------------------ | -------------------------------------------------------- |
| `live-source-device-id`  | _"names a source id that is not symbolic (“undefined”)"_ |
| `look-source-undeclared` | _"references source “”"_ (after `?? ''`)                 |

Both describe a plate that **has** a source and got it wrong. Neither describes one that has none.
So `live-source-unset` is a separate code, and each of the two old checks now declines the
state that is not its own.

🔴 **In DOCUMENT scope, not group scope.** `look-source-undeclared` is group-scoped by nature — it
compares against a declared list. Being pointed at nothing is not: a plate with no source can never
be seated by anyone, group or no group. So the new refusal fires for every plate in every template.

### The remedy, and why it is computed once

Both messages name the panel, the row, and what belongs in it. Which ROW exists depends on the
template: `StyleSection` renders the `source` picker when the project declares a look group and the
free-text `source id` box when it does not. Naming the wrong one would be worse than naming none, so
the sentence is resolved once from `scene.lookGroups` and shared.

`look-source-undeclared` names **both** remedies — fix the plate, or declare the name — because
either may be what the author meant. Naming only the first would push an author who meant the name
toward retyping it somewhere it still is not declared.

🔴 **No one-click fix.** The owner considered and declined it: it needs an undoable scene mutation
and is its own item. And the messages do not repair anything — an undeclared `routeKey` is the
author's to fix, which is pinned by a test asserting that rendering the Inspector is not a write.

## 5. `B-184` — the token already decided this

The Looks panel drew export refusals in `caution` while the status bar drew the same facts red.

The theme's own comments settle it without a judgement call:

- `caution` — _"a legitimate state the operator should NOTICE, but which is not an error"_;
- `danger` — _"red is reserved for real errors"_.

A blocked export is the second: the author cannot export at all. So the amber was contradicting the
token that carried it. No new colour is introduced and no third state invented.

⚠ The summary line gets its own `issueSummary` style rather than a recoloured `groupLabel`, because
`groupLabel` is the neutral heading for **every** group in this panel — recolouring it would turn
all of them red.

## 6. One surface regression this change had to avoid

Splitting `live-source-unset` out of `look-source-undeclared` would have quietly removed the
newly drawn plate from the Looks panel, whose filter lists codes explicitly. The very plate a fresh
draw produces would have vanished from the panel the author works in — a surface regression hidden
inside a message fix. The new code is added to that filter in the same commit.

## 7. Discrimination

With the whole mechanism reverted — the `live-1` default restored, the unassigned split removed, the
remedy sentence removed, and the colour returned to `caution` — **9 of 68 tests turned RED**
(7 of 9 in the new file, 2 of 42 in `live-source-preflight.test.ts`).

The two that stayed green in the new file are both positive controls: _a declared plate produces no
issue_, and _the undeclared plate is not repaired_. `looks-issues.dom.test.ts` (5) and
`look-preflight.test.ts` (12) — the pre-existing rule tests — stayed **entirely green**, which is
the point: `B-186`'s note aside, this change was not allowed to move the rule.
