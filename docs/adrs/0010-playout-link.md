# ADR 0010 — CG Control's link to the Playout: identity and channel permissions from the Playout; the path to air stays direct to CasparCG

- **Status:** Accepted — owner decision 2026-09-15 (by handing this work over); contract v1
  accepted by both teams 2026-09-16; v1.1 (D9) live the same day.
- **Date:** 2026-09-16
- **Related:** ADR 0007 (Electron → browser), ADR 0008 (thick CasparCG bridge), ADR 0009 §"A
  template that finishes by itself takes its row off air" (the `template-signals-completion` work,
  and with it the template origin's CSP), PRD `R-010` (server connection settings / the loopback
  invariant), `R-062` (the three single-channel gaps), `C-002` (the 2026-08-10 rundown note),
  `C-022` (the read-only live-source list), `B-141` (the audit actor), `B-153`
  (`bridge.capabilities`), `B-229` (the lock gate at the one chokepoint),
  [`docs/integration/playout/`](../integration/playout/README.md), and the five PRD items this ADR
  files: `C-037`, `C-038`, `R-066`, `C-039`, `C-040`.

## Context

**Today, measured in this tree.** A browser SPA talks to `caspar-bridge` over one WebSocket
carrying `@cg/shared-ipc` frames, and that socket has **no authentication of any kind**. The frame
union in `packages/shared-ipc/src/ws-frame.ts` has exactly three members — `request`, `response`,
`publish` — and the inbound one carries `actor`, an OPTIONAL string the client chooses, documented
there as _"SELF-DECLARED and UNVERIFIED … The control socket is unauthenticated loopback"_.
`tools/caspar-bridge/src/bridge.ts` serves every socket that connects (`wss.on('connection', …)`
wires publishes and a message handler, and does nothing else), and inside `handleMessage` the only
per-request gate is `B-229`'s lock check. A sweep for `jwt`, `bearer`, `token` and `auth` over
`tools/caspar-bridge/src`, `apps/runtime/src/platform`, `apps/runtime/src/shared` and
`packages/shared-ipc/src` finds no credential check anywhere: every `token` hit is a
`SELF-STOP-24` take token or a CasparCG `video-mode` token, and every `auth` hit is
`author`/`authority`/`authored` except the two comments that say the socket is unauthenticated.
The bind default is loopback (`DEFAULT_BRIDGE_HOST = '127.0.0.1'`, port `5280`), `--host 0.0.0.0`
is an explicit opt-in, and `R-010` asserts by test that _"the control WebSocket stays
loopback-bound regardless of server config"_.

**The bridge is thick** (ADR 0008): it owns every ledger, every refusal condition, the OSC
reconciliation, the template HTTP server the CEF fetches from, and the A/B redundancy. Its
integration suite is 79 `tools/caspar-bridge/tests/*.integration.test.ts` files at `546258d3`.
ADR 0008 already anticipated this moment — its Reversibility paragraph names _"a hosted
multi-operator deployment"_ as the kind of future need that would argue for moving protocol logic,
and keeps `RuntimeBridge` as the seam.

**Identity has a seam waiting for it.** `tools/caspar-bridge/src/actor-context.ts` says of
`operatorActor()`: _"THE ONE SITE THAT LEARNS WHO ACTED … the day identity becomes provable, this
function is the only thing that changes."_ The browser half,
`apps/runtime/src/platform/operatorName.ts`, records two REJECTED alternatives — a PIN-backed
sign-in reusing the lock's PIN (_"one secret serving two purposes means neither rule can be changed
without breaking the other"_, and it _"puts a login in front of a console that has to be usable
instantly in an emergency"_), and a per-connection client id (_"it identifies a BROWSER. Nobody
disputes which browser did something"_). Both rejections survive this ADR: the PIN stays a safety
mechanism, and the identity here comes from a third party rather than from the lock.

