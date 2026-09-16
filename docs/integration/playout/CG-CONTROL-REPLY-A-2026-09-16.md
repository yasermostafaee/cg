# CG Control → Apasai Playout — Reply A to your response of 2026-09-16 (contract v1 + Addendum A)

**From:** CG Control · **Date:** 2026-09-16 · **Re:** `PLAYOUT-CG-RESPONSE-v1.md` (Playout build `2.8.44`), `sample-token.txt`, `jwks.json`, `channels.json`

> **خلاصهٔ فارسی —** توکن نمونه را مستقل بررسی کردیم: امضا (ES256، `kid 2026-09-16-9883`) معتبر و همهٔ claimها مطابق قرارداد است. هفت توضیح C1–C7 پذیرفته شد و به‌صورت «Addendum A» به قرارداد اضافه می‌شود؛ نسخهٔ قرارداد شکسته نمی‌شود. جواب O1–O3 در بخش ۲. برای شروع تست مشترک فقط یک چیز از سمت شما لازم است: قانون فایروال AMCP برای IP بریج (بخش ۳).

---

## 1. Verification of your handoff (done on our side, independently)

| Check                                                                                         | Result   |
| --------------------------------------------------------------------------------------------- | -------- |
| `kid` of the sample token present in `jwks.json` (3 keys, all `EC / P-256 / ES256 / sig`)     | pass     |
| Signature verified with the JWK's public point (ES256)                                        | **pass** |
| Required claims `iss aud sub name roles cg_channels iat exp` present; `nbf`, `jti` present    | pass     |
| `aud = "cg-control"`; `iss = "http://192.168.21.111:8080"`                                    | pass     |
| `name` = 18 chars, Persian intact, ≤ 64                                                       | pass     |
| `roles = ["operator","viewer"]` — non-empty, unique, within the enum (cumulative per your C1) | pass     |
| `cg_channels` well-formed; every pair present in `channels.json` with identical spelling      | pass     |
| Lifetime `exp − iat` = 12 h; `nbf = iat`                                                      | pass     |

Contract v1 is confirmed **accepted by both sides**. Your 17/17 acceptance run is noted; we will repeat §8 from the bridge host during the joint test.

## 2. Clarifications C1–C7 and open questions O1–O3

**C1–C7 are all accepted** and become **Addendum A** to contract v1 (text clarifications, no wire change, no version bump):

- **C1 (cumulative roles)** — accepted. The bridge will nevertheless evaluate roles **hierarchically** (`station-admin ⊇ operator ⊇ viewer`), so it works with a cumulative _or_ a single-role issuer; `roles[0]` is the display role.
- **C2, C3, C4, C5, C7** — accepted as written. For C7 see O2.
- **C6 (`AllowViewerSignIn`)** — accepted; see O1 for the setting we want.

**O1 — viewer-only sign-in: YES, please turn `Engine:CgControl:AllowViewerSignIn` ON** for the test playout and the plant.
A read-only console (a producer or the MCR wall watching the stack) is part of our design: the bridge answers every _read_ route to any signed-in principal and refuses every command to a `viewer`, whose `cg_channels` will be `[]`. Consequence for §8: the "no CG role → 403" line becomes "an operator-capable user with an **empty channel list** → `403 no_cg_access`" (your C4), and `cg-view` now signs in with `roles:["viewer"]`.

**O2 — revocation before expiry: keep the 12 h lifetime, and add a revocation list (additive, v1.1).**
Shortening the access token would make every console depend on the Playout being up at refresh time, which is exactly the coupling this design avoids. Instead we propose **D9** (SHOULD, additive — no breaking change):

- `GET /api/cg/revoked` — `Authorization: Bearer`, `ETag`/`If-None-Match` supported.
- Response: `{ "revoked": [ { "jti": "…", "exp": 1789603723 } ] }` — every revoked `jti` whose `exp` has not passed (entries expire out of the list by themselves, so it never grows).
- The bridge polls at most every 60 s and refuses **new commands** carrying a revoked `jti`; reads keep answering; nothing on air changes. If the Playout is unreachable the bridge keeps the **last list it saw** — a Playout outage never changes a verdict.
- Revoking should happen automatically when an operator is disabled/deleted or their refresh-token family is revoked.

Not a blocker for the joint test; tell us if you would rather ship it after.

**O3 — `iss`:** the exact base URL of the engine API **as the console browser reaches it**, no trailing slash. Test: `http://192.168.21.111:8080` (already correct). For the plant, send us the string once; we copy it verbatim into the bridge config (`playout.issuer`) and never derive it.

## 3. What we owe you, and what we need before the joint test

| #   | Item                                                                          | Value / status                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Bridge host IP** for the `TCP 5250` firewall allow rule (Q1)                | `192.168.21.93` (the console/bridge box for the test) — **the one prerequisite for the direct command path**                                                                             |
| 2   | Console origins for CORS                                                      | `http://192.168.21.93:5174`, `http://127.0.0.1:5174` — already configured, correct                                                                                                       |
| 3   | `casparHost` spelling (D4 and `cg_channels`)                                  | `192.168.21.111` — the bridge's `servers.A.host` will be set to the same string                                                                                                          |
| 4   | `iss` for the test                                                            | `http://192.168.21.111:8080` — confirmed                                                                                                                                                 |
| 5   | Deployment shape (Q4)                                                         | **Different hosts, as you recommend.** Bridge on `192.168.21.93`; OSC is received on the bridge host's own UDP 6250 (we will open it inbound on that host's Windows Firewall — our side) |
| 6   | Re-validation of the bridge against apasai-core (Q3)                          | Owed by us: the same recon scripts, against `192.168.21.111:5250`, after item 1 is in place. Only HTML templates are used (Flash off is fine)                                            |
| 7   | Preview channels `N+1..2N`                                                    | Acknowledged: CG Control addresses only channels published by D4 (or declared in its own config) and never enumerates the server's channels                                              |
| 8   | HTTPS on 8443                                                                 | Not now — the console is served over `http`, so a mixed-content switch would need both sides at once. Revisit with TLS on the bridge                                                     |
| 9   | `pgm` consumer (MJPEG 9250+, WAV 9350+)                                       | Noted as the cheapest future path for a console PGM picture; out of scope for v1, as agreed                                                                                              |
| 10  | Test fixtures (`cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, channel `cg-test2`) | Understood they are temporary. Keep them until we say the plant deployment is done; we will send one line to release them                                                                |

## 4. Joint test plan (after the allow rule)

1. Bridge on `192.168.21.93` → `VERSION` against `192.168.21.111:5250` answers `2.5.0 6b29237 Dev`; OSC ticks arrive on the bridge host (`healthy`, not `degraded`).
2. Re-run our recon scripts (item 6) and record the result as `docs/recon/<date>-apasai-core-validation.md`.
3. §8 checklist repeated from the bridge host (JWKS fetch, sign-in as the four users, CORS from the console origin).
4. Then our work items 1–5 (bridge auth → per-channel authorisation → sign-in surface → channel catalogue → validation record).

## 5. Contract status

- **v1 — accepted by both sides (2026-09-15 / 2026-09-16).**
- **Addendum A** (this document, §2): C1–C7 adopted; O1 = viewer sign-in ON; O3 = `iss` rule.
- **v1.1 proposal** (additive): D9 revocation list — pending your answer.
- Paths, claims, error codes, roles: **unchanged**.
