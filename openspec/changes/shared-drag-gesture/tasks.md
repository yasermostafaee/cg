# Tasks — B-140, the shared drag gesture

> ⚠ **An earlier revision of this file reported an unresolved defect in the fix. That report was
> WRONG and is retracted — see §6b.** It was an instrument error, not a defect. The change is
> complete; §6a records a disproven diagnosis that must not be carried forward.

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
- [x] 5.6 🔴 **E2E VERIFIED RED-THEN-GREEN, with a rebuild between the runs.** The window-`blur`
      case fails against the pre-fix divider on
      `the drag must have ended … not.toHaveClass(/is-dragging/)` and passes after. Its positive
      control is the DRAG's own state, never the shield — a shield assertion would be asserting the
      fix's implementation, so it could only fail against code lacking it, which is not the same as
      failing on the bug. See §6b for why the rebuild is load-bearing.
- [x] 5.5 🔴 **A POSITIVE CONTROL on the crossing**, and it is not decoration: the FIRST version of
      that spec passed against the pre-fix code and was worthless, because PVW renders a frame only
      for a REHEARSING row and nothing was rehearsing — the drag crossed nothing. The spec now
      rehearses a row, asserts the frame is visible, and asserts
      `document.elementFromPoint(releasePoint).tagName === 'IFRAME'` before relying on the release.

## 6. Two findings about the DIAGNOSIS — read before repeating either

### 6a. 🔴 The iframe diagnosis is DISPROVEN. Do not carry it forward.

With the positive control of 5.5 in place — the release point proven to hit-test to an `IFRAME` —
**the PRE-FIX divider still ended the drag correctly.**

The likely reason, offered as a lead and not as a finding: the rehearsal frame carries **no
`sandbox` attribute**, so it is same-origin, and Chromium's implicit mouse capture already keeps
`mousemove` / `mouseup` with the document where the `mousedown` happened.

Re-measured with an explicit `build` before each run (see §6b for why that matters), and the result
is unchanged: **the crossing cases pass against the pre-fix divider.** The diagnosis is disproven,
not merely unconfirmed — do not carry it forward.

**What DOES reproduce is a terminator that is not a `mouseup` at all.** The old divider listened for
`mouseup` and nothing else, so a drag interrupted by the window losing focus never ended:
`is-dragging` stayed on and `document.body` kept the resize cursor and `user-select: none`
application-wide. That is the reported symptom's shape — "the drag releases but the line stays blue"
— reached by the door that is actually open, and it is what the E2E now pins red-then-green.

⚠ **The Designer half, re-examined on the same basis.** Its permanently-attached listeners are a
code-reading fact and are real: added inside `onPointerDown`, removed only in its own `onUp`. But the
reachable path to a missed `onUp` is **not** the canvas iframe, for the same same-origin reason — it
is window blur, `pointercancel`, or the OS taking the pointer. The consequence is unchanged and worse
than the Runtime's (the panel then follows the mouse with no button held); only the door differs from
the one the brief named.

### 6b. ⚠ RETRACTED — the "defect in the fix" was a STALE BUILD, and that is the lesson

An earlier revision of this file reported that the fix left the divider painted as dragging after a
blur — `{"shields":0,"cls":"… is-dragging"}` — and recorded it as an open defect.

**That was wrong.** `test:e2e` serves the built `dist/`, and `pnpm --filter @cg/runtime test:e2e`
does **not** rebuild. Every comparison run that way after the first build was measuring a **stale
bundle**, so the "pre-fix" and "post-fix" runs executed the same code. `CLAUDE.md` warns about
exactly this: _"the suite runs against the built `dist/`, so invoking Playwright directly against a
stale build gives false results."_

With an explicit `build` before each run the picture is consistent: the blur case is **RED pre-fix**
(`the drag must have ended … not.toHaveClass(/is-dragging/)`) and **GREEN after**. There is no
defect, and the removed test has been restored.

🔴 **The general lesson, which outlives this item:** a red/green comparison is evidence only if the
artifact under test was REBUILT between the two runs. Two runs of a stale bundle agree perfectly and
prove nothing — the same failure shape as a probe whose instrument was never live.

## 7. Gate

- [x] 7.1 `pnpm openspec validate shared-drag-gesture --strict`.
- [x] 7.2 `@cg/gesture` typecheck / lint / build / test green; both apps typecheck, lint (0 errors)
      and test green — Runtime 759, Designer 1220.
- [ ] 7.3 Full green gate — at the end of the session.
- [x] 7.4 PRD item `[~]` with this change dir.
- [x] 7.5 **Linux `e2e` DISCHARGED** — https://github.com/yasermostafaee/cg/actions/runs/32054398518, commit `56c0799f`, `conclusion: success`, and the **`E2E (Playwright)` job RAN** (`conclusion: success`, not skipped — P-029). Runtime **81 passed**, Designer **267 passed, 1 flaky**.
      `56c0799f` is the batch tip and a descendant of every commit in it, and the `e2e` job is
      whole-tree (`pnpm test:e2e`, no filter), so a green run there verifies the tree that carries
      this change.
      ⚠ The one flaky is `apps/designer/tests/e2e/video-import.spec.ts:291` — "a premultiplied-alpha
      source imports WITHOUT the black fringe (D-128 un-premultiply)" — which failed on its first
      attempt and passed on retry. It is unrelated to this change and is recorded as the SECOND
      occurrence under [[P-034]].
