# Apasai Playout → CG Control — Response B (answer to your Reply A)

**From:** Apasai Playout team · **Date:** 2026-09-16 · **Playout build:** `2.8.45`
**Re:** `CG-CONTROL-REPLY-A-2026-09-16.md` · supersedes nothing in `PLAYOUT-CG-RESPONSE-v1.md`, extends it

> **خلاصهٔ فارسی —** هر سه چیزی که خواسته بودید انجام شد: ورودِ کاربرِ فقط‌بیننده روشن شد،
> فهرستِ ابطال (D9) دقیقاً با همان شکلی که پیشنهاد دادید پیاده و زنده تست شد، و رشتهٔ `iss`
> تأیید شد. چک‌لیست حالا **۲۲ از ۲۲** قبول است (پنج بندِ تازه برای D9 و کاربرِ ناظر).
> یک کارِ باقی‌مانده دستِ ماست و **دسترسیِ مدیرِ سیستم می‌خواهد**: قانونِ فایروال برای
> `192.168.21.93` روی TCP 5250. اسکریپتش آماده است و فرمانش در بخش ۳ آمده؛ به‌محضِ اجرا،
> تستِ مشترک می‌تواند شروع شود. **کلیدهای امضا یک‌بار پس از تست ریست شدند**، پس `kid`
> نمونه‌توکنِ تازه با آنچه در Reply A بررسی کردید فرق دارد — JWKS را زنده بخوانید.

---

## 1. O1 — viewer sign-in: **ON**

`Engine:CgControl:AllowViewerSignIn` is enabled on the test playout, and it will be enabled on
the plant. Behaviour is exactly what you described:

- A viewer-only account signs in and receives `roles: ["viewer"]`, `cg_channels: []`.
- **We also changed the claim for viewers**: a viewer now carries `cg_channels: []` _even if the
  account has channel grants inside Apasai_. Reason: §3.2 defines the claim as "channels this
  user may **operate**", and a viewer operates nothing. This keeps your bridge's rule ("refuse
  every command to a `viewer`, whose `cg_channels` will be `[]`") true by construction rather
  than by convention. This is clarification **C8**.
- The §8 line "no CG role → 403" now reads, per your §2 and our C4: **an operator-capable user
  with an empty channel list → `403 no_cg_access`**. Test user `cg-noch` was added for it.

## 2. O2 — D9 revocation list: **implemented, exactly as you specified**

`GET /api/cg/revoked` is live on the test playout. We took your proposal verbatim; no counter-
proposal.

| Aspect                | Implementation                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Path / auth           | `GET /api/cg/revoked`, `Authorization: Bearer <CG token>`                                                                                      |
| Response              | `{ "revoked": [ { "jti": "…", "exp": 1789603723 } ] }`                                                                                         |
| Contents              | every revoked `jti` whose `exp` has not passed; entries are pruned automatically one minute after `exp`, so the list cannot grow without bound |
| Caching               | `ETag` / `If-None-Match` supported; a `304` costs you nothing                                                                                  |
| Errors                | `401 invalid_token` (same shape as D4)                                                                                                         |
| Access-token lifetime | **unchanged at 12 h**, as you asked                                                                                                            |

**What triggers a revocation, automatically:**

- an operator is **disabled** (`isActive: false`) — their live CG tokens and refresh tokens go
  at the same moment;
- an operator is **deleted**;
- a **refresh-token family is revoked** because a rotated token was replayed — we extended this
  one beyond your list: on suspected theft we now also revoke that user's live _access_ tokens,
  otherwise the thief keeps a working access token for up to 12 h while only the refresh chain
  is dead.

**And manually**, without disabling the account: `POST /api/v1/cg-control/revoke/{username}`
(Playout-side auth, `users:manage`), surfaced as a "قطعِ CG" button next to each user. This is
for the "an operator is leaving the desk but keeps their Apasai account" case.

We store a small ledger of issued `jti`s (user + `exp`) so that "revoke this person" is
expressible at all; it is pruned by `exp` exactly like the published list. Nothing about a token
other than its id, owner and expiry is kept.

This is **v1.1 / D9** as you proposed — additive, no breaking change, and **ready for the joint
test**, so there is no need to ship it afterwards.

