# Tasks — Caspar bridge Phase 1: transport, selection, resilience (C-001)

Scope: transport + selection + resilience ONLY. No `@cg/caspar-client`, no real
sockets, no `amcp-mock` (those are Phase 2/3).

## 1. Wire frame envelope (`@cg/shared-ipc`)

- [x] `src/ws-frame.ts` — Zod schemas + types for the shared frame envelope:
      `request { type, id, channel, payload }` / `response { type, id, payload? ,
error? }` / `publish { type, channel, payload }`; a discriminated `WsFrame`
      union; default bridge host/port/URL constants (browser-safe port).
- [x] Export from `src/index.ts`.
- [x] Build `@cg/shared-ipc`.

## 2. Bridge workspace (`tools/caspar-bridge` → `@cg/caspar-bridge`)

- [x] Workspace scaffold mirroring `tools/amcp-mock` (package.json with `ws` dep,
      tsconfig, eslint node tier, vitest config, bin).
- [x] `src/runtime-backing.ts` — minimal in-memory runtime answering the full
      contract (load/take/update/out/remove/snapshot + emits StackStateChanged;
      health/lock/templates/audit/settings/update stubbed). Explicitly throwaway;
      does NOT import `@cg/caspar-client`.
- [x] `src/bridge.ts` — `createBridge({ host?, port? })`: a `ws` `WebSocketServer`
      that **binds `127.0.0.1` by default at the socket bind**, routes request
      frames to the backing (Zod-validated per channel), and forwards backing
      emitter events as `publish` frames. Returns a handle (`{ host, port, url,
close(), dropConnections() }`).
- [x] `bin/caspar-bridge.mjs` — CLI to start the bridge.
- [x] `src/index.ts` — export `createBridge` + types.

## 3. Browser `WebSocketRuntime` (`apps/runtime/src/platform/`)

- [x] `WebSocketRuntime.ts` — implements `RuntimeBridge` over a native browser
      `WebSocket` (NO Node imports; injectable WS factory for tests). Per-call:
      validate request with the channel, send `request` frame, await correlated
      `response`, validate response. Map `publish` frames to the `on*`
      subscriptions. Static `getAppInfo`.
- [x] Tri-state `link` status (`live` / `offline-mock` / `disconnected`) exposed
      on the bridge; mid-session WS drop → `disconnected` + reject all in-flight
      and subsequent take/update/out with a clear error (never optimistic on-air,
      never routed to the mock); on reconnect → re-pull `stack.snapshot` +
      `connections.health` + `lock.state` and push to subscribers to resync.

## 4. Async selection + indicator (`apps/runtime`)

- [x] `runtime-bridge.ts` — add `link: { status(); onStatusChanged() }` +
      `BridgeLinkStatus` to the `RuntimeBridge` contract.
- [x] `createRuntimeBridge.ts` — make **async**; probe the configured bridge WS
      (1500ms): reachable → `WebSocketRuntime` (live); refused/timeout →
      `MockRuntime` wrapper with a constant `offline-mock` link status. Add `link`
      to the mock path.
- [x] `main.tsx` — `window.cg = await createRuntimeBridge()` before render (brief
      "connecting…" placeholder is fine).
- [x] Tri-state connection indicator in `features/status/StatusBar.tsx` (inline
      styles + `theme.ts`, matching the app), with an accessible name for E2E.
      Surface a clear error when a command is rejected due to disconnect.

## 5. Tests

- [x] `@cg/caspar-bridge` integration: boot the bridge, connect a
      `WebSocketRuntime` (ws factory), round-trip load/take/update/out and assert
      they reflect via published stack state.
- [x] `WebSocketRuntime` unit: reachable→live; absent/refused→ (selection picks
      mock) ; mid-session drop→disconnected + take/update/out rejected; reconnect
      re-pulls snapshot (stack/health/lock).
- [x] `createRuntimeBridge` selection unit: probe success→WebSocketRuntime;
      probe timeout→MockRuntime (offline-mock).
- [x] Playwright E2E: boot (no bridge) → OFFLINE indicator; boot with a bridge →
      live indicator; drop the bridge → DISCONNECTED indicator. Run `pnpm test:e2e`.

## 6. Gate

- [x] Full green gate (uncached at least once via `turbo --force`) for
      `@cg/shared-ipc`, `@cg/caspar-bridge`, `@cg/runtime`: format:check +
      typecheck + lint + test + build; `pnpm test:e2e`.
- [x] `openspec validate caspar-bridge-transport --strict`.
- [x] Conventional commit + push; verify remote head. C-001 stays `[~]`. No PR
      (await review).
