# B-140 — one shared drag gesture, in its own package

## Why

Both apps owned their own divider gesture, and both were broken in the same shape: **"the drag
ended" had more ways to happen than the code had listeners for.**

- **Runtime** (`ui/ShellDivider.tsx`) registered `mousemove` / `mouseup` on `globalThis` and wrote
  `cursor` and `user-select` onto `document.body`, clearing both in exactly one handler. Any missed
  `up` left the whole application wearing a resize cursor with text selection dead.
- **Designer** (`features/shell/Splitter.tsx`) — the more severe — added its listeners INSIDE
  `onPointerDown` and removed them only in its own `onUp`, so a missed release left them attached
  **permanently** and the panel then resized on every later pointer move with no button held.
- Neither supported touch or pen at all; the Runtime's was `mousedown`-only.

## What changes

**A new `@cg/gesture` package** holding ONE headless drag hook, consumed by both dividers.

Chosen over a `@cg/ui` carve-out deliberately: a documented exception to a bright-line rule is itself
a thing that drifts, and this repo's history is exactly that. `@cg/ui` stays tokens-only; components
stay app-local; what is shared here is BEHAVIOUR, which is a third category rather than an exception
to either rule.

**Two halves, neither replacing the other.** Pointer Events fix _who can drag_; a full-window shield
fixes _crossing an iframe_, because `setPointerCapture` does not dependably cross a browsing-context
boundary.

🔴 **The shield REPLACES the `document.body` writes rather than joining them.** The outcome is one
less piece of global state, not a fifth place that clears it — which is what closes the
application-wide stuck state at its root.

## What does NOT change

- The keyboard path in both apps (`role="separator"`, `aria-valuenow`, arrow keys).
- The Designer's incremental-delta `onResize` contract — converted at its call site rather than
  teaching the shared hook one app's accumulation convention.
- The divider's VISUAL width. The touch hit area grows via a transparent pseudo-element; the visible
  6px is untouched, because the divider has been mistaken for a scrollbar once already.

## 🔴 Status: NOT DONE

Two things are recorded in `tasks.md` §6 rather than hidden:

1. **The reported mouse-over-iframe symptom does not reproduce**, measured with a positive control
   proving the release point hit-tests to an `IFRAME`. The pre-fix code still ended that drag. The
   brief's diagnosis is therefore **not confirmed**.
2. **A defect in this fix**, found by its own E2E: after a drag interrupted by window blur, the one
   teardown runs (the shield is removed) but the divider still carries `is-dragging`. The failing
   case was removed from the spec rather than left red, and §6b says so explicitly so it is restored
   with the fix rather than forgotten.

## Impact

| Area              | Effect                                                               |
| ----------------- | -------------------------------------------------------------------- |
| **`@cg/gesture`** | **NEW workspace package** — shared config the next session must pull |
| `CLAUDE.md`       | a row in "Where features go" for it                                  |
| `apps/runtime`    | `ShellDivider` migrated; the `::before` touch target; no body writes |
| `apps/designer`   | `Splitter` migrated; its permanent-listener leak removed             |

Capability: `runtime-ui` (MODIFIED).
