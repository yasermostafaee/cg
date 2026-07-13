# Tasks — remove a template from the Library (R-005)

## 1. Recon (done)

- [x] 1.1 Confirm no `templates.remove` channel and no `TemplateRegistry.remove` exist.
- [x] 1.2 Confirm un-serving is FREE: `TemplateHttpServer` holds no map — it reads through
      an injected `getHtml` per request, so a registry delete 404s the URL with no server
      edit. (Its own docstring already anticipates a remove.)
- [x] 1.3 Confirm the poisoning path: `take()`'s B-039 re-ADD and `load()` both guard on
      `#templates.has(...)` → `unknown-template`; `setPosition`'s re-ADD skips SILENTLY. So
      deleting a referenced template leaves a permanently unloadable row.
- [x] 1.4 Confirm the resurrection path: `WebSocketRuntime.#retained` re-delivers every
      import payload on each reconnect ⇒ a registry-only delete comes back on the next blip.
- [x] 1.5 Confirm the refusal pattern to MIRROR (not modify): R-010's `#onAirCount` +
      `{ ok: false, reason, message }`.

## 2. Contract

- [x] 2.1 `@cg/shared-ipc` `channels/templates.ts`: `TemplatesRemoveChannel` —
      `{ templateId }` → `{ ok, reason?: 'in-use' | 'unknown-template', message? }`.
- [x] 2.2 Round-trip schema test for the new channel.

## 3. Bridge — the authority

- [x] 3.1 `TemplateRegistry.remove(id): boolean` — drops info + html.
- [x] 3.2 `CasparRuntime.templateRemove(id)` — refuse `unknown-template` when unregistered;
      refuse `in-use` (message names the count) when ANY `#reconciler.snapshot()` item
      references it; else remove.
- [x] 3.3 `bridge.ts`: route `TemplatesRemoveChannel` (the B-074 route-coverage guard
      requires it the moment the channel is exported).
- [x] 3.4 `TemplateHttpServer` — NO edit (verify by test, not by code).

## 4. Client

- [x] 4.1 `apps/runtime/src/shared/runtime-bridge.ts`: `templates.remove` on the contract.
- [x] 4.2 `WebSocketRuntime.templates.remove`: invoke, and prune `#retained` ONLY when the
      bridge confirms `ok` (a refusal must leave the retained payload intact).
- [x] 4.3 `MockRuntime.templateRemove`: same predicate against the mock's own stack.
- [x] 4.4 `createRuntimeBridge`: wire the offline facade.

## 5. UI

- [x] 5.1 `LibraryPanel`: confirm-gated per-row Remove control (the StackPanel Remove-All
      `window.confirm` precedent).
- [ ] 5.2 DEFERRED — the context-menu entry. The Runtime has no context-menu primitive and
      no `Icon` component, and the design system forbids ad-hoc control styling, so this
      needs an owner decision (see proposal "Deferred"). NOT guessed at.
- [x] 5.3 A refusal surfaces the bridge's message verbatim (bridge stays authoritative).
- [x] 5.4 Refresh the list after a confirmed removal.

## 6. Tests (red-first)

- [x] 6.1 Bridge: removing an unreferenced template un-registers it AND its retained HTML
      (`templateHtml` → null, so the served URL 404s).
- [x] 6.2 Bridge: removing a template referenced by a stack item is REFUSED (`in-use`),
      whatever the item's status — and the template stays loadable afterwards.
- [x] 6.3 Bridge: removing an unregistered id is refused with `unknown-template`.
- [x] 6.4 `WebSocketRuntime`: a confirmed removal prunes `#retained` — a simulated reconnect
      does NOT re-deliver it.
- [x] 6.5 `WebSocketRuntime`: a REFUSED removal keeps `#retained` — a simulated reconnect
      still re-delivers it.
- [x] 6.6 Mock/bridge parity guard (B-074) still green with `templates.remove` routed.
- [x] 6.7 `LibraryPanel` DOM: remove button + context menu call through; a refusal shows the
      bridge's message and the row stays.

## 7. Gate

- [x] 7.1 `caspar-bridge` green ISOLATED and under the full parallel `pnpm test`; every
      bound port/server released in `try/finally`.
- [x] 7.2 `typecheck` + `lint` + `test` + `build` green (uncached) for the touched
      workspaces; `pnpm format:check` clean.
- [x] 7.3 `pnpm openspec validate runtime-library-remove-template --strict`.
- [x] 7.4 Mark R-005 `[~]` with the change dir; flip to `[x]` on archive.

## 8. E2E (CLAUDE.md — user-facing behavior)

- [x] 8.1 `library-name-and-remove.spec.ts` maps the removal scenarios to Playwright against
      the MockRuntime: removing a template a SEEDED STACK ITEM references is refused with
      the bridge's message (row survives, still loadable); removing an unreferenced one
      drops the row. Runtime 25 / Designer 202 passed.
