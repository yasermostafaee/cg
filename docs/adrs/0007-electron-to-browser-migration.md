# ADR 0007 — Migrate from Electron to a browser-based React platform

- **Status:** Accepted
- **Date:** 2026-05-30
- **Supersedes:** Partially supersedes ADR 0002 (two Electron apps) — the
  "two apps" decision stands; "Electron" does not.
- **Related:** ADR 0001 (monorepo), ADR 0003 (Persian rendering)

## Context

The platform was built as two Windows-only Electron apps (Designer +
Runtime). The renderer of each was already React; Electron supplied the
main process (Node services, custom `cgpreview://` protocol, SQLite, raw
TCP/UDP to CasparCG) and the preload `contextBridge` that exposed
`window.cg`.

The project is now continued by a single developer with no backend or
design team, and the goal is for users to work **in the browser**. That
makes the Electron shell — installers, code-signing, auto-update, a Node
main process — cost without payoff for most of the product. The creative
half (Designer) is a perfect fit for the browser; the control half
(Runtime) has one hard constraint (raw sockets) addressed below.

## Decision

Migrate both apps to **browser React SPAs** built with Vite. Keep the two
apps separate (ADR 0002's reasoning about diverging reliability budgets
still holds), the pnpm + Turborepo monorepo (ADR 0001), and the React
renderers essentially unchanged.

**The migration seam is the existing `window.cg` bridge contract.** The
renderer already talked to the backend only through the typed
`DesignerBridge` / `RuntimeBridge` interfaces (`src/shared/*-bridge.ts`).
We keep those contracts and swap the implementation:

| Concern               | Electron (before)                             | Browser (after)                                                               |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Bridge                | preload `contextBridge` → IPC → main services | `src/platform/` builds `window.cg` in-process                                 |
| Project/asset storage | `fs` in a working dir; SQLite recents         | `@cg/storage` Workspace (File System Access / OPFS / memory) + `localStorage` |
| `.vcg` export         | `fs.writeFile`                                | `@cg/vcg-format` (isomorphic) → `Blob` download                               |
| Live preview          | `cgpreview://` Electron protocol              | Blob-URL document importing the bundled runtime, scene inlined                |
| Crypto (hash/sign)    | `node:crypto`                                 | `@noble/hashes` + `@noble/curves` (WebCrypto-class, sync)                     |
| CasparCG transport    | `net`/`dgram` sockets in main                 | **deferred** — see below                                                      |

No backend, no API contract: storage is file-based (real folders via the
File System Access API on Chromium, OPFS elsewhere), behind one `Workspace`
abstraction so the choice is reversible.

### CasparCG transport is deferred to a local bridge

Browsers cannot open raw TCP (AMCP) or UDP (OSC) sockets, so the Runtime's
control path cannot be pure-browser. The chosen path: a small local
**WebSocket↔TCP/UDP bridge** that runs on the operator's machine and relays
to CasparCG. The pure protocol logic in `@cg/caspar-client` (command
building, response parsing, reconciler, redundancy) stays browser-side
behind a transport interface; only the socket transport lives in the
bridge. Until that tool ships, the Runtime runs against an in-memory
**mock** (`apps/runtime/src/platform/MockRuntime.ts`) so the operator UI is
fully exercised.

### On the "sales platform" the migration drew from

A separate uploaded repo (a content-**sales** platform: CRM/BI/PRM/WMS)
was reviewed only as a source of reusable **web tooling** — Vite SPA setup,
design-tokens, an RTL/Vazirmatn theme, feature-folder + ESLint-boundary
conventions. All of its sales/CRM/factory domain code was discarded; none
of it entered this repo. This repo's own monorepo tooling was already
stronger and was kept.

## Consequences

- `apps/*/src/main` and `src/preload` are removed; their **pure** logic was
  ported into `src/platform/` (browser services). Electron, electron-vite,
  and electron-builder are gone from the apps.
- `@cg/vcg-format` is now isomorphic (Uint8Array + noble); it is no longer a
  "Main-only" package and can pack/unpack `.vcg` in the browser. Signatures
  and keys are hex (were PEM/base64).
- Two new packages: `@cg/storage` (the file-storage seam) and `@cg/ui`
  (shared tokens + global theme).
- The Runtime is **not** air-ready until the CasparCG bridge lands; its
  health pills and stack states are simulated. This is called out in the UI
  copy and the README.
- File System Access gives the best "save a project as a real file" UX but
  is Chromium-only; OPFS is the cross-browser fallback. Acceptable for an
  operator tool, and abstracted so it can change.
- Tests that exercised Electron main services were removed; renderer/logic
  tests were ported to the new platform layer.

## Alternatives considered

- **Keep Electron, add a web build.** Doubles the surface for a solo dev and
  keeps the install/sign/update burden. Rejected.
- **Pure-browser Runtime, no bridge.** Impossible for real playout — no raw
  sockets in the browser. A WebSocket-only CasparCG does not exist.
- **Full backend (API + DB).** Contradicts the "no backend, file-based"
  constraint and the solo-developer reality. Rejected; file storage + an
  optional local socket bridge is the minimum that works.
