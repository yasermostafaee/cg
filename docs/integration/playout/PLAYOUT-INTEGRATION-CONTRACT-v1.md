# CG Control ↔ Apasai Playout — Integration Contract v1 (draft, 2026-09-15)

**Audience:** the Playout team and the AI assistants they build with (Claude Code, GPT, …).
This is the precise, machine-oriented half of `playout-link-decision.html` (the Persian summary for people).
Companion file: `cg-control-playout-api.openapi.yaml` (OpenAPI 3.1 for the endpoints below).

Requirement words follow RFC 2119: **MUST**, **SHOULD**, **MAY**.

---

## 0. Summary

- **CG Control** = a browser SPA (the operator console) + a local Node service called the **bridge**, which drives
  CasparCG over **AMCP (TCP 5250)** and **OSC (UDP 6250)**. The bridge keeps driving **apasai-core directly**.
  **The Playout is NOT in the command path** — it never proxies AMCP for CG Control.
- The Playout becomes CG Control's **identity provider** and **channel authority**: it signs the operator in, issues a
  **JWT** that carries **per-channel permissions**, and publishes the **channel catalogue**.
- The bridge verifies the JWT **offline** with the Playout's public keys (**JWKS**). A Playout outage never stops a
  signed-in console; only a _new_ sign-in needs the Playout.
- The bridge never sees a password: the **browser** signs in at the Playout and presents the token to the bridge.

## 1. Topology and trust

```
  ┌────────────────────────────┐   (1) sign-in → JWT        ┌───────────────────────────┐
  │  Apasai Playout            │ ─────────────────────────▶ │  CG Control (browser)     │
  │  issuer · channel catalogue│                            │  holds the token          │
  └──────────────┬─────────────┘                            └─────────────┬─────────────┘
                 │ (JWKS · channels — read-only, cached)                  │ (2) token + commands (WebSocket 5280)
                 ▼                                                        ▼
                                                            ┌───────────────────────────┐   (3) AMCP 5250 / OSC 6250
                                                            │  CG bridge (Node)         │ ─────────────────────────▶ apasai-core
                                                            │  verifies JWT · enforces  │            (CasparCG fork)
                                                            │  per-channel permissions  │
                                                            └───────────────────────────┘
```

| Party              | Role                                                                                                     | Trusts                         |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Playout            | **Issuer** of tokens; **authority** for users, roles, channel permissions, channel names                 | its own user store             |
| CG bridge          | **Verifier** (signature, `iss`, `aud`, `exp`) and **enforcer** (per-channel permission on every command) | the Playout's public keys only |
| CG Control browser | **Holder** of the token; signs in at the Playout; presents the token on every (re)connect                | —                              |

The bridge is configured with: `playout.issuer`, `playout.jwksUrl`, `playout.tokenUrl`, `playout.refreshUrl`,
`playout.channelsUrl`, `playout.audience` (default `cg-control`). **Paths in §4 are suggested defaults** — if the
Playout must use other paths, tell us; the bridge config takes full URLs.

## 2. Deliverables the Playout provides

| ID  | Deliverable                                                              | Level                                                    |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| D1  | Sign-in endpoint that issues the JWT of §3 (`POST /api/cg/auth/token`)   | MUST                                                     |
| D2  | Refresh endpoint (`POST /api/cg/auth/refresh`)                           | MUST (or an access-token lifetime ≥ one shift, see §3.4) |
| D3  | Public keys as JWKS (`GET /.well-known/jwks.json`), asymmetric signing   | MUST                                                     |
| D4  | Channel catalogue (`GET /api/cg/channels`)                               | SHOULD                                                   |
| D5  | CORS for the CG Control origin(s) on D1/D2/D4 (and D5 `/me` if provided) | MUST                                                     |
| D6  | Written answers to the questions in §6                                   | MUST                                                     |
| D7  | A test Playout + test users with different channel permissions           | SHOULD                                                   |
| D8  | `GET /api/cg/me` (principal echo)                                        | MAY                                                      |

### 2.1 What to send back to CG Control (the return package)

