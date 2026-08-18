# Tasks — the audit actor names the acting console (B-141 follow-up)

## 1. The wire

- [x] 1.1 `WsRequestFrameSchema` gains an OPTIONAL `actor` (max 64). Optional so a client
      that declines to say is still served and still recorded — never refused.
- [x] 1.2 `UNATTRIBUTED_ACTOR = 'unattributed'` and `normalizeActor()` defined beside the
      frame in `@cg/shared-ipc`, so sender and recorder cannot disagree about the rule.
      Exported from the barrel.
- [x] 1.3 The envelope's docstring records that `actor` STRETCHES its transport-only remit
      deliberately, and why the alternative (the field on N channel schemas) is worse.

## 2. The bridge — one site learns the answer

- [x] 2.1 New `tools/caspar-bridge/src/actor-context.ts`: `runAsActor()` / `operatorActor()`
      over `AsyncLocalStorage`.
- [x] 2.2 🔴 Why ALS and not a field, written into the file: stack ops await their AMCP ack,
      so two browsers' requests interleave and a mutable "current actor" would be
      overwritten mid-flight. ALS is the primitive without that bug.
- [x] 2.3 `bridge.ts` wraps its ONE dispatch site: `runAsActor(frame.actor, () =>
  route.handle(...))`. Normalised on entry — the bridge does not trust the wire.
- [x] 2.4 `caspar-runtime.ts`: the `OPERATOR_ACTOR` constant is gone; all 7 `actor:` sites
      read `operatorActor()`. A signpost comment stays where the constant was, so the next
      reader finds where the answer moved.

## 3. The browser — one site puts it on the wire

- [x] 3.1 New `apps/runtime/src/platform/operatorName.ts` — `localStorage`, read-through on
      every call (a cache would go stale against a second tab on the same console).
      Carries the rejected alternatives (PIN sign-in, per-connection client id) with their
      reasons.
- [x] 3.2 `WebSocketRuntime.#invoke` — the single send site — attaches
      `operatorActorForWire()`. Read at SEND time, so a rename takes effect next action.
- [x] 3.3 `RuntimeBridge` contract gains `audit.operatorName()` / `setOperatorName()`,
      synchronous, documented as browser-local by nature — the same shape and the same
      reasoning as the existing `templates.html`.
- [x] 3.4 `MockRuntime`'s `auditEntry()` records the same actor, so the offline console is
      not the one place where the column disagrees. Mock adapter implements the two new
      methods (the B-074 mock↔bridge parity guard covers this).

## 4. The surface — where an operator reads it

- [x] 4.1 The name control lives in the **Audit panel**. ⚠ NAMED, not solved twice: the
      Runtime has no settings shell (that is R-054, unstarted), and this is the only
      surface where `actor` appears at all — column and filter — so the value and its
      limits are read in one glance. No new dialog for one field.
- [x] 4.2 🔴 The honesty half is ON the surface: "a LABEL you typed, not a verified sign-in
      — it says which console, not which person, and it does not change when somebody else
      takes the chair." Plus what an empty field records.
- [x] 4.3 `R-054`'s item records that this control must MOVE into the Settings shell when
      that is built.

## 5. The decision, recorded

- [x] 5.1 Unset records `unattributed`, NOT the old `operator`. A word for a state cannot be
      mistaken for a name somebody typed; `operator` could.
- [x] 5.2 Rejected shapes and their reasons are in the proposal and in `operatorName.ts`:
      the PIN-backed sign-in (safety mechanism ≠ identity mechanism; a login in front of an
      emergency console) and the per-connection client id (identifies a browser).

## 6. Tests

- [x] 6.1 New `tools/caspar-bridge/tests/audit-actor.integration.test.ts` — 5 tests, END TO
      END: real WS frame → real bridge dispatch → real writer → row read back **off DISK**
      (not `auditRecent()`, which falls back to the in-memory tail and would pass on a
      build whose writes never land). - a configured name reaches the NDJSON row; - an unconfigured console records `unattributed`, and explicitly not `operator`; - blank and empty strings are unattributed, not an actor naming nobody; - two consoles on one bridge are told apart.
- [x] 6.2 🔴 RED-THEN-GREEN, proven rather than assumed: with the `runAsActor` wrap removed,
      **2 of the 5 fail** (`expected [ 'unattributed', 'unattributed' ] to include 'Gallery
  2'`); restored, 5 pass. The three unattributed cases pass either way, correctly — they
      are not what the wrap decides.
- [x] 6.3 Ripple chased: `audit-append-sites.integration.test.ts` asserted
      `actor: 'operator'`. Those verbs are driven directly against the runtime with no
      request around them, so `unattributed` is now the honest expectation — updated with
      the reason, not just the value.

## 7. Owed

- [ ] 7.1 🔴 A completed, green Linux CI `e2e` run for the commit carrying this change, with
      `N run / N passed / N flaky` read from the log. Record the run URL here.
