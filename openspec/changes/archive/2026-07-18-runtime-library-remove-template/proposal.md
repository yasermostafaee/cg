# Remove a template from the runtime Library (R-005)

## Why

The Library only ever grows. A mis-imported or stale `.vcg` cannot be removed — there is
no `templates.remove` channel, no `TemplateRegistry.remove`, and no per-row action beyond
Load. Observed in the 2026-07-07 live session.

Two things the recon surfaced that a naive "just delete it" would get wrong:

**1. Deleting a referenced template silently poisons the stack item.** Removal does NOT
take a live graphic off air — CasparCG already fetched the self-contained HTML into CEF,
so the page keeps rendering, and `stack.update` (a data-only `CG UPDATE`) keeps working.
The break is deferred and invisible: the next `out()` → `take()` cycle hits the
`unknown-template` guard in `CasparRuntime.take` and the item can **never come back**, and
`setPosition`'s invisible re-ADD silently stops re-ADDing. Nothing crashes; the operator
just gets a permanently unloadable row. That is exactly the "never silently broken stack
rows" the PRD item forbids.

**2. A removed template resurrects on the next bridge blip.** `WebSocketRuntime` keeps a
page-lifetime `#retained` map of every successful `templates.import` payload and
re-delivers the whole set FIRST on every reconnect (reconnect-reconciliation heals the
bridge's in-memory registry after a bridge restart). Remove from the registry alone and
the very next reconnect re-imports it.

## What Changes

**The policy is refuse-while-referenced.** A template is removable only when NO stack item
references it. This mirrors R-010's on-air block (count the offenders, refuse with a
reason that names the count and points at the unblock path) rather than inventing a new
interaction model — and it is strictly safer than warn-and-allow, because the damage it
prevents is invisible at the moment of the click.

Note the predicate is **any reference**, not just on-air ones: an `idle`/`loaded` row is
just as poisoned by a missing template (its next `load()` refuses with `unknown-template`)
as an on-air one. Remove the item first — `stack.remove` / Remove-All is the unblock path,
exactly as it is for R-010.

1. **`templates.remove` channel** (`@cg/shared-ipc`) — `{ templateId }` →
   `{ ok, reason?: 'in-use' | 'unknown-template', message? }`. The `{ ok, reason, message }`
   shape is R-010's / R-011's, so the UI's refusal handling is the one it already knows.
2. **`TemplateRegistry.remove(id)`** — drops `{ info, html }`. Un-serving is **free**: the
   HTTP server holds no map of its own, it reads through the injected `getHtml` on every
   request (its docstring already anticipates exactly this), so `GET /template/<id>`
   404s the moment the registry entry is gone. `urlFor` is a pure string builder.
3. **`CasparRuntime.templateRemove`** — the authority. Counts referencing stack items from
   `#reconciler.snapshot()`; refuses with `in-use` (naming the count) when any exist;
   refuses with `unknown-template` for an unregistered id; otherwise removes.
4. **`WebSocketRuntime.templates.remove` prunes `#retained`** — only after the bridge
   confirms `ok`, mirroring how `import` only retains after a confirmed register. A refused
   removal must leave the retained payload intact, or a reconnect would drop a template the
   bridge still considers registered.
5. **`MockRuntime` parity** — same predicate against the mock's own stack, so offline
   behaves like the bridge (the B-074 parity guard requires it).
6. **UI** — a confirm-gated per-row Remove action (the `window.confirm` gate is the
   StackPanel Remove-All precedent); a refusal surfaces the bridge's message verbatim (the
   bridge stays authoritative — the UI does not pre-judge).

## Deferred — the context-menu affordance (needs an owner decision)

R-005 asks for a per-row delete button **and** a context-menu entry. This change ships the
**button only**. The context menu is deferred, deliberately, because it cannot be built
without making a design-system decision that is the owner's to make:

- The Runtime app has **no context-menu primitive and no `Icon` component** (the Designer's
  `AnchorContextMenu` is app-local; `@cg/ui` is tokens-only by rule).
- The design system requires every interactive control to come from the shared primitives
  in `renderer/ui/` and forbids ad-hoc control styling. A context menu would therefore mean
  authoring a NEW Runtime primitive — its dismiss semantics, focus/keyboard behavior, RTL
  placement, and styling — which is a design decision, not a mechanical port.

The button delivers the full capability (removal, refusal, retention prune); the context
menu is a second route to the same action. Left as an open sub-item on R-005 rather than
guessed at.

## Non-goals / explicitly unchanged

- **No AMCP change.** Removal is registry bookkeeping — it sends no command. ADR-0006's
  verb sequence, the quoter, and the frozen escape rule are untouched. No new verb.
- **No serve-contract change.** `TemplateHttpServer` is not edited at all; un-serving falls
  out of the existing read-through.
- **Does not take anything off air, and does not pretend to.** Removal is refused precisely
  so that "remove" never means "silently orphan a live graphic".
- **No persistence change.** The registry stays in-memory (the browser's re-delivery is
  what heals a bridge restart) — which is exactly why `#retained` must be pruned too.
- R-003, B-067, B-070, B-072, R-009, R-010's own on-air block, R-011 — all untouched.

## Capabilities

- `runtime-template-library` — ADDED: remove a template, refused while referenced.

## Impact

- `@cg/shared-ipc` — `TemplatesRemoveChannel` (additive).
- `tools/caspar-bridge` — `TemplateRegistry.remove`, `CasparRuntime.templateRemove`, one
  route. `TemplateHttpServer` — **no change**.
- `apps/runtime` — `runtime-bridge.ts` contract, `WebSocketRuntime` (+ `#retained` prune),
  `MockRuntime`, `createRuntimeBridge`, `LibraryPanel`.
- R-005 → `[x]` on archive.