**The plant is adopting the Apasai Playout** (stated by the owner, 2026-09-15 — not measured here):
a React + Tauri client → REST/SignalR → a .NET 8 engine running as a Windows service → AMCP →
**apasai-core**, a CasparCG fork customised for PGM capture and output A/V sync. Its API is
JWT-gated, it holds the operator directory, and — since build 2.8.43, added for this work (Playout
team, Q7, 2026-09-16) — per-channel operator grants.

**The question this ADR answers:** does CG Control's control path go **through** the Playout's API,
stay **direct** to CasparCG, or take a third shape?

⚠ **TERMINOLOGY, because this document used to blur it.** `192.168.21.114` is a **stock test
CasparCG** and `192.168.21.111` is the **test Playout**. Neither is "the plant": the real on-air
installation **has no address yet**. Where "the plant" appears below it means that future
installation, never one of these two boxes.

**The build-identity question, ANSWERED by the Playout team (2026-09-16, Q3 — stated by the Playout
team, not measured by this repo):** the stock test CasparCG at `192.168.21.114` reports
`2.5.0 69e8ad5 Stable` and is **stock CasparCG**;
apasai-core reports **`2.5.0 6b29237 Dev`** and runs on the test Playout at `192.168.21.111`. A
sweep of `docs/recon/**`, `docs/prd/caspar.md`, `docs/prd/bugs-runtime.md`, `docs/handoff/**` and
`tools/caspar-amcp-probe/**` for `apasai`, `fork`, `6b29237`, `69e8ad5` and `ciab` **finds no
contradiction**: `6b29237` appears nowhere (0 hits, expected — this repo has never met
apasai-core); all 11 `fork` hits are about forking a CODE PATH, never a build; and `apasai` appears
exactly once, as the string `ApasaiCIAB_out.mov` inside `docs/recon/ciab-client-tools.json` — which
`docs/recon/README.md` is careful to call _"the plant's CIAB client, a MODIFIED CasparCG Client,
not stock CasparCG and not a description of the CasparCG SERVER"_. Nothing in the tree calls
`69e8ad5` a fork. The repo's own recon records it as _"the same commit as the June '2.5.0 dev
build'"_ (`docs/recon/2026-07-28-casparcg-250-validation.md`), which is consistent with the Playout
team's statement.

**What does NOT move.** The `C-002` division of roles recorded 2026-08-10 — _"CIAB drives the bed
and its rundown; this Runtime drives the graphics"_, with a rundown inside this Runtime REJECTED.
The layer map in `README.md`: **1–49 is FREE and not ours**, 50–59 beds, 60–79 plates, 80–99
templates. Owner answer **A16**: `silenceAllLivePlates` stays UNSCOPED. Golden rule 2 — the Playout
is a **peer system we federate identity from, not a backend we own**; persistence stays file-based
behind the bridge, and the browser talks to nothing but the bridge for control.

## Decision

**Option C — "identity from the Playout, air direct."**

1. **The bridge is the ONE authorisation point.** A socket establishes its principal with an `auth`
   frame carrying a Playout-issued JWT, and every request passes the one chokepoint —
   `handleMessage` — where an authorisation gate sits BESIDE the `B-229` lock gate. Same reason,
   same place: _"a rule spelled per call site is a rule that is already broken at the site nobody
   looked at."_ Verification is **OFFLINE**: ES256 against the Playout's JWKS
   (`GET /.well-known/jwks.json`, cached, re-fetched on an unknown `kid` at most once per 60 s;
   retired keys stay published ≥ 48 h, Playout C5). `iss` is compared byte-for-byte to
   `playout.issuer`, copied verbatim from the Playout's configured value — the engine base URL, no
   trailing slash (Addendum A, O3) — and never derived. `aud` must contain `cg-control`. Clock
   tolerance ±60 s.