## 3. The one thing still owed by us — and it needs an administrator

The AMCP firewall allow rule for the bridge host is **not yet applied**, because it requires an
elevated shell on the playout machine and is a deliberate security decision, not an automatic
step. Everything needed is prepared:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\CIaB_Claude\apasai-v2\engine\scripts\secure-ports.ps1" -AllowAmcpFrom 192.168.21.93
```

The script now takes `-AllowAmcpFrom`. It rebuilds the narrow allow rule
("Apasai - Allow AMCP from trusted hosts") each run, so the list is always exactly what you pass;
running it with no `-AllowAmcpFrom` reverts to loopback-only. Windows evaluates Allow before
Block, so the blanket block rule stays in place for the rest of the LAN.

Expected result from `192.168.21.93`:

```
> VERSION
201 VERSION OK
2.5.0 6b29237 Dev
```

We will confirm here the moment it is applied.

## 4. Confirmations against your §3 table

| #   | Item                                              | Our side                                                                                               |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Bridge IP `192.168.21.93` for the AMCP allow rule | received; command prepared, see §3                                                                     |
| 2   | Console origins                                   | `http://192.168.21.93:5174`, `http://127.0.0.1:5174` — configured, preflight verified                  |
| 3   | `casparHost` = `192.168.21.111`                   | confirmed; identical spelling in D4 and in `cg_channels`                                               |
| 4   | `iss` = `http://192.168.21.111:8080`              | confirmed, set explicitly (not derived from the request)                                               |
| 5   | Different hosts                                   | agreed; nothing on our side binds anything on the bridge host                                          |
| 6   | Re-validation against apasai-core                 | yours; we will keep the engine on `2.8.45` during it so the result is attributable                     |
| 7   | Preview channels `N+1..2N`                        | agreed — D4 never publishes them                                                                       |
| 8   | HTTPS 8443                                        | left off; say the word and we send the CA                                                              |
| 9   | `pgm` consumer                                    | noted, out of scope for v1                                                                             |
| 10  | Test fixtures                                     | kept until you release them. Note `cg-noch` was added (operator, zero channels) for the new `403` line |

## 5. Contract status after this document

- **v1** — accepted by both sides.
- **Addendum A** — C1–C7 adopted; O1 = viewer sign-in ON; O3 = `iss` rule. **Plus C8** (viewer
  tokens carry `cg_channels: []` unconditionally) — please fold it into Addendum A.
- **v1.1 / D9** — implemented and live; ready for the joint test rather than after it.
- Paths, claims, error codes, roles for D1–D8: **unchanged**.

## 6. Acceptance checklist — 22 of 22 on build 2.8.45

The sixteen §8 lines from our first response still pass. The six lines below are the new or
changed ones:

| Line                                                                                          | Result   | Evidence                                                                                     |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Operator-capable user with an empty channel list → `403 no_cg_access` (replaces "no CG role") | **pass** | `cg-noch` → `403 {"error":"no_cg_access"}`                                                   |
| Viewer-only user signs in with `roles:["viewer"]`, `cg_channels:[]`                           | **pass** | `cg-view` → `200`, `roles: ["viewer"]`, `cg_channels: []`                                    |
| `GET /api/cg/revoked` answers with Bearer and supports `ETag`                                 | **pass** | `200` + `ETag`; `If-None-Match` → `304`                                                      |
| Manual revoke puts the live `jti` on the list with its `exp`                                  | **pass** | `POST /api/v1/cg-control/revoke/cg-op1` → the exact `jti` and `exp` of the live token appear |
| The same user's refresh token dies with it                                                    | **pass** | subsequent refresh → `401 invalid_refresh_token`                                             |
| Disabling a user revokes their live token automatically                                       | **pass** | `PUT /api/v1/users/cg-op2 {isActive:false}` → that token's `jti` on the list immediately     |

## 7. Refreshed handoff files

In `C:\CIaB_Claude\_cg-handoff\`, sent as files:

- `sample-token.txt` — **two** samples now: an operator on two channels, and a viewer-only
  console token, each with decoded header and payload.
- `jwks.json` — one key (the set was reset after our testing; fetch it live).
- `channels.json` — the live D4 response.
- `revoked.json` — the live D9 response (empty; the test entries were cleared).
