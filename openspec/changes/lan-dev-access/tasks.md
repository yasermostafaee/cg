# Tasks — LAN dev access (P-041, prompt `LAN-DEV-ACCESS-01`)

## 1. Discovery — reported before anything changed

- [x] 1.1 Preflight: tip `4c5683f6` as expected, `pnpm install --frozen-lockfile` clean, the
      working tree held exactly ONE modified file (`template-http-server.ts`). Reported before it
      was touched.
- [x] 1.2 What listens: Designer 4000 from `apps/designer/vite.config.ts:52-53`, Runtime 5174 from
      `apps/runtime/vite.config.ts:42-43`, each `process.env.HOST ?? '127.0.0.1'`. `HOST` already
      covered BOTH dev servers; `--template-serve-host` covers only the bridge's template server
      and answers a different question (what CasparCG fetches from), so it could not be reused.
- [x] 1.3 The origin sweep, every hit, via `git grep` (the first `packages/*/src` pathspec was
      BLIND — a wildcard pathspec is a full-path match in git — and was rerun as a prefix):
      ONE origin-producing site, `createRuntimeBridge.ts:78-81` → `DEFAULT_BRIDGE_WS_URL`
      (`ws-frame.ts:121-125`), a WebSocket. Not origins: SVG namespaces (`preview.ts:338`,
      `CanvasOverlay.tsx:83`, `Gizmo.tsx:73`, `scene-builder.ts:1325`), a URL preset
      (`pattern-presets.ts:66`), CasparCG server defaults (`seed.ts:66-67`,
      `ServerSettingsPanel.tsx:146,152`, `MockRuntime.ts:1159,1214`), operator text
      (`ServerSettingsPanel.tsx:454,634`), the loopback predicate (`loopback.ts:12`), comments
      (`uuid.ts` ×2, `connections.ts:174`); Designer `fetch()` calls are blob/relative asset URLs.
      Outside `src/`: both `playwright.config.ts` and six runtime test/e2e files pin `127.0.0.1`
      on purpose.
- [x] 1.4 **The 3–6 prediction FAILED**: one site, not three to six. Right about the WebSocket;
      wrong about a template/asset URL — the PVW is a `srcdoc` iframe, template HTML rides the
      socket, and the CasparCG-facing URL is built by the BRIDGE (`bridge.ts:678`). Reported as the
      gap, not explained away.

## 2. Bind to the LAN in dev (§2)

- [x] 2.1 Both `vite.config.ts`: `server.host` defaults to `true`; `HOST=127.0.0.1` restricts;
      `preview.host` unchanged; `server.hmr` left unset. Comments state the boundary and why.
- [x] 2.2 `apps/{designer,runtime}/tests/vite-config.test.ts` (4 + 4) pin the dev default, the
      `HOST` restriction, the preview default and the unset HMR host — the boundary in code.
- [x] 2.3 **HMR verified over the LAN, not assumed.** Live dev servers, Chromium at
      `http://192.168.21.93:5174/` and `:4000/`: both 200, both HMR sockets
      `ws://192.168.21.93:<port>/?token=…` received `{"type":"connected"}`; the served
      `/@vite/client` reads `` `${null || importMetaUrl.hostname}` `` (no pinned HMR host).

## 3. The client derives its origin (§3)

- [x] 3.1 `apps/runtime/src/platform/bridgeUrl.ts` — `bridgeUrlFor(location)` (pure) and
      `resolveBridgeUrl()` (override → page → loopback). `createRuntimeBridge.ts` calls it; its
      local copy and the `DEFAULT_BRIDGE_WS_URL` import are gone.
- [x] 3.2 `tests/bridgeUrl.test.ts` — 11 cases: LAN host, localhost, hostname, `[::1]`, `wss` on
      https, port stays the bridge's, no-location fallback, override precedence and its
      empty/non-string rejection.
