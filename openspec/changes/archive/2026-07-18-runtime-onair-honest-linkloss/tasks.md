# Tasks — honest ON AIR across link-loss (B-086)

## 1. Recon (done)

- [x] 1.1 ON AIR source = Reconciler ladder `freshTruth→ackedStatus→intentStatus`; sticky because
      the `playing` floor renders as red ON AIR and the event-driven Reconciler never re-publishes
      on OSC silence.
- [x] 1.2 Link-loss transition = session leaving `healthy` (AMCP close / OSC-silence→degraded); the
      same signal `#linkDown()` gates on.
- [x] 1.3 Reconnect occupancy: restore is automatic (resumed OSC); reset is silence-inferred via
      `session.osc.occupancy.occupied(OCCUPANCY_STALE_MS)` — no per-layer AMCP INFO exists.
- [x] 1.4 `#markDirty` coalesces (20 ms) and flushes `#published()` (current snapshot) → no flicker.

## 2. Schema — the status

- [ ] 2.1 `@cg/shared-schema` `runtime/item-state.ts`: add `'unverified'` to `StackItemStatusSchema`.

## 3. Display — theme

- [ ] 3.1 `apps/runtime/src/renderer/theme.ts`: `badgeTone('unverified') → 'idle'` (muted grey);
      `airStateVisual('unverified') → { color: colors.textMuted, icon: '◌', label: 'WAS ON AIR' }`.
- [ ] 3.2 Confirm `isOnAir()` unchanged (treats `unverified` as on-air-ish — harmless).

## 4. Reconciler — the truth

- [ ] 4.1 `private linkDown = false;`
- [ ] 4.2 `reconcileStatus`: after the ladder, return `unverified` when the link is down and the
      base status is `on-air`/`playing`.
- [ ] 4.3 `setLinkDown(down)`: flip + re-emit only items whose reconciled status changed.
- [ ] 4.4 `reconcileOnReconnect(occupiedKeys)`: reset `played` items whose slot is not occupied to
      idle; leave occupied to `freshTruth`.

## 5. Bridge — the wiring

- [ ] 5.1 `caspar-runtime.ts` `#wireAdapter`: per current-primary session `on('state-change')` →
      `to==='healthy'`: `setLinkDown(false)` + `reconcileOnReconnect(occupancy)`;
      `from==='healthy'`: `setLinkDown(true)`.

## 6. Tests (broadcast-safety — red-first)

- [ ] 6.1 Reconciler unit: link-loss makes an on-air/`playing` item `unverified` (not red, not
      idle); a non-on-air item (`loaded`/`idle`) is untouched; `unconfirmed` is untouched.
- [ ] 6.2 Reconciler unit: `reconcileOnReconnect` — occupied slot restores on-air (via fresh OSC),
      empty slot resets to idle; `setLinkDown(false)` alone restores when OSC is fresh.
- [ ] 6.3 Bridge integration (real `@cg/caspar-bridge` + mock CasparCG): take on air → drop link →
      published `unverified`; reconnect with layer occupied → `on-air`; reconnect with empty layer →
      `idle` (allow the ~150 ms drain). Port/socket cleanup in try/finally.
- [ ] 6.4 FROZEN: R-006 refusal tests stay green (take/update/out refused while link down).
- [ ] 6.5 Theme/badge: `unverified` → muted "WAS ON AIR", not red/amber.

## 7. Gate

- [ ] 7.1 `pnpm gate` green (typecheck/lint/test/build --force + format:check + openspec strict);
      caspar-bridge isolated AND under full parallel `pnpm test`.
- [ ] 7.2 `pnpm gate:e2e` (status-badge visual change) — Windows-only, Linux owed.
- [ ] 7.3 `pnpm openspec validate runtime-onair-honest-linkloss --strict`.
