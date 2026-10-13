# CG Control → Apasai Playout — Reply B (answer to your Response B, build 2.8.45)

**From:** CG Control · **Date:** 2026-09-16 · **Re:** `PLAYOUT-CG-RESPONSE-B-v1.md`

> **خلاصهٔ فارسی —** هر سه مورد تأیید شد: C8 به Addendum A اضافه می‌شود، D9 به‌عنوان v1.1 پذیرفته و «زنده» ثبت می‌شود، و رشتهٔ `iss` قطعی است. از سمت ما فقط دو کار می‌ماند: باز کردن UDP 6250 روی ماشین بریج (بعد از اجرای قانون فایروال شما) و اجرای اعتبارسنجی روی apasai-core. منتظر تأییدِ اجرای اسکریپت فایروال هستیم؛ فایل‌های تازهٔ handoff را هم بفرستید (JWKS بعد از ریست کلیدها را زنده می‌خوانیم).

## 1. Accepted as written

| Item                                                                                                                                                                       | Our answer                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C8** — a `viewer` token carries `cg_channels: []` unconditionally, even when the account has channel grants                                                              | Accepted and **folded into Addendum A**. It matches the bridge's rule by construction: `viewer` = every read, no command.                                                                                                            |
| **D9** — `GET /api/cg/revoked`, ETag, pruned by `exp`, automatic revocation on disable / delete / refresh-family theft, manual `POST /api/v1/cg-control/revoke/{username}` | Accepted **verbatim as contract v1.1**, live, part of the joint test. The bridge will poll ≤ 1/60 s, refuse **new** commands for a revoked `jti`, keep answering reads, and keep the last list it saw if the Playout is unreachable. |
| The §8 line change — _operator-capable user with an empty channel list → `403 no_cg_access`_ (`cg-noch`)                                                                   | Accepted; our checklist reads the same now.                                                                                                                                                                                          |
| `iss = http://192.168.21.111:8080`, `casparHost = 192.168.21.111`, origins, different hosts, preview channels, HTTPS off, `pgm` out of scope                               | Confirmed, no change.                                                                                                                                                                                                                |
| Engine pinned on **2.8.45** during our re-validation                                                                                                                       | Thank you — we will name that build in the recon record.                                                                                                                                                                             |

## 2. Contract status

- **v1** — accepted by both sides.
- **Addendum A** — C1–**C8** adopted; O1 = viewer sign-in ON; O3 = `iss` rule.
- **v1.1 / D9** — implemented and live on the test Playout; accepted.
- Paths, claims, error codes and roles for D1–D8: unchanged.

## 3. Still open, and who holds it

| #   | Item                                                                                                                                                   | Holder                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | Run `secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` (elevated) and confirm here                                                                        | **Playout** (administrator)                                                                        |
| 2   | Open inbound **UDP 6250** from `192.168.21.111` on the bridge host `192.168.21.93`                                                                     | **CG Control** — done right after item 1 is confirmed                                              |
| 3   | Re-validation of the bridge against apasai-core `2.5.0 6b29237 Dev` on engine 2.8.45; result recorded as `docs/recon/<date>-apasai-core-validation.md` | **CG Control**                                                                                     |
| 4   | Refreshed handoff files (`jwks.json` after the key reset, `channels.json`, `revoked.json`, the two sample tokens) — as files, the token never in chat  | **Playout** → we will read the JWKS live in any case and keep the snapshots only as dated evidence |
| 5   | The plant's `iss` / `casparHost` strings and final console origins, before the plant deployment                                                        | both, later                                                                                        |
| 6   | Release of the test fixtures (`cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch`, channel `cg-test2`)                                                | **CG Control** says when                                                                           |

## 4. Joint test — unchanged plan, now with D9

1. `VERSION` from the bridge host → `2.5.0 6b29237 Dev`; OSC ticks arrive; health `healthy`.
2. Recon scripts re-run and recorded.
3. §8 repeated from the bridge host — now **22 lines**, including: viewer sign-in reads everything and commands nothing; `cg-noch` → 403; a manually revoked `jti` refuses new commands within 60 s while the console keeps showing the stack.
4. Then our work items 1–5.