| ID  | Return item                                                                                            | Form                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| R1  | Acceptance of contract v1, or the list of changes you need (paths, claims, error codes)                | a short note, or a diff of this file                             |
| R2  | Answers to Q1–Q7 (§6)                                                                                  | fill the blanks in §6 and send the file back, or a separate note |
| R3  | Base URL of a **test** Playout + the final path of each endpoint if it differs from §4                 | `https://host:port` + a path table                               |
| R4  | The JWKS URL reachable from the CG bridge host + **one sample signed token** for a test user           | URL + token in a file (not in a public chat)                     |
| R5  | Four test users: operator on one channel · operator on several · `station-admin` with `"*"` · `viewer` | username / password / roles / channels                           |
| R6  | CORS enabled for the CG Control origin(s) we provide (§7)                                              | confirmation + the configured origin list                        |
| R7  | D4 populated with the plant's real channels (`casparHost` + `casparChannel` as the bridge connects)    | endpoint response                                                |
| R8  | If Q1 is "yes": a service credential for the bridge + the handshake description                        | secure file + note                                               |
| R9  | A technical contact and a rough timeline for D1–D5                                                     | —                                                                |

Nothing else is expected: no AMCP work, no rundown work, no PGM feed (§9).

## 3. The JWT

### 3.1 Header

`alg` = `RS256` or `ES256` (MUST — asymmetric; see §6 Q5 if only HS256 is possible) · `kid` = key id present in the JWKS (MUST) · `typ` = `JWT`.

### 3.2 Claims

| Claim         | Type                                                                          | Required | Meaning / rule                                                                                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iss`         | string                                                                        | MUST     | Issuer. Must equal the bridge's configured `playout.issuer` byte-for-byte.                                                                                                                                                          |
| `aud`         | string or string[]                                                            | MUST     | Must equal or contain `cg-control`.                                                                                                                                                                                                 |
| `sub`         | string                                                                        | MUST     | Stable user id (never reused for another person).                                                                                                                                                                                   |
| `name`        | string, 1–64 chars                                                            | MUST     | Display name shown on the console and written to the **audit log** as the actor. UTF-8; Persian is expected. The bridge truncates at 64.                                                                                            |
| `roles`       | string[]                                                                      | MUST     | Non-empty subset of `viewer`, `operator`, `station-admin` (§5).                                                                                                                                                                     |
| `cg_channels` | array of `{ "host": string, "channel": integer ≥ 1 }` **or** the string `"*"` | MUST     | Channels this user may **operate**. `host` = the CasparCG server address **exactly as the bridge connects to it** (e.g. `192.168.21.114`); `channel` = CasparCG channel index. `"*"` = every channel (typical for `station-admin`). |
| `iat`         | integer (epoch s)                                                             | MUST     | Issued at.                                                                                                                                                                                                                          |
| `exp`         | integer (epoch s)                                                             | MUST     | Expiry.                                                                                                                                                                                                                             |
| `nbf`         | integer (epoch s)                                                             | MAY      | Not before.                                                                                                                                                                                                                         |
| `jti`         | string                                                                        | SHOULD   | Token id, for revocation lists on the Playout side.                                                                                                                                                                                 |

Other claims are ignored by the bridge (allowed).

### 3.3 JSON Schema of the claims

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CG Control access-token claims (v1)",
  "type": "object",
  "required": ["iss", "aud", "sub", "name", "roles", "cg_channels", "iat", "exp"],
  "properties": {
    "iss": { "type": "string", "minLength": 1 },
    "aud": {
      "oneOf": [
        { "type": "string", "const": "cg-control" },
        { "type": "array", "items": { "type": "string" }, "contains": { "const": "cg-control" } }
      ]
    },
    "sub": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1, "maxLength": 64 },
    "roles": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": { "enum": ["viewer", "operator", "station-admin"] }
    },
    "cg_channels": {
      "oneOf": [
        { "type": "string", "const": "*" },
        {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["host", "channel"],
            "properties": {
              "host": { "type": "string", "minLength": 1 },
              "channel": { "type": "integer", "minimum": 1 }
            },
            "additionalProperties": false
          }
        }
      ]
    },
    "iat": { "type": "integer" },
    "nbf": { "type": "integer" },
    "exp": { "type": "integer" },
    "jti": { "type": "string" }
  }
}
```

### 3.4 Example payload (decoded)

