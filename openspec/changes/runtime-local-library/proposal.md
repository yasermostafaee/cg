# Give the Runtime template LIBRARY browser-local ownership (B-085)

## Why

The connection-state recon found a whole class of Runtime operations — the **template
library** (import / list / display / remove / field-schema) — that are wrongly refused when
the local **bridge process** is unreachable, even though **none of them command CasparCG**.

Two facts combine into the bug:

1. **The blanket transport guard.** `WebSocketRuntime.#invoke` rejects **every** channel with
   `BridgeDisconnectedError` ("Bridge disconnected — command rejected. Not sent to CasparCG.")
   when the SPA↔bridge WebSocket is not `live`. But `templates.import` / `templates.list` /
   `templates.remove` / `templates.get` are **registry** channels: the bridge answers them from
   its in-memory `TemplateRegistry` with **no `#linkDown()` check and no AMCP verb**
   (`caspar-runtime.ts` `templateImport`/`templateList`/`templateRemove`). The transport guard
   cannot tell a registry read from an on-air command and refuses them identically — the error
   even says "Not sent to CasparCG" about an import that was never going to CasparCG.

2. **The library has no browser-local ownership.** The registry's source of truth lives in the
   bridge process; the SPA only caches the last `templates.list()` in React state. So when the
   WS is down there is nothing to read, register into, or serve from.

The result (all one class — Tier B of the recon: "needs the bridge PROCESS but NOT CasparCG"):

- **Import .vcg offline** — the local verify + unpack + single-file HTML export all SUCCEED,
  then the one `templates.import` round-trip rejects, and **nothing is registered** (library
  stays empty).
- **Library empties on a disconnected mount and never repopulates** — `LibraryPanel.refresh`
  isn't link-aware, and there is no persistence across page reload.
- **Remove-from-library refused offline** (a pure registry op).
- **Stack rows lose their names offline** — `useTemplateIndex` early-returns
  `if (link === 'disconnected')`.
- **Inspector field-schema degraded offline** — `templates.get` rejects; its `.then` has no
  `.catch` (unhandled rejection), so the Inspector falls back to type-inferred flat fields.

This is a deliberate architectural move the product owner chose, matching CLAUDE.md's
"**No backend, file-based storage**" / `@cg/storage` doctrine (the Designer already owns its
projects/assets this way).

## What Changes

**The template library's source of truth moves from the bridge registry to browser-local
storage** (`@cg/storage`), for the LIVE `WebSocketRuntime` backend. After this:

- **Import** = verify + unpack + single-file HTML export + register **locally** (persisted). It
  succeeds with the bridge fully down; the local verify/register work was already Tier-A
  browser work — only the final round-trip was gated.
- **List / display / remove / field-schema (`get`)** read local state — they work offline and
  **survive page reload**.
- **The bridge becomes a delivery/serve target reconciled on (re)connect.** This **generalizes
  the mechanism `WebSocketRuntime.#retained` + `#resync` already implement** (retain each
  import payload; re-deliver on reconnect) — now sourced from the persistent local library, so
  the library IS the retention set. On (re)connect every local template is delivered to the
  bridge so CasparCG can load it when an on-air command eventually fires.
- **Conflict policy: local-wins.** The browser is the source of truth; a reconnect delivers the
  local library to the bridge (upsert), overwriting whatever the bridge held.
- **The transport guard is narrowed structurally.** `templates.*` no longer round-trip
  `#invoke` at all, so they cannot be refused when the WS is down. Tier-C on-air channels
  (`stack.take`/`update`/`out`/`setPosition`/`load`/`clearAll`/`removeAll`) STILL reject when
  the link is down — the guard is narrowed OFF the registry channels, not removed.

**Readers wired to local state / made resilient:**

- `useTemplateIndex` drops its `disconnected` early-return (the registry join is local now).
- `Inspector`'s `templates.get` gains a `.catch` (no unhandled rejection) and falls back to
  local/inferred fields.
- `LibraryPanel` needs no behavioral change — its `templates.list` / `import` / `remove` calls
  are served from local state, so the library naturally survives disconnect + reload.

**Also folded in (recon-flagged inconsistency):** the stack-row **Remove** button is gated
consistently with PLAY / UPDATE / CLEAR (disabled while the link is down). Rationale: the stack
is bridge-owned playout state (**out of scope** to move local), so removing a stack item
genuinely needs the bridge; a button that invites a click it will reject is the inconsistency
the recon flagged. This is the honest in-scope resolution.

**Also folded in (post-visual-confirmation UX):** a **Load** refusal (Load stays bridge-owned
and refused when the bridge is down) now surfaces as the existing command **toast**
(`commandFeedback` → `CommandErrorToast`), not as inline text inside the narrow library row
where the wrapped message bloated the row. `AsyncButton` gains an optional `onError` sink that
routes a failure to a handler (and returns the button to idle) instead of pinning it inline; the
Library's Load button passes `reportCommandError`. Placement-only — the refusal itself and its
wording are unchanged, and every other button keeps its inline error by default.

## Scope — LIBRARY only

- The **stack** stays bridge-owned (inherent playout state in the Reconciler). **Load**
  (add-to-stack) still needs the bridge — B-082 already covers the common CasparCG-down /
  bridge-up case; when the bridge PROCESS is down, Load still refuses (acceptable, out of scope).
- The **offline mock** (test mode) is unchanged: it already works offline (all in-memory) and is
  a deliberate ephemeral simulation seeded from the starter pack; the bug is live-path only.
- No new operations are invented: "reorder" (render-only reverse) and "rename" (name derives
  from file/manifest) are not real operations and are not added.

## Frozen — on-air safety is NOT weakened

Every Tier-C on-air refusal is untouched: the bridge's `#linkDown()` on take/update/out, the
StackRow on-air disables, Apply-position's on-air lock, Clear-All / Remove-All, health-honesty
(R-006), R-011 / held-pair, and B-070 / B-072 / B-056 / B-079. This change narrows the
**SPA↔bridge** transport guard off the registry channels and moves the library local; it MUST
NOT let any on-air command through while CasparCG is unreachable.

## Impact

- **Affected specs:** `runtime-template-library` (MODIFIED: import registers locally + offline;
  ADDED: browser-local ownership, persistence, reconcile-on-connect, offline reads).
- **Affected code:** `apps/runtime/src/platform/` (new `library/LibraryStore.ts` +
  `library/workspace.ts`; `WebSocketRuntime.ts` templates.\* → local store + reconcile;
  `createRuntimeBridge.ts` boot wiring), `apps/runtime/src/renderer/hooks/useTemplateIndex.ts`,
  `apps/runtime/src/renderer/features/inspector/Inspector.tsx`,
  `apps/runtime/src/renderer/features/stack/StackRow.tsx`.
- **Storage:** OPFS (persistent, no prompt) in the browser; in-memory in Node tests / E2E.
