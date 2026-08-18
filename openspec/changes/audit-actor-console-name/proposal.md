# The audit `actor` becomes a per-console operator name (B-141 follow-up)

## Why

Every audit row carried `actor: 'operator'`, a constant. The record answered _what
happened_ honestly and answered _who did it_ with the same word every time — and on a
gallery where several consoles drive one rundown, "who" is the half a dispute turns on.
B-141 left it as a single `OPERATOR_ACTOR` seam precisely so the day a scheme was decided
there would be exactly one place to change.

**Owner decision, 2026-08-18: a per-console OPERATOR NAME**, set in the Runtime and sent
with each control request.

**Rejected, with reasons, so they are not re-proposed:**

- **A PIN-backed sign-in reusing the lock's PIN.** The lock's PIN is a **safety**
  mechanism, not an identity one; reusing it conflates two purposes into one rule, and
  neither can then be changed without breaking the other. It also puts a login in front of
  a console that must be usable instantly in an emergency. It stays available as an
  ADDITIVE later step — it would fill this same seam with a verified value and every
  reader would stay put.
- **A per-connection client id.** It identifies a BROWSER. Nobody disputes which browser
  did something.

## 🔴 What this is worth, and what it is not

**The name is SELF-DECLARED and UNVERIFIED.** The control socket is unauthenticated
loopback. So the record answers **"which console, as labelled"** and NOT **"which person,
proven"**: anyone can type anything, and a console shared across a shift change carries
yesterday's name until somebody edits it.

⚠ **That limit is written into the OPERATOR-FACING SURFACE, not only into this document.**
Stating it only in a design note is exactly the failure `B-143` records one level out — the
system knows the limits of what it knows, and the person who acts on it is the one not
told. The caveat therefore sits in the Audit panel, beside the `actor` column it qualifies,
in the operator's words.

**An unset name must not become a lie.** An unconfigured console records
**`unattributed`** — a word for a STATE, not a role and not a plausible name. The previous
constant `operator` was honest while it was the only value any row could carry, but the
moment some rows name a console it becomes ambiguous between "never configured" and
"somebody typed operator".

## What Changes

- The WS request envelope gains an optional `actor`. It stretches the envelope's stated
  transport-only remit deliberately: attribution is per-request metadata that applies
  identically to every channel, and the alternative is the same field on N channel schemas
  — N chances to miss one, and a contract change on every one of them.
- One place on each side. The browser attaches it at its single `#invoke` send site; the
  bridge binds it for the request's async execution (`AsyncLocalStorage`) so
  `operatorActor()` is correct at every depth without any of the ~9 append sites taking a
  parameter. A mutable "current actor" field would be wrong here and the code says why:
  stack ops await their AMCP ack, so two browsers' requests interleave.
- `normalizeActor` is defined once, beside the frame, and applied by BOTH ends — the bridge
  does not trust the wire, because `actor` is the one field a client controls outright.
- Browser-local storage, deliberately: a bridge-side setting would be one value for the
  whole gallery, which is the question the constant already answered.

## ⚠ Where the setting lives — a problem NAMED, not solved twice

The Runtime has **no settings shell** yet; that is **R-054**, unstarted. Rather than build a
standalone dialog for one field, the control lives in the **Audit panel**, which is the
least-bad existing home for three reasons: it is the ONLY surface where `actor` appears at
all (the column and the filter), so the value and the limits of the value are read in one
glance; the operator sets it exactly where they see its consequence; and it costs no new
chrome. **R-054's item records that it must move into the Settings shell when that is
built.**

## Impact

- Affected specs: `runtime-caspar-bridge`
- Affected code: `packages/shared-ipc/src/ws-frame.ts`,
  `tools/caspar-bridge/src/{actor-context,bridge,caspar-runtime}.ts`,
  `apps/runtime/src/platform/{operatorName,WebSocketRuntime,MockRuntime,createRuntimeBridge}.ts`,
  `apps/runtime/src/shared/runtime-bridge.ts`,
  `apps/runtime/src/renderer/features/audit/AuditPanel.tsx`
- ⚠ **Existing audit rows keep `operator`.** New rows from an unconfigured console read
  `unattributed`. That difference is intended and dateable, not a migration.
