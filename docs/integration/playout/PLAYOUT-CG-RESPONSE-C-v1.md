# Apasai Playout → CG Control — Response C (answer to your Reply B)

**From:** Apasai Playout team · **Date:** 2026-09-16 · **Playout build:** `2.8.45` (pinned)
**Re:** `CG-CONTROL-REPLY-B-2026-09-16.md`

> **خلاصهٔ فارسی —** موردِ ۴ (فایل‌های تازهٔ handoff) انجام شد و شواهدش در بخشِ ۲ آمده؛ هر دو
> نمونه‌توکن پس از ریستِ کلیدها دوباره — و این بار از راهِ نشانیِ شبکه‌ای — اعتبارسنجی شدند.
> موردِ ۱ (قانونِ فایروالِ AMCP) **هنوز اجرا نشده** چون دسترسیِ مدیرِ سیستم می‌خواهد؛ فرمانش
> آماده است و به‌محضِ اجرا همین‌جا تأیید می‌کنیم. موتور روی ۲.۸.۴۵ پین است.

---

## 1. Item 1 — the AMCP allow rule: **not yet applied**

Stated plainly so nobody plans around a thing that has not happened: the rule is **not** in
place yet. It needs an elevated shell on the playout machine, and opening playout control to
another host is a decision for the station, not something to slip in automatically.

Current firewall state on `192.168.21.111`, verified just now:

| Rule                                                           | Direction | Action | Status                      |
| -------------------------------------------------------------- | --------- | ------ | --------------------------- |
| `Apasai - Block external playout-core AMCP` (TCP 5250)         | Inbound   | Block  | enabled                     |
| `Apasai - Allow engine API` (TCP 8080/8443)                    | Inbound   | Allow  | enabled                     |
| `Apasai - Allow engine PGM streams` (TCP 9250–9269, 9350–9369) | Inbound   | Allow  | enabled                     |
| `Apasai - Allow AMCP from trusted hosts`                       | —         | —      | **absent — this is item 1** |

The command is prepared and waiting on an administrator:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\CIaB_Claude\apasai-v2\engine\scripts\secure-ports.ps1" -AllowAmcpFrom 192.168.21.93
```

We will confirm in writing here the moment it is applied, with the rule listing — and only then
should you open UDP 6250 inbound on `192.168.21.93` (your item 2), so the two changes stay
ordered and each one is attributable.

## 2. Item 4 — refreshed handoff files: **done**

In `C:\CIaB_Claude\_cg-handoff\`, with a `MANIFEST.md` describing each file:

| File               | Contents                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample-token.txt` | **two** tokens: (A) `cg-op2` — `roles:["operator","viewer"]`, `cg_channels:[{111,1},{111,2}]`; (B) `cg-view` — `roles:["viewer"]`, `cg_channels:[]` (C8). Header and payload decoded for each. |
| `jwks.json`        | one key, `kid 2026-09-16-ce8a` (after the reset)                                                                                                                                               |
| `channels.json`    | the live D4 response                                                                                                                                                                           |
| `revoked.json`     | the live D9 response — empty; our test entries were cleared                                                                                                                                    |

**Evidence, run after the key reset:**

- live JWKS kid = snapshot kid = `2026-09-16-ce8a`;
- sample A verifies with `ES256` + `issuer` + `audience` + `clockTolerance 60` → `roles`,
  `cg_channels` as above;
- sample B verifies → `roles:["viewer"]`, `cg_channels:[]`.

**And a pre-flight for your item 3**, because it is the part most likely to surprise us both —
every CG route exercised over the **network address** rather than loopback, which is how your
bridge will call them:

| Route via `http://192.168.21.111:8080`                   | Result                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/cg/auth/token` + `GET /.well-known/jwks.json` | token verifies; `iss = http://192.168.21.111:8080`, `kid 2026-09-16-ce8a` |
| `GET /api/cg/channels`                                   | `200`, both channels, `casparHost 192.168.21.111`                         |
| `GET /api/cg/revoked`                                    | `200`, empty list, `ETag` present                                         |
| `GET /api/cg/me`                                         | `200`, `roles:["operator","viewer"]`                                      |

Note the property that matters for you: `iss` is **configured, not derived from the request
Host**, so it stays byte-identical no matter which address the console or the bridge uses to
reach the engine. Nothing in §8 depends on calling us over loopback.

## 3. Everything else in your §3

| #   | Item                                                  | Status                                                                                                                     |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2   | UDP 6250 inbound on the bridge host                   | yours, after our item 1 — agreed on the ordering                                                                           |
| 3   | Re-validation against apasai-core `2.5.0 6b29237 Dev` | yours. Engine stays on **2.8.45** until you have recorded it; we will not deploy over it without telling you first         |
| 5   | Plant `iss` / `casparHost` / console origins          | both, before the plant deployment                                                                                          |
| 6   | Release of the test fixtures                          | yours to call. For the record they are: users `cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch`, and channel `cg-test2` |

## 4. Contract status

- **v1** — accepted by both sides.
- **Addendum A** — C1–**C8** adopted; O1 = viewer sign-in ON; O3 = `iss` rule.
- **v1.1 / D9** — implemented, live, accepted; part of the joint test.
- Paths, claims, error codes, roles for D1–D8: unchanged.

**The joint test is blocked on exactly one thing: item 1.** Everything else on our side is done
and verified.
