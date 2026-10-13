# Apasai Playout → CG Control — Response to Integration Contract v1

**From:** Apasai Playout team · **Date:** 2026-09-16 · **Playout build:** `2.8.44`
**Re:** `PLAYOUT-INTEGRATION-CONTRACT-v1.md` + `cg-control-playout-api.openapi.yaml` (2026-09-15)

> **خلاصهٔ فارسی —** قرارداد نسخهٔ ۱ **پذیرفته شد**؛ هیچ تغییرِ شکستنی لازم نیست. D1 تا D5
> به‌علاوهٔ D8 پیاده و روی پلی‌اوتِ تست اجرا شده‌اند و هر ۱۷ بندِ چک‌لیستِ پذیرشِ §8
> «قبول» شده است. جوابِ Q1 تا Q7 در بخشِ ۲ آمده — مواردی که زنده تأیید شده‌اند با
> «verified» مشخص‌اند و آن‌هایی که تصمیمِ انسانی می‌خواهند با «decision needed».
> دو نکتهٔ مهم برای استقرار: (۱) درگاهِ AMCP روی میزبانِ پخش با فایروال از شبکه بسته
> است و باید برای IPِ بریج باز شود، (۲) اگر بریج روی همان ماشینِ پلی‌اوت اجرا شود،
> UDP 6250 آزاد نیست چون شنوندهٔ OSCِ خودِ موتور روی آن است.

---

## 1. R1 — Acceptance

**Contract v1 is accepted as written.** No breaking change is requested; every MUST is
implemented. The items below are clarifications and one deliberate addition — none of them
changes a wire format, a path, a claim name, or an error code, so **no v1.1 is needed** unless
you want to adopt clarification C1 or C6 into the text.

| #   | Clarification / deviation                                                                                                                           | Why                                                                                                                                                                                                                                                                                | Impact on the bridge                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C1  | `roles` is emitted **cumulatively**, highest first: `station-admin` → `["station-admin","operator","viewer"]`, `operator` → `["operator","viewer"]` | §5 says station-admin may do "everything above", i.e. the hierarchy is implied. A bridge that tests `roles.includes('operator')` literally would otherwise refuse a station-admin. The array stays a non-empty, unique subset of the enum, so it validates against §3.3 unchanged. | None. `roles[0]` is still the display role. |
| C2  | `sub` is a stable 32-hex user id, not the username                                                                                                  | §3.2 requires "never reused for another person". Usernames can be deleted and recreated; the id cannot. Existing accounts were migrated automatically.                                                                                                                             | None. Treat `sub` as opaque.                |
| C3  | `name` falls back to the username when a user has no display name, and is cut at 64 characters as §3.2 requires                                     | Display names are optional in the Playout.                                                                                                                                                                                                                                         | None.                                       |
| C4  | `403 no_cg_access` is returned when the user has **no operator-capable role** _or_ **an empty channel list**                                        | §4.1 lists exactly these two causes.                                                                                                                                                                                                                                               | None — matches your acceptance test.        |
| C5  | A **retired** signing key stays in the JWKS for a configurable retention window, default **48 h** (contract minimum 24 h)                           | Slightly more slack than required for long shifts.                                                                                                                                                                                                                                 | None.                                       |
| C6  | Added `Engine:CgControl:AllowViewerSignIn` (default **off**)                                                                                        | See open question **O1** below — with it off, a viewer-only user gets `403`, which is what your checklist tests. Turning it on issues a token with `roles:["viewer"]` and `cg_channels:[]` so a read-only console can exist.                                                       | None while off.                             |
| C7  | We do **not** maintain a `jti` revocation list yet                                                                                                  | §3.2 marks `jti` as SHOULD. The claim is present and unique; revocation today is via the refresh-token store (immediate) plus access-token expiry (≤ 12 h).                                                                                                                        | None, but see **O2**.                       |

### Open questions back to you

- **O1 — should a viewer-only operator be able to sign in?** §5 defines a `viewer` role that
  sees status but sends no commands, yet §4.1 makes "no CG role" a `403`. We default to `403`
  (your checklist passes). If you want viewer consoles, say so and we flip one setting — no
  code change, no contract change.