2. **Permissions are per channel, enforced at the bridge, from `cg_channels`** (`[{host, channel}]`,
   or the string `"*"`). Every route gets a permission class beside its `LockPolicy` — `read` (any
   signed-in principal, a `viewer` included), `operator` (every channel the request touches ∈
   `cg_channels`), `station-admin` — as a **REQUIRED argument of `route(…)`**, exactly as `lock` is
   today, censused by a test that walks every route. **Roles are evaluated hierarchically**
   (`station-admin ⊇ operator ⊇ viewer`), so the bridge works whether the issuer emits cumulative
   roles (it does — Playout C1) or a single one. A `viewer` token carries `cg_channels: []`
   **unconditionally**, even when the account has channel grants (Playout C8) — so "viewer = every
   read, no command" holds by construction rather than by convention. Until `R-062` lands the
   channel set is the declared set; the MODEL is per-channel from day one. `silenceAllLivePlates`
   stays UNSCOPED (A16) and requires `operator`.

3. **`actor` becomes the VERIFIED `name` from the token.** One seam, already named: `runAsActor` /
   `operatorActor()`. `sub` is an opaque stable id (Playout C2) and is kept in the audit record
   beside the name. The self-declared console name, and the _"self-declared label, not a verified
   sign-in"_ copy that qualifies it, are retired everywhere — a golden-rule-9 sweep on two axes,
   the sentence and the `operatorName` symbol. The lock's PIN stays a SAFETY mechanism and never
   becomes identity.

4. **Expiry degrades; it never disconnects and never touches air.** An expired token refuses NEW
   operator intents with ONE sentence living in `@cg/shared-ipc` beside `LOCK_ENGAGED_REFUSAL` (the
   `R-017` one-string discipline), naming the remedy; `read` routes keep answering; the socket is
   never closed over a token; and a fresh `auth` frame on the SAME socket restores every control
   with no reload — the inverse half that `B-229` insisted on for the lock. A never-authenticated
   socket gets `bridge.capabilities` and the `auth.*` door, nothing else. **Amended 2026-09-26
   (`DELTA-MULTI-CHANNEL-01-B` B1): and the connection check (`setup.check`)** — it is how a
   console learns whether a sign-in can work at all, it reads and changes nothing, and before a
   sign-in it checks this station's own Playout and nothing else, so the door cannot make the
   station a network probe for an unsigned caller. The one refusal names nothing it cannot know
   is involved: "…so that was refused and nothing was done". Access tokens live
   **12 h** (one shift), deliberately NOT shortened: a short token would make every console depend
   on the Playout being up at refresh time, which is the coupling this whole shape exists to avoid.

5. **Revocation — D9, contract v1.1, implemented by the Playout verbatim and LIVE on the test box
   (2026-09-16).** `GET /api/cg/revoked` (Bearer, `ETag`/`If-None-Match`) →
   `{ revoked: [{ jti, exp }] }`, entries pruned one minute after `exp` so the list cannot grow
   without bound. The Playout revokes automatically on disable, delete, or refresh-family theft,
   and manually through its own admin endpoint. The bridge polls at most once per 60 s; a revoked
   `jti` refuses NEW intents only; reads keep answering; and on a Playout outage the bridge keeps
   the LAST list it saw. **A Playout outage never changes a verdict** — golden rule 8, applied to
   an axis the bridge cannot probe.

6. **The path to air is unchanged: bridge → AMCP/OSC → apasai-core, on the bridge's OWN session.**
   apasai-core's AMCP is **unauthenticated** (Playout Q1, measured on their side: a raw socket to
   5250 answers `VERSION` with `2.5.0 6b29237 Dev`), so **no service credential exists** and none is
   owed. The gate is a **Windows Firewall rule on the Playout host** blocking inbound TCP 5250 from
   the LAN (their `secure-ports.ps1`); the core itself listens on `0.0.0.0:5250` behind it. A
   per-bridge-IP allow rule is therefore a **deployment prerequisite**, not a code task. This is the
   posture `docs/phases/phase-2-system-architecture.md` §4 already records: _"AMCP is plaintext and
   unauthenticated by CasparCG design — document VLAN isolation as a deployment requirement"_, not
   a software fix. No new hop, and no head-of-line queue behind the Playout's playlist traffic.

