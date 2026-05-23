# M5 Smoke Test — Manual Operator Demo

The automated integration suite (`apps/runtime/tests/integration/runtime-flow.test.ts`) drives the full operator flow against an in-process `@cg/amcp-mock`. This guide is for the **manual smoke** that runs after every M5+ milestone — an engineer launches the real Electron Runtime, watches the UI flip through air-states in response to a hand-driven scenario.

## Prerequisites

- A clean workstation checkout with `pnpm install` completed.
- No CasparCG running (the mock binds to the same default ports).

## 1. Start the AMCP mock

```powershell
pnpm --filter @cg/amcp-mock start
```

This boots an `amcp-mock` on TCP 5250 + UDP 6250 with a single 1080i50 channel. Leave the terminal open.

## 2. Launch the Runtime

In a second terminal:

```powershell
$env:CG_PRIMARY_HOST = "127.0.0.1"
$env:CG_PRIMARY_AMCP_PORT = "5250"
$env:CG_PRIMARY_OSC_PORT = "6250"
$env:CG_BACKUP_HOST = "127.0.0.1"
$env:CG_BACKUP_AMCP_PORT = "5251"   # mock for B not running; backup will stay offline
pnpm --filter @cg/runtime dev
```

The Runtime window opens. Watch the **status bar** at the bottom flip through `CONNECTING → HANDSHAKING → RESYNCING → HEALTHY` on PRIMARY. The BACKUP indicator stays `OFFLINE` since we didn't start a second mock — that's expected for this smoke.

## 3. Pre-populate the template registry

The library browser ships with M5.4. Until then, register a template programmatically. Open DevTools (`Ctrl+Shift+I`) and run in the Console:

```ts
// Not yet IPC'd — fall back to direct Reconciler/template wiring once the
// templates.* channel set lands. For M5.3 this manual smoke is verified
// via the automated test instead.
```

> **Note:** The manual library-driven smoke runs in M5.4 once `templates.*` channels land. For M5.3, the integration test in `apps/runtime/tests/integration/runtime-flow.test.ts` carries the burden — `pnpm --filter @cg/runtime test` exercises the full flow against the mock without needing a UI.

## 4. What "PASS" looks like

The integration suite asserts:

| Step   | Visible state                                                             |
| ------ | ------------------------------------------------------------------------- |
| LOAD   | Stack row appears in `READY` (sky blue, ▸)                                |
| TAKE   | Row flips to `TAKING` (amber, ⟳), then `ON AIR` (rose, ●) after OSC truth |
| OUT    | Row flips to `EXIT` (amber, ◐)                                            |
| REMOVE | Row disappears from the stack                                             |

Plus the **status bar's PRIMARY pill** stays `HEALTHY` throughout, the **BACKUP pill** stays whatever was true at boot, and the **lock chip** never appears (until M5.4).

## 5. What still needs human eyes (deferred to M5.4 / M5.5)

- The library browser (templates.\* IPC) — drag-drop a `.vcg` and see it appear.
- Lock-screen overlay rendering — engaging the lock should put up a full-screen PIN pad.
- Soak run — 30 minutes of scripted activity with the memory budget enforced.
