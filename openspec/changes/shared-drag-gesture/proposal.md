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

## 🔴 The reported cause was WRONG, and the Why above is re-anchored on the one that reproduces

The brief's account — a same-origin PVW `<iframe>` swallowing the `mouseup` — **does not reproduce.**
Measured with a positive control asserting the release point hit-tests to an `IFRAME`, and with a
rebuild between runs: the pre-fix divider ended that drag correctly. The lead: the rehearsal frame
carries no `sandbox` attribute, so it is same-origin, and Chromium's implicit mouse capture already
keeps `mouseup` with the originating document.

**What reproduces is an ending that is not a `mouseup` at all** — the window losing focus. The old
divider listened for `mouseup` and nothing else, so such a drag never ended, and `is-dragging` plus
the body's cursor and `user-select` persisted application-wide. That is the reported symptom's shape
("the drag releases but the line stays blue"), and the E2E pins it **red-then-green**.

⚠ The Designer's permanently-attached listeners are real, but reached the same way — via blur or
`pointercancel`, not via its canvas iframe. `tasks.md` §6a states both corrections so the disproven
story does not outlive its truth.

⚠ `tasks.md` §6b retracts an earlier claim in this change that the fix itself was defective. That was
a **stale build**: `test:e2e` serves `dist/` and the filtered script does not rebuild, so two runs
compared the same bundle. The general lesson is recorded there.

## Impact

| Area              | Effect                                                               |
| ----------------- | -------------------------------------------------------------------- |
| **`@cg/gesture`** | **NEW workspace package** — shared config the next session must pull |
| `CLAUDE.md`       | a row in "Where features go" for it                                  |
| `apps/runtime`    | `ShellDivider` migrated; the `::before` touch target; no body writes |
| `apps/designer`   | `Splitter` migrated; its permanent-listener leak removed             |

Capability: `runtime-ui` (MODIFIED).