7. **Deployment shape: the bridge and the Playout engine run on DIFFERENT hosts** (Playout Q4,
   recommended and adopted). On the Playout host UDP 6250 is already taken by the engine's own OSC
   listener. On a separate host the core sends OSC to each AMCP client's own address
   (`disable-send-to-amcp-clients = false`, `default-port 6250`), so the bridge receives OSC on its
   own machine's 6250 — which that machine's inbound firewall must allow, and that is OUR side.
   Test bridge host: `192.168.21.93`.

8. **The Playout is the CHANNEL authority; the bridge remains the PLAYOUT-CONTROL authority.**
   `GET /api/cg/channels` (`{id, name, casparHost, casparChannel}`) becomes the FIRST source of
   `R-062`'s discovery call, with the two existing sources — `fixedLayers.config.channel` and
   `channelSettings.settings[].channel` — staying as fallbacks. `casparHost` + `casparChannel` is
   the join key with `cg_channels` and must be spelled exactly as the bridge's `servers.A.host`
   (`192.168.21.111` on the test box). **Preview channels `N+1..2N` exist on the core, are never
   published by D4, and CG Control never addresses or enumerates them.** Every read from the
   Playout degrades to ABSENT — it never gates a verb.

9. **The browser obtains the token; the bridge only verifies.** `POST /api/cg/auth/token`, with
   refresh via `POST /api/cg/auth/refresh`, both browser → Playout. The bridge never sees a
   password. `bridge.capabilities` advertises the auth MODE and the sign-in address, for the reason
   `B-153` gives — it is asked at connect, _"before the operator can press anything"_. CORS on the
   Playout covers the console origins (`http://192.168.21.93:5174`, `http://127.0.0.1:5174` today).

10. **Viewer consoles exist** (Addendum A, O1 — ON on the test Playout and to be ON at the plant):
    a `viewer` token (`cg_channels: []`, C8) reads everything and commands nothing, and PANIC is
    refused to it with the one sentence. An operator-capable account with NO channel grants is
    refused at sign-in with `403 no_cg_access` (test user `cg-noch`).

11. **Bind policy (owner default).** Auth OFF + loopback is today and stays. Auth OFF +
    `--host 0.0.0.0` stays permitted for development, with the existing warning. The PLANT runs
    auth ON. The stricter rule — _"an unauthenticated control socket never leaves loopback"_ — is
    recorded here as **NOT adopted now**, and as a candidate golden rule once auth ships.

12. **Transport confidentiality is a separate item, not a gate on this one.** Plain `ws://` and
    `http://` today: the console page is served over `http`, so the Playout API stays `http` or a
    mixed-content switch would be needed on both sides at once. HTTPS on 8443 exists on the Playout
    and moves together with TLS on the bridge.

13. 🔴 **No identity, control or data route ever shares the TEMPLATE origin.** The template pages
    run inside CasparCG's CEF, and since `template-signals-completion` (`SELF-STOP-24`, commit
    `f7fd432f`, 2026-09-15) their CSP is `connect-src 'self'` — which makes the bridge's template
    HTTP server on port 7911 a **security boundary**: whatever lives on that origin, a template page
    can call. The code already says so and already has the guard: the router _"consults
    `TEMPLATE_SERVER_ROUTES` and nothing else … a boundary spelled as inline `if`s is one that can
    be widened without anybody seeing it"_, pinned by
    `tools/caspar-bridge/tests/template-server-route-set.test.ts`. So: the `auth` frame travels ONLY
    on the control WebSocket (5280); the JWKS, channel-catalogue and revocation reads are bridge →
    Playout, server-side; and the Playout API is a THIRD origin the console browser calls directly.
    The template origin keeps exactly its file routes plus `POST /complete`. An identity or control
    route appearing there is a defect, not a convenience.

