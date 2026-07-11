# Tasks — fix-setconfig-serve-restart

## 1. Artifacts

- [x] Diagnosis-first: repro/probe experiments recorded in `design.md`
      (one root cause — unserialized setConfig — two failure modes;
      environment-dependent wedge explained; bare-id contract bug).
- [x] `pnpm openspec validate fix-setconfig-serve-restart --strict`.

## 2. `@cg/shared-ipc`

- [x] Add `'apply-in-progress'` to the `connections.set-config` response
      reason enum; schema test.

## 3. `tools/caspar-bridge`

- [x] `TemplateHttpServer`: track sockets on `'connection'`; `stop()` calls
      `closeAllConnections?.()` and destroys tracked sockets — bounded
      teardown on every Node/CEF combination.
- [x] `CasparRuntime`: `#applyInFlight` serialization (concurrent apply →
      `'apply-in-progress'`, nothing changed); `#servingDesired` set in
      `startServing()`; setConfig restarts the serve whenever desired
      (transient `listening` no longer consulted) and can never return
      `ok:true` with the serve down; `#sendAdd` refuses with a
      `'template-serve-down'` ack when serving is desired but down (bare id
      only on the never-served unit path); test-only
      `options.templateServer` injection seam.
- [x] Regression tests: concurrent-apply (refused `'apply-in-progress'`,
      state uncorrupted, follow-up apply + Load work — FAILS pre-fix);
      CEF-wedge stop() boundedness (mid-request + preconnect sockets →
      < 1 s); injected-failing-server (apply-failed surfaced AND Load
      refused `'template-serve-down'` with ZERO CG ADD on the wire — FAILS
      pre-fix); sequential-cycle baseline (green both sides).

## 4. `apps/runtime`

- [x] Type ripple only: MockRuntime `setConfig` return type widened to
      include `'apply-in-progress'` (the sync mock can never return it);
      the panel already displays the refusal `message`.

## 5. Gate

- [x] Every caspar-client / caspar-bridge / runtime suite + failover
      integration green; full uncached gate (`turbo --force`) + root
      format check; full e2e; strict validation of all changes.

## 6. Wrap-up (Part C)

- [x] File the PRD regression bug → **B-064** (verified: B-063 is the
      highest across all three bug files on merged main).
- [x] Operator live-smoke checklist delivered (the exact repro; non-gating;
      in the final report and the change design.md).
- [x] Archive with the shared-spec ordering check — re-verified at archive
      time: the MODIFIED heading ("Server connection is reconfigurable at
      runtime, gated on air") appears in neither held delta → archived
      independently.
- [x] Conventional commits, push, compare URL, final report. (Gate note:
      the full e2e was interrupted mid-Part-B by an owner STOP — resumed
      and completed after the parked commit: 22/22 turbo tasks green.)
