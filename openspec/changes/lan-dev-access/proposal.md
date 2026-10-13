# Reach the dev servers from a second machine, and stop the client assuming localhost (P-041)

## Why

The Designer and Runtime dev servers bound `127.0.0.1` unless `HOST` was set, and the Runtime
probed its bridge at the constant `ws://127.0.0.1:5280`. So nothing could be tested from a second
machine: the page did not load, and had it loaded it would have probed the SECOND machine's own
loopback and sat in DISCONNECTED with nothing wrong anywhere it could see.

This is the same gap that produced the `C-024` hack — `guessLanHost()` could not be told what to
advertise, so the owner pinned a plant IP in an uncommitted edit — one layer up: the client could
not be told, or ask, where its server is. And the defect is invisible from the dev machine, where
`localhost` and the LAN address are one box, so every local check passed. The `HOST` env var that
already existed was a flag someone has to remember, which is the failure mode this repo has paid
for more than once.

## What Changes

- **Both dev servers listen on every interface by default — in development only.** `server.host`
  in each `vite.config.ts` defaults to `true`; `HOST=127.0.0.1` restricts it back to loopback.
  `preview.host` and the built app are unchanged (loopback). The dev-only boundary is Vite's own
  contract — `server.*` is read by the `vite` dev server alone; `vite build` binds nothing;
  `vite preview` reads `preview.*` — pinned by `tests/vite-config.test.ts` in each app. HMR's host
  is left unset so Vite's client follows `location.hostname`; verified over the LAN address, not
  assumed.
- **The Runtime derives its bridge URL from the page's own origin**, in ONE module
  (`apps/runtime/src/platform/bridgeUrl.ts`): the harness override when armed, else
  `ws://<location.hostname>:5280` (`wss:` on an `https:` page), else loopback when there is no
  page origin to follow (Node tests, `file:`). Only the HOST follows the page; the PORT stays the
  bridge's documented default.
- **The `C-024` hack was identified before it was touched**: one artifact, the pin already
  commented out by the owner, not a live return and not a second hack. It was deleted together
  with its `.claude/never-stage` entry and the flag-only sentence in
  `templateServeUnreachableWarning`, in one commit (`f41da425`) per C-024's "never before" rule.
- **A lint guard, `cg/no-hardcoded-origin`**, enabled by the renderer tier: a scheme beside a
  loopback / IPv4-literal host, a host:port pair, a scheme beside one of this repo's own default
  ports, or an import of the bridge's bind-default constants. The owner module is exempt by path,
  inside the rule (the tier that enables the rule composes after `base`, so a base-level `off`
  is re-enabled — measured on the first smoke run). Its limits are written in its header.
- **Filed, not fixed:** `tools/caspar-amcp-probe/bin/beacon-probe-lib.mjs:49` still carries
  `DEFAULT_LAN_HOST = '192.168.21.93'` as a throwaway harness default — outside the prompt's
  boundary; recorded under P-041.

## Capabilities

- **NEW `platform-dev-servers`** — where the dev servers listen, how a browser client finds its
  server, and the guard that keeps a literal origin out of client code.
- **MODIFIED `runtime-caspar-bridge`** — "Bridge selection at boot": the probe URL follows the
  page's origin.

## Impact

- `apps/designer/vite.config.ts`, `apps/runtime/vite.config.ts`, `apps/*/tests/vite-config.test.ts`
- `apps/runtime/src/platform/bridgeUrl.ts` (new), `createRuntimeBridge.ts`,
  `tests/bridgeUrl.test.ts`, `tests/e2e/lan-origin.spec.ts`
- `packages/shared-ipc/src/ws-frame.ts` (doc comments only — the constants are unchanged)
- `packages/eslint-config`: `rules/no-hardcoded-origin.ts`, `rules/cg-plugin.ts` (the one `cg`
  plugin object), `configs/base.ts`, `configs/renderer.ts`, `index.ts`, `scripts/smoke.mjs`
- `README.md`, `CLAUDE.md` (dev URLs), `docs/prd/platform.md` (P-041), the registry
- **Owner actions, not code:** start the bridge with `--host 0.0.0.0` for a console on a second
  machine (its loopback default is a spec requirement, deliberately untouched); Windows Firewall
  (report-only, see P-041); the acceptance itself, from a second device.
- **Not changed, named so it is not assumed:** the bridge's wire path and refusal path; the
  bridge's bind default; `vite preview`; any packaged build.
