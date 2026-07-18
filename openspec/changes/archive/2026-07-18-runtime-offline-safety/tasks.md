# Tasks — the Runtime never pretends to be on air (R-006)

## 1. Recon (done, verified in-tree)

- [x] 1.1 `createRuntimeBridge.ts:39-45` — bare `catch` → `createMockBridge()`. Silent.
- [x] 1.2 `MockRuntime.ts:96-106` — `take()` → `playing` → `#settle('on-air')`, `accepted: true`.
- [x] 1.3 `seed.ts:67-75` — both servers seeded `state: 'healthy', amcpAxisOk: true`.
- [x] 1.4 `caspar-runtime.ts:564` — `take()` checks only that a slot exists; the orphan
      sweep at `:680` DOES gate on `session.state !== 'healthy'`. No connectivity refusal
      exists anywhere in the repo.
- [x] 1.5 E2E gets the mock ONLY via the silent fallback (the fixture arms `CG_E2E` but
      `createRuntimeBridge` never reads it) ⇒ an explicit flag is needed for the harness too.

## 2. Commit 1 — kill the silent fallback

- [x] 2.1 `createRuntimeBridge`: the mock is selected ONLY on an explicit request
      (operator test mode, or `CG_E2E`). A failed probe returns the LIVE backend, which
      reconnects on its own and rejects commands.
- [x] 2.2 `DisconnectedBanner` — full-width `role="alert"`, states nothing reaches air +
      commands are refused; offers Retry and an explicit "Enter test mode".
- [x] 2.3 Mount it in `App`.
- [x] 2.4 Tests: probe failure yields the live backend, NOT the mock (no auto-mock).
- [x] 2.5 Update `bridge-indicator.spec` — "boot with no bridge" must now assert
      DISCONNECTED, not OFFLINE (mock). The old assertion pinned the BUG.

## 3. Commit 2 — refuse on-air verbs while disconnected

- [x] 3.1 `CasparRuntime`: `#requireLink()` — refuse `take`/`update`/`out` with
      `errorCode: 'disconnected'` BEFORE any intent is applied.
- [x] 3.2 Refuse, do NOT defer (no queue-and-send-later).
- [x] 3.3 `StackRow`/`StackPanel`: PLAY disabled while the link is not live, reason surfaced.
- [x] 3.4 Tests: PLAY while disconnected is refused with a reason, no intent recorded, the
      status is unchanged; the button is disabled.

## 4. Commit 3 — the mock stops lying; test mode is explicit

- [x] 4.1 `seed.ts` — no fake HEALTHY. The mock reports no connected server.
- [x] 4.2 Simulated items badge as SIM, never the broadcast-red ON AIR.
- [x] 4.3 `TestModeBanner` — persistent, full-width, unmistakable; explicit exit.
- [x] 4.4 Explicit entry: a deliberate operator action; never automatic. Entering/leaving
      re-boots into the chosen backend — no mid-session swap.
- [x] 4.5 `StatusBar` — in test mode the server pills read "NO SERVER — SIMULATED".
- [x] 4.6 R-006: ⟨low⟩ → ⟨high⟩, scope widened to the four parts. Same number — this IS R-006.
- [x] 4.7 Tests: test mode shows the loud indicator, does NOT badge ON AIR, does not seed HEALTHY.

## 5. Gate

- [x] 5.1 caspar-bridge green ISOLATED and under the full parallel `pnpm test`.
- [x] 5.2 Full uncached gate; `format:check`; `openspec validate --strict`.