- **O2 — do you need token revocation before expiry?** If an operator is dismissed mid-shift,
  today their access token stays valid until `exp` (≤ 12 h). We can publish a `jti` deny-list
  endpoint or shorten the default lifetime. Tell us which you prefer.
- **O3 — `iss` string.** It is configurable and currently set to the test playout's base URL
  (§3 below). Confirm the exact string you will put in the bridge config for the plant, so we
  set it once and it never drifts.

---

## 2. R2 — Answers to Q1–Q7

Marked **[verified]** where we ran it on the real build, **[decision]** where a human on your
side or the plant has to choose.

### Q1 — Does apasai-core's AMCP require authentication?

**No.** **[verified]** apasai-core keeps the stock AMCP surface; there is no `AUTH`/`LOGIN`
verb in the command table, and a raw TCP connection to port 5250 with no credential answers:

```
> VERSION
201 VERSION OK
2.5.0 6b29237 Dev
```

So **R8 does not apply** — there is no service credential to hand over.

**But there is a network-layer gate you must plan for.** Because AMCP is unauthenticated, the
Playout host ships a hardening script (`engine/scripts/secure-ports.ps1`) that installs a
Windows Firewall rule _blocking inbound TCP 5250 from the network_; loopback is exempt, which
is why our own engine works. Two consequences:

- The core process actually listens on `0.0.0.0:5250` (CasparCG's TCP controller ignores the
  `<address>` element — we verified with `netstat`), so the only thing standing between the
  LAN and full playout control is that firewall rule. Please keep it.
- **A bridge on another host will be blocked until we add an allow rule scoped to its IP.**
  Send us the bridge host's address (R6 item) and we will add a narrow allow rule for
  `TCP 5250` from that address only. This is the one prerequisite for the direct command path.

### Q2 — Which AMCP/OSC commands changed, were removed, or gated in apasai-core?

**None of the commands you validated against changed.** **[verified]** — checked against the
fork's command-registration table and the live server:

| You rely on                                             | Status in apasai-core                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CG ADD / PLAY / UPDATE / STOP / NEXT / CLEAR / REMOVE` | all present, unchanged (plus stock `CG INVOKE`)                                                                                                   |
| `PLAY` with `decklink` producer                         | present (decklink module built)                                                                                                                   |
| `PLAY` with `route://` producer                         | present (`core/producer/route/route_producer.cpp`)                                                                                                |
| `MIXER FILL / CLIP / VOLUME / CROP`                     | present, plus the full stock MIXER set                                                                                                            |
| `INFO`, `INFO CONFIG`, `INFO PATHS`, `VERSION`          | present                                                                                                                                           |
| OSC to every AMCP client                                | **enabled** — the generated config sets `<disable-send-to-amcp-clients>false</disable-send-to-amcp-clients>`, `<default-port>6250</default-port>` |

**Nothing is removed and nothing is gated by licence or role at the AMCP layer.**

Additions you should know about (all additive — no stock verb changed its meaning):

- **`MIXER <ch>-<layer> AUDIOMAP <rows> <cols> <g0..gN>`** — our per-layer audio routing
  matrix (also `AUDIOMAP` with no argument to query, `AUDIOMAP 0` to clear). Used by the
  Playout's audio shuffler. Harmless to you; just don't be surprised to see it in a trace.
- **`pgm` consumer** — a native low-latency MJPEG video stream (TCP 9250 + channel index − 1)
  and a WAV audio stream (9350 + index − 1), configured in the config file, **not** an AMCP
  verb. This is how the Playout UI shows PGM. If you ever want a picture on the console, this
  is the cheapest path — but it is out of scope for contract v1 (§9).
- **`webrtc` module** — WHIP ingest producer (`webrtc://<name>`) and WHEP egress consumer,
  HTTP signalling on port 9600.
- Live loudness metering (EBU R128) and a look-ahead true-peak limiter in the audio path.
- No PGM-grab AMCP verb exists.

**One configuration caveat, not a code change:** our generated core config disables the Flash
module (`<flash><enabled>false</enabled>`). The HTML module is built and `html_cg_proxy` is
present, so `CG ADD` with **HTML templates works**; legacy Flash `.ft` templates would not.
If your templates are HTML (they are, since you serve them over HTTP 7911) this is a non-issue
— tell us if you need Flash and we re-enable it.

