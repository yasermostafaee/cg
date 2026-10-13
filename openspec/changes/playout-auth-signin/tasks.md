# Tasks — C-037 and R-066's sign-in half, `PLAYOUT-AUTH-01`

## 1. The wire and the shared contracts

- [x] 1.1 `packages/shared-ipc/src/ws-frame.ts` — `WsAuthFrameSchema` as the FOURTH member of the
      discriminated union, `{ type: 'auth', id, token }` with `token` a non-empty string so the
      envelope refuses a malformed frame before any verifier sees it. Exported from `index.ts`.
- [x] 1.2 `packages/shared-ipc/src/channels/auth.ts` — `AuthStateChannel` (`auth.state`, a read),
      `AuthSignOutChannel` (`auth.sign-out`), `PlayoutPrincipalSchema`, `AuthModeSchema`, and the
      ONE refusal `AUTH_REQUIRED_REFUSAL` beside `LOCK_ENGAGED_REFUSAL` under `R-017`. Plus the
      three token-rejection sentences the contract's §3.5 names as reason classes.
- [x] 1.3 `bridge.capabilities` gains `auth`, `signInUrl`, `refreshUrl`, `authContractVersion` —
      all OPTIONAL, read through the one helper `capabilitiesAuthMode`, so a bridge that predates
      auth still answers the skew handshake instead of failing its response schema.
- [x] 1.4 `@cg/shared-schema` — `AuditEntrySchema` gains the `sign-in` / `sign-out` actions and
      the optional `actorSub` and `actorNameTruncated` fields.

## 2. The bridge

- [x] 2.1 `jose` added to `tools/caspar-bridge`. 🔴 `pnpm-lock.yaml` moves — shared config.
- [x] 2.2 `src/playout-config.ts` — `playout.*` under `R-010`'s precedence (CLI > file >
      default), in its OWN `~/.cg-runtime/bridge-playout.json`, with a hard startup failure whose
      sentence names the missing key. See `design.md` §1 for why not `ConnectionConfig`.
- [x] 2.3 `src/playout-auth.ts` — `PlayoutAuth`: offline ES256 verification against the cached
      JWKS (60 s unknown-`kid` cooldown), `iss` byte-equal and never derived, `aud` checked where
      the claim is named, ±60 s tolerance, and the D9 revocation poller (≤ 1/60 s, background,
      read synchronously at the gate, last list kept on an outage).
- [x] 2.4 `src/auth-session.ts` — one principal holder per socket.
- [x] 2.5 `src/actor-context.ts` — the ALS seam widened to a context carrying the verified name,
      `sub` and the socket's session. `operatorActor()` still returns a string and every one of
      its seven readers is untouched, which was the promise the file made.
- [x] 2.6 `src/bridge.ts` — `refusedByAuth` / `openToUnauthenticated` / `authGateState` exported
      for the census; the gate in `handleMessage` beside the `B-229` lock gate; `handleAuthFrame`;
      the `auth.*` routes; the capability advertisement; the publish delivery gate; and the
      non-loopback-with-auth-OFF warning (see `design.md` §10 — it did not previously exist).
- [x] 2.7 `src/caspar-runtime.ts` — `recordIdentityEvent`, the one narrow audit append the bridge
      makes directly. Its type cannot express a slot, an item or a failure outcome, so it cannot
      become a second general-purpose append.
- [x] 2.8 `bin/caspar-bridge.mjs` — `--auth` and the seven `--playout-*` flags, each refusing a
      valueless spelling; a NARROW catch that turns a `PlayoutConfigError` into the CLI's own
      one-line refusal and re-throws everything else; and the auth mode READ BACK on the boot
      line, both ways, in `C-029`'s shape.

## 3. The console

- [x] 3.1 `src/renderer/ui/TextInput.tsx` — the shared text/password primitive, because
      `cg/raw-control`'s ratchet can only shrink and a new surface may not join its frozen list.
      No `style` prop expressible. `.cg-field[aria-invalid='true']` declared app-wide in
      `controls.css` (it existed only inside two modal scopes).
- [x] 3.2 `src/platform/playoutSession.ts` — the held token, D1 and D2, the contract's error
      codes mapped from the BODY before the status, and the ten-minute refresh lead.
- [x] 3.3 `src/platform/WebSocketRuntime.ts` — the `auth` frame written FIRST on every
      (re)connect from the one connect site; the auth state machine; the refresh timer cleared on
      dispose; `signIn` / `signOut`; and a resync after signing in on an already-open socket.
- [x] 3.4 `src/shared/runtime-bridge.ts` + `createRuntimeBridge.ts` — the `auth` contract member
      and the mock's honest `off`, whose `signIn` REJECTS rather than pretending.
- [x] 3.5 `features/auth/SignInOverlay.tsx` + `signInMessages.ts` — the Persian/RTL gate over the
      live stack, above `LockOverlay` because the bridge refuses `lock.release` to a socket with
      no principal; five sentences, no advice, no tutorial prose.
- [x] 3.6 `features/status/IdentityIndicator.tsx` — the sign-in state as its own pill beside the
      link, never folded into it (`design.md` §7).

## 4. Tests — one per acceptance bullet, named after the bullet

- [x] 4.1 `tests/support/fake-playout.ts` — the loopback fake: ES256 key generated in memory at
      start and never written to disk, D1/D2/D3/D9, permissive CORS, the contract's error shape,
      key rotation, revocation, credential failures, an offline switch, and live request counters
      so a cadence assertion has a positive control. **No credential is committed.**
