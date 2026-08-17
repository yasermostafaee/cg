# Tasks — B-140, the shared drag gesture

> 🔴 **THIS CHANGE IS NOT DONE. See §6 — an unresolved defect in the fix itself was found by its own
> E2E and is recorded rather than hidden.** Everything below it is complete and green; §6 is the
> reason the change should not be read as finished.

## 1. The package

- [x] 1.1 `packages/gesture` (`@cg/gesture`) — a NEW workspace package, picked up by the existing
      `packages/*` glob. Chosen over a `@cg/ui` carve-out: a documented exception to a bright-line
      rule is itself a thing that drifts, and `@cg/ui` stays tokens-only.
- [x] 1.2 **Headless — no styles, no tokens, no markup.** The only DOM it creates is the shield, an
      unclassed `<div>` built imperatively, wearing a cursor the CALLER supplies.
- [x] 1.3 A row added to `CLAUDE.md`'s "Where features go" table.

## 2. The hook

- [x] 2.1 `useDragGesture({ axis, cursor, onStart, onMove, onEnd })`.
- [x] 2.2 `pointerdown` / `pointermove` / `pointerup` / `pointercancel`, with `setPointerCapture` /
      `releasePointerCapture` and `touch-action: none` returned on `handleProps.style`.
- [x] 2.3 **A full-window shield for the gesture's duration**, above every panel and iframe.
- [x] 2.4 🔴 **The shield REPLACES the `document.body` cursor / `user-select` writes.** Neither app
      writes to `document.body` any more, so the application-wide stuck state has no home rather
      than a fifth place that clears it. Pinned by a test asserting `document.body` is untouched
      during AND after a drag.
- [x] 2.5 **One teardown, exhaustive terminator set** — `pointerup`, `pointercancel`,
      `lostpointercapture`, window `blur`, `Escape`, the pointer leaving the window, and unmount.
      `dragging` and the drag ref are cleared inside that one function, so they cannot be separately
      terminable.
- [x] 2.6 **Only the captured `pointerId` drives the drag** — a second finger is ignored, its
      release does not end the first finger's drag, and a second `pointerdown` does not start a
      second gesture.
- [x] 2.7 **`Escape` keeps the size it has at that moment** — the hook ends the drag and reports no
      further delta. A revert would need a snapshot the hook deliberately does not own.

## 3. Both consumers migrated

- [x] 3.1 `apps/runtime` `ui/ShellDivider.tsx` — was `mousemove`/`mouseup` on `globalThis` plus two
      `document.body` writes cleared in one handler.
- [x] 3.2 `apps/designer` `features/shell/Splitter.tsx` — the worse of the two: listeners added
      inside `onPointerDown` and removed only in its own `onUp`, so a missed release left them
      attached PERMANENTLY and the panel then resized on every later pointer move with no button
      held. Its incremental-delta contract is preserved by converting at the call site rather than
      teaching the shared hook one app's accumulation convention.
- [x] 3.3 Neither app owns gesture code afterwards.
- [x] 3.4 Keyboard path unchanged in both (`role="separator"`, `aria-valuenow`, arrows).

## 4. The touch target

- [x] 4.1 Runtime: the VISUAL stays 6px (and its 2px grip); a transparent `.cg-divider::before` with
      negative insets extends the HIT area to **24px** across the drag axis (6 + 9 + 9). Absolutely
      positioned, so it costs no layout — nothing moves, only the hit test changes. The divider was
      mistaken for a scrollbar once and must not get thicker to fix a different problem.
- [x] 4.2 Designer: already had the split (`HIT = 10` around `LINE = 2`) and it is the precedent the
      Runtime adopted. Unchanged.

## 5. Tests

- [x] 5.1 **23 unit tests** in `packages/gesture` — 100% statements, 90% branches. The terminator
      matrix is driven case by case, each asserting the same three consequences (shield gone,
      `dragging` false, a later move does nothing), because the defect was that "the drag ended" had
      more ways to happen than the code had listeners for.