```json
{
  "iss": "https://playout.example.local",
  "aud": "cg-control",
  "sub": "u-1042",
  "name": "علی رضایی",
  "roles": ["operator"],
  "cg_channels": [
    { "host": "192.168.21.114", "channel": 1 },
    { "host": "192.168.21.114", "channel": 2 }
  ],
  "iat": 1789460000,
  "exp": 1789503200,
  "jti": "5c1c4e7a-…"
}
```

### 3.5 Lifetimes, clocks, keys

- **Access token lifetime:** default **12 h** (one shift), configurable on the Playout. Refresh via D2 returns a new
  access token; the browser refreshes ~10 min before expiry while the page is open.
- **Refresh token:** opaque, SHOULD be rotated on use, lifetime ≥ 30 days, revocable on the Playout.
- **Clock tolerance:** the bridge accepts ±60 s skew on `exp`/`nbf`/`iat`. Hosts SHOULD be NTP-synced.
- **Key rotation:** publish the new key in the JWKS **before** signing with it; keep the previous `kid` in the JWKS for
  **≥ 24 h** after rotation. The bridge caches the JWKS and re-fetches on an unknown `kid` (at most once per 60 s).
- **What the bridge checks, in order:** `kid` known → signature → `iss` equal → `aud` contains `cg-control` →
  `exp`/`nbf` with tolerance → `name` non-empty → `roles` non-empty → `cg_channels` well-formed. Any failure = the
  token is refused; the console shows a sentence naming the reason class (expired / not for this station / invalid).

## 4. Endpoints (suggested paths; shapes are the contract)

All JSON bodies are `application/json; charset=utf-8`. Errors use one shape (§4.6).

### 4.1 `POST /api/cg/auth/token` — sign in, issue the JWT (D1, MUST)

Request:

```json
{ "username": "ali", "password": "••••••" }
```

`200 OK`:

```json
{
  "token_type": "Bearer",
  "access_token": "<JWT per §3>",
  "expires_in": 43200,
  "refresh_token": "<opaque>",
  "principal": {
    "sub": "u-1042",
    "name": "علی رضایی",
    "roles": ["operator"],
    "cg_channels": [{ "host": "192.168.21.114", "channel": 1 }]
  }
}
```

`principal` is a convenience echo for the UI; **the bridge trusts only the JWT**.

Errors: `401 invalid_credentials` · `403 no_cg_access` (valid user, but no CG role / no channels) · `423 account_locked`
(if you lock accounts) · `429 rate_limited`. The endpoint SHOULD rate-limit failed attempts (e.g. 10 / 5 min per IP+user).

### 4.2 `POST /api/cg/auth/refresh` — new access token (D2, MUST)

Request: `{ "refresh_token": "<opaque>" }` → `200` with the same body as 4.1 (a rotated `refresh_token` SHOULD be
returned). Errors: `401 invalid_refresh_token` (expired, revoked, or reused after rotation).

### 4.3 `GET /.well-known/jwks.json` — public keys (D3, MUST)

Standard JWKS (RFC 7517). Public, no auth, `Cache-Control: public, max-age=3600`.

```json
{
  "keys": [
    { "kty": "RSA", "kid": "2026-09-a", "use": "sig", "alg": "RS256", "n": "…", "e": "AQAB" }
  ]
}
```

(For ES256: `"kty": "EC", "crv": "P-256", "x": "…", "y": "…"`.)

### 4.4 `GET /api/cg/channels` — channel catalogue (D4, SHOULD)

Auth: `Authorization: Bearer <JWT>`. Returns **every** channel of the station (permissions come from the token, not
from filtering here). `ETag` / `If-None-Match` SHOULD be supported; the bridge polls at most every 30 s and on demand.

```json
{
  "channels": [
    { "id": "ch-news", "name": "خبر", "casparHost": "192.168.21.114", "casparChannel": 1 },
    { "id": "ch-sport", "name": "ورزش", "casparHost": "192.168.21.114", "casparChannel": 2 }
  ]
}
```

`casparHost` + `casparChannel` MUST use the same spelling as `cg_channels` in the token — that pair is the join key.
Errors: `401 invalid_token`.

### 4.5 `GET /api/cg/me` — principal echo (D8, MAY)