**Amendment — 2026-09-23 (`DESKTOP-APPS-01-A`): the issuer is LEARNED, never typed.** A client
installs its own Playout on its own addresses, and the Playout may sign with a fixed, address-free
`iss` (proposed `urn:apasai:playout`). So a station may be configured by the Playout's ADDRESS
alone (`playout.address`): every endpoint, the JWKS included, derives from it, and `playout.issuer`
is optional. While it is unset, the bridge ADOPTS the `iss` of the first sign-in token that
verifies against the JWKS fetched from that address, carries `aud` `cg-control`, and holds
`station-admin` — and persists it as `playout.issuer`. From then on rule 1 applies unchanged: the
comparison is byte-equal, a mismatch is refused in words ("not for this station"), and nothing is
ever re-adopted silently. Before adoption, only adoption is accepted: any other token is refused
with one sentence ("This station is not set up yet"), and an unset issuer never means "accept any
`iss`". The adopted value is CLEARED only when the Playout address is changed — which is written by
CG Control itself (ADR 0011), never over the control socket, and replaces the whole Playout group;
the next `station-admin` sign-in adopts again. An explicitly configured issuer is never adopted
over and behaves exactly as before. **The root of trust is the JWKS at the configured Playout
address; `iss` is a constant check, never an install identity** (`DESKTOP-APPS-01-B`): from
Playout 2.8.54 every install signs with the same `iss`, `urn:apasai:playout`, so two installs are
told apart only by the keys each publishes at its own address — never by `iss`.

## Consequences

- **No hop is added to the path to air**, and no second copy of the CG contract has to exist in
  .NET.
- **The integration suite stays valid with auth OFF** — all 79 files — and gains an auth census
  beside the existing lock census (`tests/lock-refuses-intents.integration.test.ts`) and the `B-074`
  route-coverage guard (`tests/route-coverage.test.ts`).
- **New surface in CG Control:** a sign-in (Persian/RTL, once per shift, surviving a reload per
  console), a permitted-channel strip, a viewer read-only state, the refusal wording, and a proven
  audit actor — which retires the `B-141` caveat wherever it is written.
- **Coupling to the Playout is narrow:** sign-in, and two read lists. Nothing else.
- **Owed by us before the joint test:** inbound UDP 6250 on the bridge host, and the recon re-run
  against apasai-core (`C-040`).
- **Owed by them:** running the prepared `secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` as an
  administrator — the TCP 5250 allow rule, and the last prerequisite — plus the plant's `iss` and
  `casparHost` strings before deployment.
- **Test fixtures on their side** (`cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch`, channel
  `cg-test2`) are temporary, and we say when they are released.

## Alternatives considered

**A — control through the Playout API only.** Rejected, on five independent grounds:

1. It puts a **failure domain ON the path to air**. An engine restart takes graphics control down
   while CasparCG keeps playing the bed — the operator watches a live channel they cannot touch.
2. **Golden rule 8.** The bridge judges the AMCP and OSC axes directly. Behind a proxy it would be
   judging _"API up"_ and could read HEALTHY while CasparCG is down — reading one channel's silence
   as another channel's state is exactly `B-101`.
3. **Head-of-line blocking** behind the Playout's playlist traffic. A lower third that lands frames
   late is visible.
4. Every CG verb we use — `MIXER`, `ROUTE`, `INFO CONFIG`, consumer `ADD`, the `__cg` UPDATE
   payload — becomes a **Playout feature request**, which is a second copy of the CG contract:
   golden rule 6 at product scale.
5. The OSC firehose would have to be relayed or re-modelled, **undoing ADR 0008**.

**B — direct, with no Playout link at all.** Rejected as the END STATE, not as today: it leaves no
identity, no per-channel permission, an unauthenticated socket on the plant LAN, and an audit actor
that is a label.

**D — a Playout reverse proxy in front of the bridge.** Rejected: the bridge must still know the
principal, so the proxy forwards claims the bridge then trusts on a header — a second trust
boundary, and it puts the engine process back in front of the control socket anyway.

**E — re-implement CG control inside the engine.** Rejected: months of .NET to reproduce the
ledgers, the refusal conditions and 79 integration tests, for no new capability.

## What the Playout team answered