- [x] 4.2 `tests/auth-gate.integration.test.ts` — acceptance 1 and 7's second clause, plus THE
      CENSUS over every route, plus the publish gate with its auth-OFF positive control.
- [x] 4.3 `tests/auth-principal.integration.test.ts` — acceptance 2: the principal, the verified
      actor, `sub` in the record, the ALS interleave, and the measured 64-code-unit truncation.
- [x] 4.4 `tests/auth-jwks.integration.test.ts` — acceptance 3: the unknown `kid`, counted.
- [x] 4.5 `tests/auth-expiry.integration.test.ts` — acceptance 4, including the tolerance and the
      same-socket restore.
- [x] 4.6 `tests/auth-playout-outage.integration.test.ts` — acceptance 5's bridge half.
- [x] 4.7 `tests/auth-revocation.integration.test.ts` — acceptance 6, with the cadence counted.
- [x] 4.8 `tests/auth-off-identical.integration.test.ts` — acceptance 7 and 8.
- [x] 4.9 `tests/playout-config.test.ts` — the precedence and the boot refusal that names the key.
- [x] 4.10 `tests/template-server-route-set.test.ts` — acceptance 9: the `kind` pin (the axis a
      guessed-path list cannot cover) and the four Playout-era paths added to the wire probe.
- [x] 4.11 `apps/runtime/tests/signInOverlay.dom.test.ts` — the surface, over the real lifecycle
      on one instance: appearance, Persian/RTL, the shared primitives, each error sentence, and
      the control proving the five sentences differ.
- [x] 4.12 `apps/runtime/tests/playoutSession.test.ts`, `webSocketRuntimeAuth.test.ts`,
      `identityIndicator.dom.test.ts` — storage, the frame order on (re)connect, sign-out, and
      the pill.
- [x] 4.13 The four guards that FORCED a decision, updated deliberately: the audit action
      partition, the bridge's persisted-file census, the browser's persisted-key census, and the
      mock↔bridge parity tree.

## 5. Records

- [x] 5.1 `docs/prd/caspar.md` — `C-037` → `[~]`, every acceptance bullet ticked.
- [x] 5.2 `docs/prd/runtime.md` — `R-066` → `[~]`, bullets 1 and 2 ticked (bullet 1 carries the
      link-indicator clause) and 3, 4 and 5 explicitly NOT.
- [x] 5.3 `docs/integration/playout/README.md` — a dated delta under the open items: the sign-in
      half is implemented against a fake Playout and has NOT been run against `192.168.21.111`,
      which is why `C-040` stays `[~]`.
- [x] 5.4 `docs/adrs/0010-playout-link.md` — "Still open" items 1 and 2 marked closed
      (authorised by the owner for this change), minimally.
- [x] 5.5 `docs/operator-guide/README.md` — the sign-in paragraph, short, in the operator's words.

## 6. Gate

- [x] 6.1 `pnpm openspec validate playout-auth-signin --strict`.
- [x] 6.2 `pnpm exec prettier --write` on everything touched; `pnpm gate` green (plain, never
      `--force` — it is already inside the script).
- [x] 6.3 **Linux `e2e` DISCHARGED for `3add5032`** —
      <https://github.com/yasermostafaee/cg/actions/runs/35742892616>, `conclusion: success`, and
      the **`E2E (Playwright)` job RAN** (`conclusion: success`, not skipped — `P-029`). That
      commit carries the whole of `C-037` and `R-066`'s sign-in half.
- [x] 6.4 **Linux `e2e` DISCHARGED for `9a4ca4f4`** —
      <https://github.com/yasermostafaee/cg/actions/runs/35745278125>, `conclusion: success`, and
      the **`E2E (Playwright)` job RAN** (not skipped). That is the follow-up fix commit
      (`design.md` §11).
- [x] 6.7 **Linux `e2e` DISCHARGED for `ec4f682e`** (`DELTA A` + `DELTA B`) —
      <https://github.com/yasermostafaee/cg/actions/runs/35751024298>, `conclusion: success`, and
      the **`E2E (Playwright)` job RAN** (not skipped).
- [x] 6.8 **Linux `e2e` DISCHARGED for `7871c8cc`** (`DELTA C` — the reload e2e itself) —
      <https://github.com/yasermostafaee/cg/actions/runs/35754582905>, `conclusion: success`, and
      the **`E2E (Playwright)` job RAN** (not skipped). ⭐ That run is the first CI execution of
      `playout-auth-reload.spec.ts` itself: the spec that loads the real page five times against
      a real bridge now passes on Linux as well as on this host.
- [x] 6.6 **`DELTA C` — the AUTHORITATIVE reload assertion is an e2e**, not a bridge loop:
      `apps/runtime/tests/e2e/playout-auth-reload.spec.ts` loads the real page against a real
      bridge and a fake Playout, signs in once through the UI, reloads five times, and asserts
      ONE `sign-in` row and ZERO "not signed in" refusals. Red-before on the pre-fix build
      (**6** rows); green after (**1**). The bridge-level specs stay as the unit-level control.
- [x] 6.5 **The §8 walkthrough, exercised without a browser** — 15/15 checks, against the real
      D1 endpoint over a real WebSocket to a real bridge on loopback: capabilities answer an
      unsigned socket and advertise the sign-in address; a take AND `clear-all` are refused with
      the one sentence; D1 mints a token the bridge accepts; the same socket then drives a verb
      with no reload; the `sign-in` row and the VERB row both carry the verified Persian name and
      `sub`; sign-out is recorded and the socket stays open; a wrong password is
      `401 invalid_credentials` in the contract's shape; and 🔴 the `C-038` gap is VISIBLE —
      a viewer with NO channels signs in and commands.