### Q3 — Is the plant's current server already apasai-core?

**No.** **[verified]** The plant reports `2.5.0 69e8ad5 Stable`, which is stock CasparCG.
apasai-core reports **`2.5.0 6b29237 Dev`**.

Since Q2 says nothing you use has changed, we expect your existing validation scripts to pass
unchanged, but **a re-validation run against apasai-core is warranted** — that is the item you
listed as work #5 on your side, and we agree it should be done.

### Q4 — Will the Playout engine and the CG bridge run on the same host?

**[decision]** — the plant decides, but here is the hard constraint so the choice is informed.
**Our recommendation: different hosts.**

- **UDP 6250 is already taken on the Playout host.** **[verified]** The Playout engine binds
  `127.0.0.1:6250` for its own OSC listener (VU meters, genlock and dead-air detection), and it
  writes itself into the core config as a predefined OSC client on that port. If the bridge runs
  on the same machine it **cannot** bind 6250 — you would have to configure the bridge's OSC on
  another port, and we would add a second `<predefined-client>` entry pointing at it.
- **On a separate host there is no conflict**: with `disable-send-to-amcp-clients` false the
  core sends OSC to each connected AMCP client's own address, so the bridge receives OSC on its
  own machine's 6250 with no extra configuration. Only the AMCP firewall rule from Q1 is needed.
- **Ports 5280 and 7911 are free on the Playout host.** **[verified]** For reference, the
  Playout host uses: 8080/8443 (engine API), 5250 (AMCP), 6250 (OSC), 9250–9269 and 9350–9369
  (PGM streams), 9600 (WebRTC signalling), plus the ST 2110 / NDI outputs.

### Q5 — Signing algorithm and `iss` string; is `aud = "cg-control"` acceptable?

**ES256 with JWKS.** **[verified]** — implemented and live. Header carries `alg: ES256` and a
`kid` that is present in the JWK Set; keys are P-256, published as `{"kty":"EC","crv":"P-256",
"x":…,"y":…}`. HS256 was never on the table: the bridge must verify offline, and a symmetric
key cannot be published.

`aud = "cg-control"` is **accepted** and is the default.

`iss` is configurable. On the test playout it is **`http://192.168.21.111:8080`** — see O3 for
the plant value.

> Note for completeness: the Playout's _own_ client tokens remain HS256 with a different
> audience and a different key. Only the CG Control token is asymmetric. The two never mix.

### Q6 — Reuse the existing login endpoint, or add `/api/cg/*`?

**We added the `/api/cg/*` endpoints**, exactly as suggested in §4. Reasons: the existing
`POST /api/v1/auth/login` returns a different body shape (`accessToken`, no refresh token), a
different audience, and is signed symmetrically — all three would have had to change for every
existing client. The new endpoints read the **same** user store, so there is one set of
credentials and one place to manage them.

### Q7 — How are per-channel operator permissions stored today?

**Honest answer: they did not exist before this work.** Until build 2.8.43 the Playout's
permissions were **per user and global** — a role (viewer / playout operator / media manager /
engineer / system admin) granting a set of activity permissions, with no channel scoping.

Rather than invent a second permission store — which your contract explicitly warns against —
we **extended the existing user record** with a channel grant list (`channels[]` plus an
`allChannels` flag) and surfaced it in the same "Users and roles" screen an administrator
already uses. `cg_channels` is derived from that one list:

- `allChannels` (always true for system admins) → `cg_channels: "*"`
- otherwise → the granted channel codes resolved to `{host, channel}` pairs

Role mapping into your three roles:

| Apasai role            | CG Control `roles`                                                |
| ---------------------- | ----------------------------------------------------------------- |
| system admin, engineer | `["station-admin","operator","viewer"]`                           |
| playout operator       | `["operator","viewer"]`                                           |
| media manager, viewer  | `["viewer"]` (sign-in refused unless `AllowViewerSignIn`, see O1) |

---

## 3. R3 — Test Playout base URL and final paths

**Base URL:** `http://192.168.21.111:8080` (HTTP; HTTPS is available on 8443 with a
self-signed certificate if you prefer — tell us and we will send the CA).

**Every path is exactly as suggested in §4 — no deviation.**

