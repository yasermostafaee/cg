# Tasks — honest ON AIR across a bridge-process death (B-087)

## 1. Recon (done)

- [x] 1.1 On bridge death the SPA↔bridge WS closes → `WebSocketRuntime.#onDown` flips `#status` to
      `disconnected` and emits ONLY on `#statusSubs`; it never pushes a demoted/cleared stack. B-086's
      `unverified` is a bridge-side product delivered over `StackStateChanged`, so a dead bridge cannot
      send it.
- [x] 1.2 `useBridgeSnapshot.ts:53` early-returns on `link === 'disconnected'` without clearing/
      re-pulling → `useStack()` freezes on the last snapshot with `status: 'on-air'`.
- [x] 1.3 `StackRow.tsx:115` passes the raw frozen `item.status` to `StatusBadge`; `StackRow` already
      reads `useLink()` (`linkDown`, `:96`) and computes `onAir` (`:88`) but wires them only to the
      buttons, never the badge. The badge is the only air-claim surface with no `useLink()` override
      (pills/LinkIndicator/ConnectionBanner already have one).
- [x] 1.4 `unverified` theme mapping already exists (B-086): `theme.ts` `badgeTone → 'idle'`,
      `airStateVisual → { icon: '◌', label: 'WAS ON AIR' }`; `StatusBadge` tooltip is CasparCG-worded.

## 2. Display mask — StackRow

- [x] 2.1 In `StackRow.tsx`, derive an effective badge status: when `linkDown && onAir`, use
      `'unverified'`, else `item.status`. Pass that to `StatusBadge` at the existing render site
      (`status={…}`). Reuse the existing `onAir` local (mirrors B-086's on-air/`playing` predicate).
- [x] 2.2 Confirm the mask is display-only: `item.status`/`item.pending` and the button gating are
      unchanged; `simulated` (offline-mock) path is untouched.

## 3. Link-aware tooltip — StatusBadge

- [x] 3.1 `StatusBadge.tsx`: make the `unverified` tooltip link-aware. Add a boolean prop (e.g.
      `bridgeDown`) that `StackRow` sets from `linkDown`; when `status === 'unverified'`, pick the
      bridge-connection wording if `bridgeDown`, else the CasparCG-link wording (B-086). Visible label
      and icon unchanged.
- [x] 3.2 `StackRow` passes the new prop from its existing `linkDown`.

## 4. Tests

All in `onairBridgeLoss.dom.test.ts`, which mounts the real `StackRow` + `StatusBadge`.

- [x] 4.1 Bridge down (link disconnected) + an on-air row → badge shows the muted "WAS ON AIR"
      (`unverified`), NOT red ON AIR; a `playing` row is masked too.
- [x] 4.2 A non-on-air row (`loaded` / `idle`) under bridge down → badge unchanged.
- [x] 4.3 A live link renders the same on-air row as real broadcast-red ON AIR (the mask is absent —
      this is the reconnected state).
- [x] 4.4 Tooltip is link-aware: an on-air row masked while the bridge is down names the bridge
      connection; an `unverified` row on a live link (the B-086 CasparCG case) names the CasparCG link.
- [ ] 4.5 No bespoke Playwright "live on-air → drop bridge" spec is added: the mask is renderer-only
      and 4.1–4.4 mount the real components and assert the rendered DOM, which is the faithful proof.
      No existing E2E harness drives a genuine LIVE on-air item (the `app` fixture is offline-mock, so
      an on-air item reads "SIM ON AIR"; the only real-bridge spec, `bridge-indicator`, runs an
      unreachable CasparCG so nothing goes on air), building one needs a new real-bridge + amcp-mock +
      OSC harness, and its reconnect half is blocked by the separate stack-wipe-on-restart bug. The
      generic LIVE→DISCONNECTED transition is already E2E-proven by `bridge-indicator.spec.ts`, and
      `pnpm gate:e2e` runs the full suite to prove no regression of the badge/link surfaces.

## 5. Gate

- [ ] 5.1 Full green gate for `apps/runtime` (typecheck/lint/test/build `--force` + `format:check`).
- [ ] 5.2 `pnpm test:e2e` (badge visual change).
- [ ] 5.3 `pnpm openspec validate runtime-onair-honest-bridge-loss --strict`.