- [x] 3.3 `tests/e2e/lan-origin.spec.ts` — the page is served from `cg-plant-dev.test` (routed to
      the preview server at the network layer, unresolvable, cannot be loopback); the bridge
      socket URL is read from Playwright's `websocket` event AND Chromium's console. **Red first:**
      against the verbatim old `createRuntimeBridge.ts` it failed with expected
      `ws://cg-plant-dev.test:5280/` and received `ws://127.0.0.1:5280/`; green on the fix
      (Windows, local — non-authoritative).
- [x] 3.4 Measured against the LIVE dev server too: the Runtime page at `192.168.21.93:5174`
      probed `ws://192.168.21.93:5280/` three times (refused — the bridge was not started with
      `--host 0.0.0.0`) and showed its NOT CONNECTED banner. The URL is the evidence.
- [x] 3.5 `ws-frame.ts` doc comments: the constants are the bridge's BIND defaults; `README.md`
      and `CLAUDE.md` dev URLs updated.

## 4. The `C-024` hack (§4) — separate commit `f41da425`

- [x] 4.1 Identified before touching: ONE line, `// return '192.168.21.93';`, the pin already
      commented out. The live pin entered at `9453b989`, left at `56c0799f`; HEAD carried none.
      `guessLanHost()` lives at `template-http-server.ts:40` (a hack-free sibling in the probe).
- [x] 4.2 The never-stage line and `templateServeUnreachableWarning` existed as described; all
      three went in ONE commit: line deleted, entry dropped (list now empty and says why), sentence
      completed to name the panel. `never-stage-decision.test.ts` asserts ABSENCE now.
- [x] 4.3 C-024, P-035 and `serve-host-from-app/tasks.md` record it.

## 5. Acceptance (§5) and firewall (§6)

- [x] 5.1 Verified here: binding, HMR over the LAN address, the derived bridge URL (dev and
      preview), the unit and E2E suites. **UNVERIFIED — needs the owner on a second machine:**
      reachability through the firewall and from a box where `localhost` is not this one. Steps
      are in P-041.
- [x] 5.2 Firewall REPORT (nothing changed): active profile DomainAuthenticated; inbound Allow
      rules already exist for `C:\program files\nodejs\node.exe` (TCP+UDP, Domain and Public) and
      that is the node in use (v26.4.0) — so no rule is expected to be needed. If the second
      machine cannot connect: allow inbound TCP 4000, 5174 and 5280 on the Domain profile (or
      re-check the program rule). The Private profile has no node rule.

## 6. The guard (§7)

- [x] 6.1 `packages/eslint-config/src/rules/no-hardcoded-origin.ts` + `rules/cg-plugin.ts` (the ONE
      `cg` plugin object); registered in `base`, enabled by `renderer()`; owner exempt by path
      inside the rule (a base-level `off` was re-enabled by the renderer block — measured on the
      first smoke run, fixed, recorded in the header).
- [x] 6.2 Smoke: 9 firing shapes, 6 allowed, owner/neighbour, node tier — `58 passed, 0 failed`.
- [x] 6.3 **First fire on the real tree: 0** across `@cg/runtime`, `@cg/designer`, `@cg/storage`,
      `@cg/ui`, `@cg/gesture` (after the §3 fix). **Verbatim reintroduction:** the pre-fix
      `createRuntimeBridge.ts` linted as a probe → `1 problem (1 error)`: the
      `DEFAULT_BRIDGE_WS_URL` import. So on the pre-fix tree the count is exactly 1.
- [x] 6.4 What it cannot see is in the rule header (bare hosts, numeric ports, cross-statement
      assembly, config values, `new URL()` parts, hostnames, everything outside `src/**`, Node tier).

## 7. Records and landing

- [x] 7.1 `P-041` filed in `docs/prd/platform.md`; registry entry with the heading derivation
      (highest `P-` heading `P-040`; pointer says `P-041`; they agree).
- [x] 7.2 Filed, not fixed: `beacon-probe-lib.mjs:49` `DEFAULT_LAN_HOST` (outside the boundary).
- [ ] 7.3 Linux `e2e` discharge — the run URL, `E2E (Playwright)` job conclusion and duration go
      here once CI completes for the pushed head.