Auth: Bearer. Returns the `principal` object of 4.1 for the presented token.

### 4.6 Error shape

```json
{ "error": "invalid_credentials", "message": "Username or password is wrong." }
```

`error` is a stable snake_case code (the values named above); `message` is free text (Persian welcome), never shown
verbatim on air surfaces — CG Control maps `error` to its own sentence.

### 4.7 CORS (D5, MUST)

The browser calls 4.1 / 4.2 / 4.4 / 4.5 directly, so the Playout MUST answer CORS preflights for the CG Control
origin(s) we provide (§7), with: `Access-Control-Allow-Origin: <origin>` (exact, not `*` when credentials are involved),
`Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`,
`Access-Control-Max-Age: 600`. The JWKS endpoint is fetched by the bridge (server-side) and needs no CORS.

## 5. Roles and how the bridge enforces them

| Role            | May do                                                                                                                                                                                                                                                                                                                                                         | Channel scope |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `viewer`        | See the stack, health, audit, previews. No commands.                                                                                                                                                                                                                                                                                                           | —             |
| `operator`      | Playout commands (load / take / update / stop / out / remove, look switch, plate audio) on rows whose channel is in `cg_channels`. Bulk verbs (`clear all`, `stop all`, `remove all`) require **every** touched channel to be permitted, else refused whole. **PANIC** (silence all live plates) is station-wide by design and needs only the `operator` role. | `cg_channels` |
| `station-admin` | Everything above plus station configuration: CasparCG servers, live-source catalogue, fixed layers, delimiters, channel settings.                                                                                                                                                                                                                              | usually `"*"` |

Enforcement lives in the bridge at one chokepoint every command passes. A refused command sends **nothing** to CasparCG
and is logged with the verified `name`. An **expired** token only blocks _new_ commands: the socket stays open, reads keep
answering, nothing on air changes; a fresh token restores every control immediately.

## 6. Questions the Playout team must answer (D6) — answer inline

- **Q1 — AMCP authentication on apasai-core.** Does apasai-core require any credential on the AMCP connection?
  `[ ] no   [ ] yes → handshake spelling: ______ ; credential type: ______ ; how the bridge obtains a service credential: ______`
- **Q2 — AMCP/OSC surface.** The bridge is validated against stock 2.5.0 for: `CG ADD / PLAY / UPDATE / STOP / NEXT / CLEAR / REMOVE`;
  `PLAY` with `decklink` and `route://` producers; `MIXER FILL / CLIP / VOLUME / CROP`; `INFO`, `INFO CONFIG`, `VERSION`;
  OSC sent to every AMCP client (`<osc>` config, `disable-send-to-amcp-clients` false).
  Which of these are changed, removed, or gated in apasai-core? `______` Any extra verbs we should know about (e.g. PGM grab)? `______`
- **Q3 — Build identity.** Does the plant's current server (`VERSION` → `2.5.0 69e8ad5 Stable`) already run apasai-core?
  `[ ] yes   [ ] no → apasai-core's VERSION string: ______`
- **Q4 — Deployment.** Will the Playout engine and the CG bridge run on the **same host**? `[ ] same  [ ] different`
  If same: UDP 6250 (OSC) must be free for the bridge or a different OSC port must be configured; ports 5280 (bridge WS) and 7911 (template HTTP) must be free.
- **Q5 — Signing.** `[ ] RS256  [ ] ES256  [ ] only HS256 possible (then: how the shared secret is delivered to the bridge host: ______)`.
  Issuer string: `______`. Is `aud = "cg-control"` acceptable? `[ ] yes [ ] no → ______`
- **Q6 — Reuse.** Can your existing login endpoint issue the §3 token with the extra claims, or will you add the `/api/cg/*` endpoints? `______`
- **Q7 — Channel permissions today.** How are per-channel operator permissions stored in the Playout (per user? per group?) so `cg_channels` can be derived? `______`

## 7. What CG Control provides to the Playout