Their first response is
[`PLAYOUT-CG-RESPONSE-v1.md`](../integration/playout/PLAYOUT-CG-RESPONSE-v1.md) (2026-09-16, build
2.8.44). **Everything in this section is stated by the Playout team on 2026-09-16 and is not
measured by this repo.**

- **Q1** — apasai-core's AMCP is unauthenticated; the gate is a per-IP Windows Firewall rule. No
  service credential exists, so the contract's R8 does not apply.
- **Q2** — no verb we use changed. Additive only: `MIXER … AUDIOMAP`, a `pgm` consumer (MJPEG on
  TCP 9250 + index − 1, WAV on 9350 + index − 1 — noted as the cheapest future path to a console PGM
  picture, and out of scope here), and a `webrtc` module. Flash is disabled in their generated
  config; HTML templates are unaffected, which is all we serve.
- **Q3** — the stock test CasparCG (`192.168.21.114`) is stock `69e8ad5`; apasai-core is
  `6b29237 Dev`.
- **Q4** — different hosts; UDP 6250 is taken on the engine host; 5280 and 7911 are free there.
- **Q5** — ES256 with JWKS; `aud = cg-control` accepted; `iss` is the base URL, set explicitly.
- **Q6** — new `/api/cg/*` endpoints against the same user store.
- **Q7** — per-channel grants did not exist before this work; they extended the existing user record
  (`channels[]` + `allChannels`) rather than inventing a second permission store. Role mapping:
  system admin / engineer → `station-admin`; playout operator → `operator`; media manager / viewer →
  `viewer`.
- Their acceptance run: **17/17**.

**Our independent verification of their sample token** (Reply A §1): the ES256 signature is valid
against the JWK's public point, the `kid` is present in the JWKS, and every claim matches the
contract — `aud`, `iss`, an 18-character Persian `name` within the 64-char bound, cumulative
`roles`, well-formed `cg_channels` whose pairs are spelled identically in `channels.json`, and a
12 h `exp − iat`. That check is ours and it did pass; everything it asserts ABOUT the token is
still a statement about their issuer.

**Response B** ([`PLAYOUT-CG-RESPONSE-B-v1.md`](../integration/playout/PLAYOUT-CG-RESPONSE-B-v1.md),
build 2.8.45): viewer sign-in ON plus **C8**; **D9 implemented verbatim**, with revocation automatic
on disable, delete and refresh-family theft plus a manual admin endpoint; `cg-noch` added;
**22/22**; signing keys reset after testing, which is why the JWKS is read live and the committed
snapshot is dated evidence only; and the firewall allow rule prepared, awaiting an administrator.

## Still open

1. ✅ **CLOSED (2026-09-22)** — the **TCP 5250 allow rule** on the Playout host. Authorised in
   writing and EXERCISED: a bridge from `192.168.21.93` connected and `VERSION` answered
   `2.5.0 6b29237 Dev` on the first attempt. Recorded in
   [`docs/integration/playout/README.md`](../integration/playout/README.md) open item 1.
2. ✅ **CLOSED (2026-09-22)** — **inbound UDP 6250** on the bridge host `192.168.21.93`, and
   WIDENED: three inbound rules now admit both `192.168.21.111` and `172.27.36.46`, because a rule
   scoped to `.111` alone would have dropped OSC **and** the template fetch, manufacturing a
   `degraded` reading and a take-404 shape that both look like faults in apasai-core. Recorded in
   the same README, open item 2.
3. The **recon re-run** against apasai-core — ours (`C-040`).
4. The **plant's `iss` and `casparHost` strings**, and the final console origins — both, later.
5. **TLS** on the bridge and the Playout together — a separate item, deliberately not a gate here.

⚠ One thing this ADR does NOT settle, recorded so it is not mistaken for settled: the
`MAX_ACTOR_LENGTH = 64` bound in `packages/shared-ipc/src/ws-frame.ts` is what the contract's
`name ≤ 64` was cut to match, and the bridge TRUNCATES at it. A Playout display name longer than 64
characters would be silently shortened in the audit record. No such name exists on the test Playout
(the sample is 18 characters), so this is a note, not a defect.