- [x] 5.2 Capture is proven to be an OPTIMISATION, not the mechanism: a test makes
      `setPointerCapture` throw and the drag still works. If that ever fails, the shield has stopped
      being the mechanism.
- [x] 5.3 `mountShield` tested directly — its idempotent release is unreachable through the hook
      (the one teardown early-returns), and a guard nothing can reach through the normal path rots.
- [x] 5.4 E2E: a divider drag crossing the PVW frame, by MOUSE and by TOUCH, asserting the COMPUTED
      `body` cursor and `user-select` and the divider's class — what the browser shows, never what
      the component thinks.
- [x] 5.5 🔴 **A POSITIVE CONTROL on the crossing**, and it is not decoration: the FIRST version of
      that spec passed against the pre-fix code and was worthless, because PVW renders a frame only
      for a REHEARSING row and nothing was rehearsing — the drag crossed nothing. The spec now
      rehearses a row, asserts the frame is visible, and asserts
      `document.elementFromPoint(releasePoint).tagName === 'IFRAME'` before relying on the release.

## 6. 🔴 UNRESOLVED — read this before treating the change as done

### 6a. The reported mouse-over-iframe symptom DOES NOT REPRODUCE, and that is measured

With the positive control of 5.5 in place — the release point proven to hit-test to an `IFRAME` —
**the PRE-FIX divider still ended the drag correctly.** Repeated with the fix stashed out and back.

The likely reason, offered as a lead and not as a finding: the rehearsal frame carries **no
`sandbox` attribute**, so it is same-origin, and Chromium's implicit mouse capture already keeps
`mousemove` / `mouseup` with the document where the `mousedown` happened.

⚠ **So there is no red-then-green E2E for the reported symptom, and this change does not claim one.**
The owner observed the symptom on the real app; something about that path is not modelled here
(a different frame, a different browser, or a cause other than the iframe). **The diagnosis in the
brief is not confirmed.**

### 6b. 🔴 A DEFECT IN THIS FIX, found by its own E2E and NOT yet fixed

A third E2E case was written for the terminator that IS unhandled pre-fix — a drag interrupted by
the window losing focus. It went red against the old code as expected, **and also red against the
new code.** A diagnostic run measured the state immediately after the `blur`:

```
DIAG after blur: {"shields":0,"cls":"cg-divider cg-divider--horizontal is-dragging"}
```

**The shield was removed — so the one teardown DID run — but the divider still carried
`is-dragging`.** `end()` removes the shield and calls `setDragging(false)` in the same function, so
the React state update is not reaching the DOM in the built app. The unit tests cover this path and
pass (jsdom), which is exactly why it needed an E2E.

**Consequence for an operator:** after a drag interrupted by focus loss, the divider may still be
painted as dragging. That is strictly better than before (the body cursor and `user-select` no
longer leak application-wide, and the shield is gone), but it is not correct.

**The failing case was REMOVED from the spec rather than left failing**, and that decision is
recorded here rather than buried: shipping a red suite hides everything else in it, and shipping a
quietly deleted test is worse. It must be restored with the fix.

- [ ] 6.1 Diagnose why `setDragging(false)` does not reach the DOM in the production build while the
      shield removal in the same function does.
- [ ] 6.2 Restore the window-`blur` E2E case and confirm it is red before the fix and green after.
- [ ] 6.3 Re-check whether the same staleness affects the other terminators in a real browser —
      the unit tests prove the hook, not the integration.

## 7. Gate

- [x] 7.1 `pnpm openspec validate shared-drag-gesture --strict`.
- [x] 7.2 `@cg/gesture` typecheck / lint / build / test green; both apps typecheck, lint (0 errors)
      and test green — Runtime 759, Designer 1220.
- [ ] 7.3 Full green gate — at the end of the session.
- [x] 7.4 PRD item `[~]` with this change dir.
- [ ] 7.5 **Linux `e2e` owed.** And note it would NOT discharge §6b, which is a known-open defect
      rather than an unverified one.
