# Tasks — reachability predicate corrected (B-100)

## 1. Canonical predicate

- [x] 1.1 `@cg/caspar-client`: export `isLiveState` (`healthy` OR `degraded`) from the package
      entry point — one canonical reachability notion, no second local copy.

## 2. Bridge predicate + pairing

- [x] 2.1 Rename `#linkDown()` → `#noServerReachable()` and change the body to
      `sessions.every((s) => !isLiveState(s.state))`; import `isLiveState`. Update every call
      site (`load`, `take`, `update`, `stopItem`, `out`) and the comments that reference it
      (including the `restore()` contrast and the B-086 demote comment).
- [x] 2.2 `load()`: evaluate reachability ONCE and gate BOTH the adopt-`CLEAR` (via a `reachable`
      param on `#adoptLayer`) and the pre-roll `CG ADD` on that single value — never one without
      the other. The item still lands at `loaded` with slot/OSC-interest bound (B-082 unchanged).

## 3. Tests (red-first)

- [x] 3.1 New `reachability-predicate.integration.test.ts`: a load onto a `degraded` server clears
      the orphan AND re-adds it (never black); the CLEAR⇒ADD pairing invariant across healthy /
      degraded / disconnected; `take` on a degraded server ACCEPTED with `CG PLAY` on the wire;
      FROZEN B-056 mirror-pair sends still go through. Each new assertion shown RED pre-fix.
- [x] 3.2 Test-only seam: `CasparRuntime` accepts `sessionTuning` (OSC health timers) so a session
      can be driven into and HELD in `degraded` deterministically; empty in production.
- [x] 3.3 FROZEN, verified unchanged: R-006 offline refusal + B-082 offline load in
      `disconnected-refusal.integration.test.ts`; B-086 `onair-honest-linkloss` refusal (drives a
      full disconnect, not degraded — still refused).
- [x] 3.4 Fifth call site (follow-up): `stopItem` ACCEPTED on `degraded` with `CG STOP` on the wire
      and the producer left resident (C-012); FROZEN `stopItem` still refused `disconnected` with no
      server reachable, queueing nothing; and a walk of ALL FIVE call sites on one degraded server
      (`load → take → update → stopItem → out`) asserting each verb reaches the wire. These pin
      behaviour the fix above already changed — coverage, not red-first repros. The CLEAR⇒ADD
      pairing invariant has no verb axis (it is a `load`-path property), so the verb axis lives in
      that walk.

## 4. Docs

- [x] 4.1 `docs/prd/bugs-runtime.md`: B-100 → `[~]`; B-082 note that its CLEAR-then-nothing window
      is now fixed under B-100 and its hardware check is the same physical session.
- [x] 4.2 `docs/prd/b-number-registry.md` updated per its procedure.
- [x] 4.3 `CLAUDE.md`: two standing rules (predicate-name-is-contract; one boolean gates both the
      destructive and constructive step, read once).

## 5. Gate

- [x] 5.1 `pnpm openspec validate runtime-reachability-predicate --strict`.
- [x] 5.2 `pnpm gate` green (uncached), caspar-bridge green isolated AND under full parallel run.
- [ ] 5.3 Real-CasparCG verification (OWED, mandatory before archive): drive a server to
      `degraded` (stop OSC, leave AMCP up), put a graphic on the layer, Load onto it → not black;
      then Take → it plays. Discharges B-082's owed real-CasparCG check #1 in the same session.