- **Origins** of the CG Control page for CORS — LAN address + port of the machine serving the console, e.g. `http://192.168.21.93:5174` (final list supplied at deployment; `https` if TLS is enabled later).
- **Channel naming** = `{ host, channel }` exactly as the bridge connects (`host` from the bridge's server config).
- **Ports / protocols we use:** bridge WebSocket **5280** (loopback by default, LAN opt-in), template HTTP **7911** (CasparCG fetches template pages from it), AMCP **5250** out, OSC **6250** in.
- **Layer bands on the channel:** **1–49 belong to the Playout**; CG Control uses **50–99** (50–59 beds, 60–79 live plates, 80–99 templates). Never allocate above 49 from the Playout side.
- **Read-only live-source catalogue** (planned, item `C-022`): an HTTP endpoint on the bridge listing the station's named live sources (id / name / format) that the Playout may read into its rundown — the successor of the old shared database table.
- **Verification we will run** (so you can reproduce it): `jose` — `jwtVerify(token, createRemoteJWKSet(new URL(jwksUrl)), { issuer, audience: 'cg-control', clockTolerance: 60 })`.

## 8. Acceptance checklist (how we will verify D1–D5)

- [ ] JWKS is reachable from the bridge host; a token from D1 verifies with the snippet in §7.
- [ ] Wrong password → `401 invalid_credentials`; a user with no CG role → `403 no_cg_access`; 11th failed attempt in 5 min → `429`.
- [ ] `name` carries Persian correctly (UTF-8, no mojibake) and is ≤ 64 chars.
- [ ] An expired token fails verification; a token 30 s past `exp` still passes (tolerance); 90 s past fails.
- [ ] Key rotation: sign with the new `kid`; the old `kid` still verifies for 24 h.
- [ ] CORS preflight from the CG origin succeeds for D1/D2/D4; a foreign origin is refused.
- [ ] D4 returns every station channel with `casparHost`/`casparChannel` matching the bridge's config; ETag round-trip returns `304`.
- [ ] Sign-in round-trip < 1 s on the plant LAN.

## 9. Non-goals in this phase

- The Playout does **not** proxy or issue AMCP commands for CG Control.
- No rundown integration (the Playout owns the programme bed and rundown; CG Control owns graphics).
- No PGM video/thumbnail feed to the console (possible later; separate contract).
- No SSO hand-off from the Playout client to CG Control (possible later: open CG Control with a token in a URL fragment).
- Transport encryption (TLS on the bridge WebSocket) is a separate item on the CG side.

## 10. Change control

This contract is versioned (`v1`). Breaking changes bump the major version and are announced before deployment; the
bridge's capability handshake reports the contract version it implements. Send corrections as a diff against this file.

---

## Appendix A — Suggested prompt for your AI assistant

Give your assistant this file and the OpenAPI file, then this prompt:

```text
You are implementing the Playout side of an integration contract with "CG Control",
a broadcast graphics console that drives CasparCG directly.

Read fully, in this order:
  1. PLAYOUT-INTEGRATION-CONTRACT-v1.md   (the contract — authoritative)
  2. cg-control-playout-api.openapi.yaml  (the same endpoints as OpenAPI 3.1)

Goal: add to the Playout (.NET 8 / ASP.NET Core) the deliverables D1–D5 (D8 optional) exactly as specified:
  - POST /api/cg/auth/token and POST /api/cg/auth/refresh, issuing a JWT whose claims follow §3
    (RS256 or ES256 with kid; aud "cg-control"; name ≤ 64 chars; roles; cg_channels as [{host, channel}] or "*").
  - GET /.well-known/jwks.json publishing the signing keys, with key rotation per §3.5.
  - GET /api/cg/channels returning every channel, casparHost/casparChannel spelled exactly as in cg_channels.
  - CORS for the configured CG Control origins on the auth and channels endpoints (§4.7).
Derive cg_channels from the Playout's EXISTING per-channel operator permissions — do not invent a second permission store.
Do NOT proxy or issue any AMCP/CasparCG command for CG Control; that is out of scope (§9).

Then:
  - Run the acceptance checklist in §8 against your implementation and report each line as pass / fail.
  - Draft answers to Q1–Q7 in §6 for the team to confirm (mark what you could verify vs. what needs a human).
  - List every place you had to deviate from the contract, with the reason, so the contract can be versioned.

Deliver: the code, the test results, the drafted answers, the deviations list, and the base URL + JWKS URL
+ one sample signed token for a test user (the return package in §2.1).
```
