# Design — browser-local template library (B-085)

## The two connections (why this is safe)

| Connection                   | Tracked by                                         | "down" means                              | Guard                      |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------- | -------------------------- |
| SPA ↔ bridge (WebSocket)     | `WebSocketRuntime.#status` (`live`/`disconnected`) | the **bridge process** is unreachable     | `#invoke` rejects channels |
| bridge ↔ CasparCG (AMCP/OSC) | `CasparRuntime.#linkDown()` (sessions A/B)         | **CasparCG** unreachable, bridge still up | refuses take/update/out    |

The library bug lives entirely in the first row; the frozen on-air safety lives entirely in
the second. The bridge's `templateImport`/`templateList`/`templateRemove` have **no
`#linkDown()` and issue no AMCP** — proof they are process-local, not CasparCG commands.

## Decision 1 — where local library state lives

`@cg/storage` `Workspace` (the same abstraction the Designer uses for projects/assets):

- **Browser (live backend):** OPFS (`openOpfsWorkspace('runtime')`) — persistent, per-origin,
  **no permission prompt**, survives reload. Falls back to `MemoryWorkspace` if OPFS is
  unavailable (insecure context / private mode) — this-session-only, never blanks the app.
- **Node tests / E2E:** `MemoryWorkspace` (OPFS unsupported in Node; E2E wants fresh isolation).

The library does NOT use File System Access / a directory picker — unlike Designer projects,
the runtime library is not a user-chosen folder. `KeyValueStore`/localStorage is unsuitable
(the produced HTML is multi-MB base64); OPFS holds real files.

**Persistence layout** (path-addressed, per template, id percent-encoded because `IdSchema`
is `z.string().min(1)` and permits any non-empty string):

- `library/<enc(id)>.json` → `{ template: TemplateInfo }` (small, pretty JSON)
- `library/<enc(id)>.html` → the produced self-contained HTML (raw text, not JSON-escaped)

`hydrate()` lists `library/`, reads each pair into an in-memory `Map<id, { template, html }>`.
Reads (`list`/`get`) are served from the in-memory map (populated before first paint, since
`createRuntimeBridge` awaits `hydrate()`); writes persist then update the map.

## Decision 2 — `LibraryStore` is pure local persistence; the backend owns delivery

`LibraryStore` knows nothing about the bridge or connection state — it is persistence + index
only:

```
class LibraryStore {
  hydrate(): Promise<void>
  list(): TemplateInfo[]
  get(id): TemplateInfo | null
  entries(): { template, html }[]              // the reconcile/delivery set
  import(template, html): Promise<{ registered, templateId }>   // persist + index
  delete(id): Promise<void>                     // unconditional local delete (bridge already authorized)
  remove(id, referencedCount): Promise<{ ok, reason?, message? }>  // guarded: refuse-while-referenced
}
```

The `WebSocketRuntime` owns the delivery + reconcile (it knows `#status`). This keeps the store
unit-testable off any socket and keeps connection logic in one place.

## Decision 3 — the local library REPLACES `#retained`

`WebSocketRuntime.#retained` (the page-lifetime `Map` of import payloads re-delivered on
reconnect) becomes the persistent `LibraryStore`. The existing `#resync` re-delivery is now
sourced from `store.entries()` instead of `#retained.values()` — same ordering (deliveries
before the stack/health/lock pulls), same "exactly once", now persistent and offline-capable.

- `templates.import(req)` → `await store.import(req.template, req.html)` (local truth); then, if
  `#status === 'live'`, `await #invoke(TemplatesImportChannel, req)` to deliver (a
  non-disconnect delivery failure is swallowed — the template is retained and reconcile heals it
  on the next connect). Returns `{ registered: true, templateId }`.
- `templates.list/get` → `store.list()/get(id)` wrapped in `Promise.resolve` — never
  round-trips, never rejects.
- `templates.remove(req)`:
  - live → `#invoke(TemplatesRemoveChannel, req)` (bridge authoritative); on `ok`,
    `store.delete(id)`; return the bridge's result (preserves the pinned reconnect-redelivery
    "confirmed prunes / refused keeps" semantics).
  - disconnected → `store.remove(id, #referencedCount(id))` where `#referencedCount` counts the
    last-known stack (`#lastStack`).

## Decision 4 — reconcile is upsert-only (local-wins), no diff round-trip

On reconnect, deliver every `store.entries()` template to the bridge (upsert) — exactly today's
`#retained` re-delivery, now from the store. This makes the bridge reflect the local library
(local-wins for any template the bridge has a stale copy of).

