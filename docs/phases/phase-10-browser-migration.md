# Phase 10 — Browser Migration (Electron → React SPA)

Continuation plan for moving the platform off Electron and into the browser.
See [ADR 0007](../adrs/0007-electron-to-browser-migration.md) for the decision
and rationale. This page tracks what's done and what's next.

## Architecture in one picture

```
Browser tab (per app)
├── src/renderer/        React UI (unchanged from the Electron renderer)
│      │  calls window.cg (DesignerBridge / RuntimeBridge — the contract)
│      ▼
├── src/platform/        in-process implementation of window.cg
│      ├── Designer: ProjectStore · AssetStore · Exporter · Preview
│      └── Runtime:  MockRuntime (stack/connections/lock/templates/audit/settings)
│      ▼
└── @cg/* packages       schema · vcg-format (isomorphic) · template-runtime ·
                         text-shaping · starter-templates · storage · ui ·
                         caspar-client (protocol logic, transport pending)
```

The `window.cg` bridge is the seam: the UI never imports a platform service
directly, so the browser implementation could later move behind a worker, a
local server, or stay in-process without touching the renderer.

## Done

- **Build:** both apps build as Vite SPAs; Electron removed from the apps.
- **`@cg/vcg-format` isomorphic:** `@noble/hashes` + `@noble/curves`,
  `Uint8Array` everywhere. Packs/unpacks/verifies/signs `.vcg` in the browser.
- **`@cg/storage`:** one `Workspace` interface over File System Access (real
  on-disk folder), OPFS (sandboxed real files), and in-memory backends, plus a
  KV for prefs and IndexedDB directory-handle reuse.
- **`@cg/ui`:** shared design tokens + global broadcast theme (dark, RTL,
  Vazirmatn stack).
- **Designer:** project library (starters + recents), live Blob-URL preview,
  preflight validation, and `.vcg` export-to-download — all working against
  file-based storage.
- **Runtime:** full operator shell (stack, inspector, status bar, failover
  banner, lock screen, audit panel) driven by an in-memory `MockRuntime`.
- **Green workspace:** `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
  pass across every package and both apps.

## Next (roughly in priority order)

1. **CasparCG bridge (unblocks real playout).** A tiny Node tool
   (`tools/caspar-bridge`) that exposes a WebSocket and relays AMCP over TCP +
   OSC over UDP to CasparCG. Add a `WebSocketTransport` implementing
   `@cg/caspar-client`'s transport interface; swap `MockRuntime` for the real
   reconciler/redundancy stack behind the same `RuntimeBridge`. The OSC return
   path is mirrored server→browser over the same socket.
2. **Designer asset pipeline UI.** Wire an "import image/logo" affordance
   (the `AssetStore` + bridge method already exist; the renderer has no button
   yet). Inline imported asset bytes as data URLs in the preview so image
   elements render.
3. **Preview fidelity.** Resolve `.vcg` fonts in the preview; confirm
   Persian/RTL shaping with bundled Vazirmatn rather than the CDN.
4. **Bundle fonts offline.** Replace the jsdelivr `@fontsource/vazirmatn`
   `<link>` with a bundled font so air-gapped/offline use works and CSP can
   tighten.
5. **"Open folder" UX.** Surface `connectDirectory()` (File System Access) in
   the Designer so operators can pick a real library folder; show which
   backend is active (folder / OPFS / memory).
6. **Replace `window.prompt` flows.** Save-as and export currently use
   `window.prompt`; replace with proper dialogs (and `showSaveFilePicker`
   where available).
7. **Settings + routing.** Add a settings view (telemetry toggle is wired in
   the Runtime bridge) and lightweight routing if the apps grow beyond one
   screen.
8. **Hosting/packaging.** Decide how operators get the apps — static hosting,
   or a small local server that also embeds the CasparCG bridge. (A single
   local binary serving both the SPA and the bridge is the smoothest no-IT
   option.)
9. **Test depth.** Add Exporter (pack→download) and Preview tests behind the
   DI seams; re-add integration coverage once the bridge exists.

## Constraints to keep in mind

- **No backend, no API contract.** Persistence stays file-based behind
  `@cg/storage`. Anything server-side must be optional and local.
- **Browsers can't open raw sockets.** Real CasparCG control always needs the
  local bridge; design features so the app degrades to "preview/offline" when
  the bridge is absent.
- **Persian/RTL is core.** Keep a shaping-capable font first in every stack
  and prefer bundled fonts for broadcast reliability.
