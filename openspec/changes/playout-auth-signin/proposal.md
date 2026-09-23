# The control socket gets a principal, and the console gets a sign-in

## Why

The control WebSocket has no authentication at all. `packages/shared-ipc/src/ws-frame.ts` says so
in as many words — `actor` is _"SELF-DECLARED and UNVERIFIED … the control socket is
unauthenticated loopback"_ — and `wss.on('connection', …)` in `tools/caspar-bridge/src/bridge.ts`
serves every socket that arrives. The plant is adopting the Apasai Playout, which already holds
the operator directory and per-channel grants, so identity can be federated rather than invented.
`actor-context.ts` has been waiting for exactly this: _"the day identity becomes provable, this
function is the only thing that changes."_

This change makes that day. It implements `C-037` in full and the sign-in half of `R-066`, against
[ADR 0010](../../../docs/adrs/0010-playout-link.md) and the contract in
`docs/integration/playout/`.

## What changes

- **A fourth frame type.** `auth`, beside `request` / `response` / `publish`, carrying a
  Playout-issued JWT. The schema is the boundary: a frame with anything but a non-empty string
  token is refused at parse, before a verifier sees it.
- **An authorisation gate at `handleMessage`**, beside the `B-229` lock gate, at the one
  chokepoint every request passes. It answers one question — is there a valid principal on this
  socket, and is this one of the two things an unauthenticated socket may ask.
- **Offline verification.** ES256 against the Playout's cached JWKS (`jose`), `iss` byte-equal to
  `playout.issuer` and never derived, `aud` containing `cg-control`, ±60 s clock tolerance, an
  unknown `kid` re-fetching the key set at most once per 60 s.
- **A principal per socket**, reaching the audit record through the existing ALS seam:
  `operatorActor()` yields the token's verified `name`, `sub` rides beside it, and two browsers
  with two tokens interleave without crossing.
- **Revocation (D9)**, polled in the background at most once per 60 s and read synchronously at
  the gate. A Playout outage leaves the bridge holding the last list it saw; it never changes a
  verdict and it is never in the path to air.
- **`playout.*` configuration** under `R-010`'s precedence (CLI flags > file > default), in its
  own `~/.cg-runtime/bridge-playout.json`. Auth defaults to `off`. A mode of `playout` with a
  missing `issuer` or `jwksUrl` is a boot failure with a sentence naming the key.
- **`bridge.capabilities` gains** the auth mode, the sign-in and refresh addresses, and the
  contract version — answered to an unauthenticated socket, because it is asked at connect.
- **A console sign-in** over the live stack (Persian/RTL, shared primitives), the token held per
  console and presented on every (re)connect, refreshed about ten minutes before expiry, cleared
  on sign-out; and an identity pill naming the state in the operator's words.

## What does NOT change

- 🔴 **No refusal CONDITION on the path to air.** Nothing about the lock, nothing about PANIC,
  and golden rule 10's gate does not move. What changes is that a socket without a principal now
  gets two answers instead of every answer — when, and only when, auth is ON.
- **Auth OFF is byte-identical to today.** Every existing integration test is green and
  unedited; no new persisted key is written; no surface appears.
- The path to air is unchanged: bridge → AMCP/OSC → apasai-core, on the bridge's own session.
- The template origin keeps exactly its file routes plus `POST /complete` (ADR 0010 rule 13).

## A client-driven write path the gate now covers

🔴 **The retained-library RE-DELIVERY on reconnect is a client-driven write path fired from
retained state** — the console replays its whole template library at the bridge whenever a socket
opens, without an operator pressing anything. It is the same mechanism that seated six templates
on channel 1 on 2026-09-22 (`CHANNEL-RESOLUTION-01`).

This change puts it behind the gate: with auth ON and no principal, those frames are refused for
want of one, which is the gate working. `C-038`'s channel predicate is what will cover it for
AUTHORISATION — whether this principal may write to THAT channel — and that is not done here.

⚠ The **bank** half of `CHANNEL-RESOLUTION-01` remains its own separate item and is untouched by
this change. ✅ **CLOSED 2026-09-23 by `CHANNEL-AUTHORITY-01` commit 1 (`9d114657`)**: every
operating door that names a channel now refuses one the station's bank does not declare, auth
OFF included, before anything reaches CasparCG — `CHANNEL-RESOLUTION-01` had fenced the restore
door alone (`openspec/changes/channel-authority`, `B-261`).

## A surface that is stale the moment auth is ON

🔴 **2026-09-22 — UNDER AUTH ON, THE AUDIT PANEL'S SELF-DECLARED-LABEL CAVEAT IS DISPLAYED AND FALSE.** Directly above rows carrying a VERIFIED name, the panel still reads _"It is a LABEL you typed, not a verified sign-in — it says which console, not which person."_ That sentence was true for every build before this one and is untrue the moment a bridge runs `auth: 'playout'`. The remedy is named and owned: `R-066` bullet 5, the two-axis `operatorName` retirement sweep, which is OUT of this change. ⚠ It is recorded rather than hidden — a conditional that showed the caveat only when auth is off would create a THIRD state for that sweep to find, which is how a sweep comes to miss one.

## Out of scope — named so nobody mistakes it for done

- **`C-038`** — permission classes as a required `route(…)` argument, the route census,
  per-channel gating, bulk-verb all-or-nothing, viewer read-only by construction.
- **`R-066`'s remainder** — the permitted-channel strip, the viewer read-only state, and the
  two-axis `operatorName` retirement sweep. The PRD records the sweep as the hard part and it is
  not started here; the _"a LABEL you typed, not a verified sign-in"_ caveat therefore still
  stands on the Audit panel and is now stale whenever auth is ON.
- **`C-039`** — D4 as the first channel-discovery source.
- **`C-040`'s sign-in half** — the announced run against the test Playout at `192.168.21.111`.
  Nothing in this change has been run against it; everything here is exercised against a fake
  Playout on loopback that generates its ES256 key at test start and writes nothing to disk.

🔴 **The consequence, stated plainly:** with auth ON and only this change landed, _any verified
principal — a `viewer` included — can command any channel._ That is `C-038`'s job. It is not done
here, and it is why the plant does not run auth ON until `C-038` lands.

## Impact

- **Schemas:** `@cg/shared-ipc` gains the `auth` frame, the `auth.*` channels, the one refusal
  sentence and three token-rejection sentences; `bridge.capabilities` gains four optional fields.
  `@cg/shared-schema`'s `AuditEntrySchema` gains the `sign-in` / `sign-out` actions and the
  optional `actorSub` / `actorNameTruncated` fields. All additive.
- **Dependency:** `jose` becomes a dependency of `tools/caspar-bridge`, so `pnpm-lock.yaml`
  moves — shared config, flagged at the push.
- **Persisted state:** one new bridge file (`~/.cg-runtime/bridge-playout.json`) and one new
  browser key (`cg.runtime.playoutSession`). Both join their censuses.
- **Surfaces:** a new sign-in overlay and a new identity pill in the Runtime, both absent when
  auth is off; a new shared `TextInput` primitive in `renderer/ui/`.
- **Guards that FORCED a decision and were updated deliberately, not to go green:** the audit
  action partition (`audit-append-sites`), the persisted-file census, the browser persisted-key
  census, and the mock↔bridge parity tree. Each exists to make a new thing impossible to add
  silently, and each did its job.