**A template removed locally while disconnected is simply absent from `entries()`, so it is not
re-delivered.** The bridge (if it did not restart) keeps a stale copy — this is **harmless**: a
template is only removable when unreferenced, and while disconnected no new loads can add a
reference (Load needs the bridge), so nothing will ever ask the bridge to serve that orphan, and
it is gone on the next bridge restart. This avoids an extra `templates.list` round-trip + diff
on every reconnect and keeps the existing `reconnect-redelivery.test.ts` semantics intact.

## Decision 5 — `#lastStack` for the offline refuse-while-referenced check

`WebSocketRuntime` caches the latest stack snapshot (`#lastStack`), updated on every
`stack.state-changed` publish, on the `#resync` snapshot pull, and on `stack.snapshot()`
resolution. The offline `templates.remove` counts references against it. This is **exact**, not
best-effort: the bridge is the sole mutator of the stack and cannot change it while unreachable,
so the last value the SPA saw IS the current stack. On a never-connected boot, `#lastStack` is
empty — correct, since nothing could have been loaded without the bridge.

## Decision 6 — the transport guard is narrowed STRUCTURALLY, not by a string predicate

The recon asked whether to add an "is this an on-air command?" predicate to `#invoke`. The
cleaner seam: once `templates.*` are served from the local store, **they no longer call
`#invoke` for the operator-facing path at all** (only the internal reconcile delivery does, and
only when already `live`). So the guard is narrowed off the registry channels _by construction_
— no channel-name allowlist, no `reachesCasparCG` flag on the channel objects. The channels
still going through `#invoke` (stack._, connections._, lock.\*, …) are exactly the
bridge-process-dependent ones, and rejecting them while disconnected stays correct (reads are
swallowed by `useBridgeSnapshot`; on-air commands are legitimately refused).

## Decision 7 — the "Not sent to CasparCG" copy

After the change, `BridgeDisconnectedError` is only ever surfaced to the operator for **on-air
command** attempts (Take/Update/Out/Apply-position and the Library's Load, which genuinely
target the bridge). For those, "command rejected. Not sent to CasparCG." is **accurate**. The
non-on-air reads that still reject (`stack.snapshot`, `connections.health`, …) are swallowed by
`useBridgeSnapshot` and never shown. So no copy change is needed; the message is no longer
surfaced for any registry operation. (Reported rather than silently assumed.)

## Decision 8 — scope guards

- **Mock unchanged.** `MockRuntime` already works offline (in-memory) and is a deliberate
  ephemeral simulation seeded from the starter pack; wiring it to the store would complicate E2E
  (fresh MemoryWorkspace + seed) for no bug fix. The live path is the fix. (Documented divergence:
  live persists; mock re-seeds each load — intended.)
- **Stack stays bridge-owned.** Load and stack-item removal are playout state in the Reconciler;
  making them offline-local is out of scope. Stack-row **Remove** is therefore gated consistently
  with PLAY/UPDATE/CLEAR (disabled while disconnected) — the honest fix for the recon-flagged
  inconsistency, since removal needs the bridge.
- **`defaultPosition` persistence** (R-011 residual: after reload the picker seeds centered) is a
  cosmetic follow-up left as-is; the applied on-air position is always correct regardless.

## Decision 9 — Load-refusal placement: existing toast, not inline (post-visual-confirmation)

The owner confirmed the core behavior, then asked for one placement fix: the Load refusal
(`AsyncButton` inline error) bloated the narrow library row when its message wrapped.

- **Reused the existing toast** — `commandFeedback.reportCommandError` → `CommandErrorToast`
  (`position: fixed`, bottom-center, auto-dismiss 4s, already mounted in `App.tsx`). No new
  notification system built. It is the same channel `applyDraft` / resync errors already use.
- **`AsyncButton` gained an optional `onError(message)` sink** (in `AsyncButtonController`): when
  set, a failure is forwarded there and the button returns to **idle** instead of pinning the
  message inline (`errorMessage: null`). Absent → unchanged inline behavior for every other
  button. Chosen over coupling `AsyncButton` (a `ui/` primitive) directly to the `features/status`
  toast — the caller supplies the sink, keeping the layering clean.
- Only the **Library Load** button opts in (`onError={reportCommandError}`). The stack-row
  buttons are unchanged (and already disabled while disconnected, so they raise no offline
  error). Placement-only: the refusal and its wording are untouched.

## Boot sequence (`createRuntimeBridge`)

Live path only (test mode still returns the mock, no workspace):

```
initRuntimeWorkspace()            // OPFS | MemoryWorkspace
→ new LibraryStore(ws); await store.hydrate()
→ new WebSocketRuntime(url, { onResyncError, library: store })
→ withTimeout(ws.whenReady(), 1500)   // unchanged probe; unreachable stays live+disconnected
```

`WebSocketRuntime` without an injected `library` defaults to `new LibraryStore(new
MemoryWorkspace())` (hydrated-empty) so the existing transport/reconnect tests construct it with
no store and still exercise delivery + reconcile.
