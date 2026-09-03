# Design — LAN dev access (P-041)

## 1. Discovery first, and what it found (the prediction failed)

The brief predicted 3–6 origin-producing sites in the client, at least one WebSocket and at
least one template/asset URL bypassing the helper. A `git grep` over both apps' `src/`, every
package and the html/tests/configs (rerun with a prefix pathspec after `packages/*/src` proved
BLIND — git treats a wildcard pathspec as a full-path match) found **one**:
`createRuntimeBridge.ts`'s `resolveBridgeUrl()` → `DEFAULT_BRIDGE_WS_URL`, a WebSocket. There is
no HTTP call to the bridge (everything rides the socket), the PVW is a same-origin `srcdoc`
iframe, template HTML arrives over the socket, and the CasparCG-facing template URL is built by
the BRIDGE (`bridge.ts:678`), never by the client. One mechanism, not three. Every other hit was a
CasparCG server default, an SVG namespace, operator text, a comment, or a deliberate test pin.

The prediction is recorded as failed rather than reconciled; the enumeration is in `tasks.md` 1.x.

## 2. Default LAN-visible, restrictable — and where the dev-only boundary lives

`HOST` already existed for both servers (defaulting to loopback) and was the right mechanism to
keep: the change flips its DEFAULT. A flag someone has to remember is the failure mode the
`C-024` hack was born from. `HOST=127.0.0.1` restricts.

The boundary is not a comment. `server.*` is consumed only by the `vite` dev server; `vite build`
produces static files and binds nothing; `vite preview` reads `preview.*`, which stays
`127.0.0.1`. `tests/vite-config.test.ts` in each app imports the config with `HOST` unset and
pins `server.host === true`, `preview.host === '127.0.0.1'`, and `server.hmr` unset. Playwright
serves the built app through `vite preview` at `127.0.0.1`, so the E2E suite is untouched.

`server.host: true` rather than `'0.0.0.0'` so Vite listens dual-stack and prints every
`Network:` URL — on this host, both `172.18.0.1` (a tunnel adapter) and `192.168.21.93`
(Ethernet), which is exactly the two-interface situation that made `guessLanHost()` guess wrong.

## 3. The client follows the page — host only

`bridgeUrlFor({ protocol, hostname })` is pure and takes a plain object so a test needs no DOM.
`resolveBridgeUrl()` keeps the harness override first (E2E pins a dead port; the Node test pins
an ephemeral real bridge), then the page, then loopback when there is no usable `location`.

- `location.hostname`, not `location.host`: the page's PORT (4000 / 5174 / 4174) says nothing
  about where the bridge listens; the bridge's port is the bridge's (`DEFAULT_BRIDGE_PORT`).
- `wss:` on an `https:` page: a secure page refuses plain `ws:`, and the failure would read as
  "bridge down". The bridge has no TLS today, so this is honesty, not a feature.
- Not `import.meta.env.VITE_BRIDGE_URL`: a build-time constant is a second machine's loopback
  again, only spelled in `.env`.
- `DEFAULT_BRIDGE_WS_URL` / `DEFAULT_BRIDGE_HOST` stay exported from `@cg/shared-ipc` — they are
  the bridge's BIND defaults, which `bridge.ts` reads — with doc comments saying so, and the lint
  rule refuses their import in client code.

## 4. The bridge's bind stays loopback — an owner step, not a bug

`runtime-caspar-bridge` requires the control WebSocket to bind `127.0.0.1` by default, enforced
at socket bind. So a console on a second machine also needs `caspar-bridge --host 0.0.0.0`
(documented in the README). Changing that default is outside this change on two counts (a bind
default, and a spec requirement); it is an owner action in the acceptance steps.

## 5. The `C-024` artifact — one, not two

`git diff` showed one added line, `// return '192.168.21.93';` — the pin already commented out.
`git log -S` showed the live pin entered at `9453b989` and left at `56c0799f`; HEAD carried none.
The commented line, the never-stage entry, and the flag-only warning sentence went in one commit
(`f41da425`). The never-stage test that asserted the entry was PRESENT now asserts it is ABSENT.
`serve-host-config.ts`'s split from `template-http-server.ts` stays: it was the right seam.

## 6. The guard, and the ordering it exposed

`cg/no-hardcoded-origin` folds a string-building expression (literal, template literal, `+`
chain; non-literal pieces become `«expr»`) and matches three shapes plus the bind-default
imports. It is REGISTERED by `base` (one `cg` plugin object, `rules/cg-plugin.ts` — flat config
refuses two objects under one name) and ENABLED by the renderer tier only: Node-tier code
legitimately logs `ws://127.0.0.1:5280` because that is where it binds.

The first smoke run fired inside the owner module: the owner exemption was a base-level `files`
block, and every app composes `renderer()` AFTER `base`, so the enabling block re-enabled it.
The exemption moved into the rule (a suffix match on `ORIGIN_OWNER_FILES`); a neighbouring copy
still fails, which the smoke check proves.

Measured: **0** sites on the current tree across the five renderer-tier workspaces; **1** site on
the verbatim pre-fix `createRuntimeBridge.ts` (the `DEFAULT_BRIDGE_WS_URL` import). What it
cannot see is in the rule's header — bare hosts, numeric ports, cross-statement assembly, config
values, `new URL()` parts, hostnames, and everything outside `src/**`.

## 7. Acceptance — what a same-machine test cannot show, and what was measured anyway

From the dev machine, opening the LAN address proves nothing about the client: `localhost` still
resolves there. Two instruments sidestep that:

- `tests/e2e/lan-origin.spec.ts` gives the page an origin that CANNOT be loopback —
  `cg-plant-dev.test`, unresolvable — by routing its requests to the preview server at the
  network layer, and reads the bridge socket URL from Playwright's `websocket` event AND from
  Chromium's console (a refused loopback socket emits no event, only a console line). Red on the
  old constant (`Received: "ws://127.0.0.1:5280/"`), green on the fix.
- A scratch Playwright run against the LIVE dev servers at `http://192.168.21.93:{5174,4000}`:
  both pages loaded (200), both HMR sockets connected at `ws://192.168.21.93:<port>/?token=…`
  with `{"type":"connected"}`, the served `/@vite/client` carries `__HMR_HOSTNAME__ = null` (so
  it follows `importMetaUrl.hostname`), and the Runtime page probed `ws://192.168.21.93:5280/`
  three times (refused — the bridge was not started with `--host 0.0.0.0`).

What neither shows: reachability from another physical machine (firewall, routing). That half
is the owner's, with the exact steps in P-041.

## 8. A consequence worth stating: plain HTTP on a LAN IP is an INSECURE context

Both instruments showed it. The Designer at `http://192.168.21.93:4000` rendered "Session-only
storage — this browser context has no persistent storage": OPFS (`navigator.storage.getDirectory`)
and the File System Access pickers exist only in secure contexts (`https:` or `localhost`). The
Runtime falls back to an in-memory library the same way (`workspace.ts` already handles it), and
`crypto.randomUUID` already has its fallback. So a second-machine session WORKS but does not
persist a library between reloads. Not fixed here (it is the browser's rule, and the fix is TLS
or a per-browser flag); recorded under P-041 so the owner is not surprised by it on the plant.