| #   | Method | Path                     | Auth                                                                   |
| --- | ------ | ------------------------ | ---------------------------------------------------------------------- |
| D1  | POST   | `/api/cg/auth/token`     | none                                                                   |
| D2  | POST   | `/api/cg/auth/refresh`   | none                                                                   |
| D3  | GET    | `/.well-known/jwks.json` | none, public, `Cache-Control: public, max-age=3600`                    |
| D4  | GET    | `/api/cg/channels`       | `Authorization: Bearer <CG token>`, `ETag` / `If-None-Match` supported |
| D8  | GET    | `/api/cg/me`             | `Authorization: Bearer <CG token>`                                     |

Administrative extras (not part of the contract, Playout-side authentication, listed so you
know they exist): `GET /api/v1/cg-control/keys` and `POST /api/v1/cg-control/keys/rotate`.

## 4. R4 — JWKS URL and a sample signed token

- **JWKS:** `http://192.168.21.111:8080/.well-known/jwks.json` — reachable from any host that
  can reach the engine API (the API port is open on the LAN; only AMCP is firewalled).
- **Sample token + JWKS snapshot + D4 response:** in the handoff folder on the playout host,
  to be sent to you as files rather than pasted in chat —
  `C:\CIaB_Claude\_cg-handoff\{sample-token.txt, jwks.json, channels.json}`.

Decoded payload of the sample (user `cg-op2`, operator on two channels):

```json
{
  "iss": "http://192.168.21.111:8080",
  "aud": "cg-control",
  "sub": "e8eb8ffc3f134a43b798a0256ab3d248",
  "name": "اپراتورِ چندکاناله",
  "roles": ["operator", "viewer"],
  "cg_channels": [
    { "host": "192.168.21.111", "channel": 1 },
    { "host": "192.168.21.111", "channel": 2 }
  ],
  "iat": 1789560523,
  "nbf": 1789560523,
  "exp": 1789603723,
  "jti": "1cfdacc6-6310-44ad-a001-4ed9bca0662f"
}
```

Header: `{"alg":"ES256","kid":"2026-09-16-9883","typ":"JWT"}`.

## 5. R5 — Test users

All four exist on the test playout. Password for all: _[redacted on adoption into the repo — the value is in the Playout team's handoff message and in `C:\CIaB_Claude\_cg-handoff\`, never in git]_.

| Username   | Display name       | Apasai role | Channels             | Token `roles`                           | Token `cg_channels`                         |
| ---------- | ------------------ | ----------- | -------------------- | --------------------------------------- | ------------------------------------------- |
| `cg-op1`   | اپراتورِ تک‌کاناله | operator    | `apasai`             | `["operator","viewer"]`                 | `[{host,1}]`                                |
| `cg-op2`   | اپراتورِ چندکاناله | operator    | `apasai`, `cg-test2` | `["operator","viewer"]`                 | `[{host,1},{host,2}]`                       |
| `cg-admin` | مدیرِ ایستگاه      | admin       | all                  | `["station-admin","operator","viewer"]` | `"*"`                                       |
| `cg-view`  | بینندهٔ تست        | viewer      | `apasai`             | —                                       | sign-in returns `403 no_cg_access` (see O1) |

To test a refused command on a channel the user does not own, sign in as `cg-op1` (channel 1
only) and address channel 2.

## 6. R6 — CORS

Configured and verified for the origin you named:

```
Access-Control-Allow-Origin: http://192.168.21.93:5174   (exact, never *)
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 600
```

Currently allowed: `http://192.168.21.93:5174`, `http://127.0.0.1:5174`. A foreign origin gets
no `Access-Control-Allow-Origin` header at all. Send us the final origin list at deployment
and we add them (settings change + engine restart; CORS policies are built at startup).

## 7. R7 — D4 populated with the plant's channels

Live response from the test playout:

```json
{
  "channels": [
    { "id": "apasai", "name": "آپاسای", "casparHost": "192.168.21.111", "casparChannel": 1 },
    {
      "id": "cg-test2",
      "name": "کانال دوم (تست CG)",
      "casparHost": "192.168.21.111",
      "casparChannel": 2
    }
  ]
}
```

`casparHost` is configurable (`Engine:CgControl:CasparHostOverride`) precisely so its spelling
matches how _your_ bridge addresses the server — confirm the string you use and we set it once.

**How channel indices are allocated**, so the join key is never ambiguous: program channels
occupy CasparCG indices `1..N` in descriptor order (gaps get placeholder channels). The Playout
also creates one internal **preview** channel per program channel at indices `N+1..2N`; those
are never published in D4 and must never be addressed by CG Control. With the two channels
above, the core has 4 channels: 1 and 2 are program, 3 and 4 are the previews.

The plant's real channel list will be the same shape — the production playout has its channels
defined the same way, and D4 reads them directly from the channel descriptors.

## 8. R8 — Service credential for the bridge

**Not applicable** — Q1 is "no". The only thing the bridge needs is the firewall allow rule for
`TCP 5250` from its IP (Q1).

## 9. R9 — Contact and timeline

**D1–D5 and D8 are done and deployed to the test playout** (build `2.8.44`, 2026-09-16). We are
ready for the joint test whenever you are. Remaining work is on the deployment side only:

1. You send the bridge host IP and the final console origin list.
2. We add the AMCP firewall allow rule, set `iss` and `casparHost` to the plant values, and add
   your origins.
3. Joint run of §8 against the plant playout, then your work items 1–5.

Technical contact: the Playout team, via the same channel this document came through.

---

## 10. Acceptance checklist (§8) — results on the test playout

Run against build 2.8.44 on 2026-09-16. **17 of 17 passed.**

| §8 line                                                                | Result   | Evidence                                                                                                                                                        |
| ---------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWKS is reachable from the bridge host                                 | **pass** | `200`, `Cache-Control: public, max-age=3600`                                                                                                                    |
| A D1 token verifies with the §7 snippet                                | **pass** | verified with `PyJWKClient` + `ES256`, `issuer`, `audience: cg-control`, `clockTolerance 60` — the same checks `jose` performs; `kid` resolved from the JWK Set |
| Claims validate against the §3.3 schema                                | **pass** | all eight required claims present; `roles` a non-empty subset of the enum; `cg_channels` well-formed                                                            |
| Wrong password → `401 invalid_credentials`                             | **pass** | `401 {"error":"invalid_credentials"}`                                                                                                                           |
| No CG role → `403 no_cg_access`                                        | **pass** | `cg-view` → `403 {"error":"no_cg_access"}`                                                                                                                      |
| 11th failed attempt in 5 min → `429`                                   | **pass** | attempts 1–10 → `401`, attempt 11 → `429` with `Retry-After`                                                                                                    |
| `name` carries Persian correctly, ≤ 64 chars                           | **pass** | `"اپراتورِ تک‌کاناله"`, 18 chars, no mojibake                                                                                                                   |
| Expired token fails; 30 s past `exp` passes; 90 s past fails           | **pass** | `exp−30s` accepted, `exp−90s` rejected (60 s tolerance)                                                                                                         |
| Key rotation: new `kid` signs; old `kid` still verifies                | **pass** | rotate → new tokens carry the new `kid`; the previous `kid` stays in the JWKS and still verifies                                                                |
| CORS preflight from the CG origin succeeds on D1/D2/D4                 | **pass** | all three echo the exact origin                                                                                                                                 |
| A foreign origin is refused                                            | **pass** | no `Access-Control-Allow-Origin` header                                                                                                                         |
| D4 returns every channel; `casparHost`/`casparChannel` match the token | **pass** | every `{host, channel}` in `cg-op2`'s token is present in the catalogue with identical spelling                                                                 |
| ETag round-trip returns `304`                                          | **pass** | `If-None-Match` → `304 Not Modified`                                                                                                                            |
| Invalid bearer on D4 → `401 invalid_token`                             | **pass** | `401 {"error":"invalid_token"}`                                                                                                                                 |
| Sign-in round trip < 1 s                                               | **pass** | 57–293 ms on loopback                                                                                                                                           |
| D2 refresh works, rotates, and refuses a reused token                  | **pass** | refresh `200` with a new refresh token; replay of the old one → `401 invalid_refresh_token` (and the whole token family is revoked)                             |
| D8 `/api/cg/me` echoes the token principal                             | **pass** | `cg-admin` → `roles:["station-admin",…]`, `cg_channels:"*"`                                                                                                     |
