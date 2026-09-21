# CG Control → Apasai Playout — Reply C (answer to your Response C)

**From:** CG Control · **Date:** 2026-09-16 · **Re:** `PLAYOUT-CG-RESPONSE-C-v1.md`

> **خلاصهٔ فارسی —** Response C وارد مخزن ما شد (`82a06c57`). برای موردِ ۱ منتظر تأییدِ **کتبی** شما با فهرستِ قانونِ فایروال هستیم، همان‌طور که خودتان پیشنهاد کردید؛ یک نکته دربارهٔ تقدمِ قانونِ Block بر Allow در فایروالِ ویندوز را هم گفته‌ایم تا دورِ دوم لازم نشود. قوانینِ ورودیِ سمتِ ما آماده است و فقط روی میزبانِ خودمان اثر دارد. پیش از اتصال خبر می‌دهیم و دقیقاً گفته‌ایم bridge در لحظهٔ اتصال چه می‌فرستد.

---

## 1. Item 1 — waiting for your written confirmation, as you proposed

Response C §1 is adopted into our repository as it stands (`docs/integration/playout/`, commit `82a06c57`): the rule was not applied at that time, and we plan around nothing else.

When your administrator has run `secure-ports.ps1 -AllowAmcpFrom 192.168.21.93`, please send the confirmation with the rule listing — `DisplayName`, `Enabled`, `Profile`, `Direction`, `Action` and the remote address scope of **both** `Apasai - Allow AMCP from trusted hosts` and `Apasai - Block external playout-core AMCP`, plus the time it was applied. We adopt that file verbatim, and only then does our bridge connect.

One thing worth checking in that listing before you send it, so we do not need a second round: Windows Defender Firewall evaluates an explicit **Block** rule ahead of any **Allow** rule — an Allow for `192.168.21.93` does not override a Block on TCP 5250 whose remote scope still includes that address. The listing should show the Block rule's scope excluding `192.168.21.93`, or the script replacing it. If your script already handles this, the listing will simply show it.

## 2. Item 2 — our inbound rules are in place

We created them early — they act only on our host and are scoped to your engine host as the remote address, so nothing on your side changes because of them:

| Rule on `192.168.21.93`  | Protocol / port | Remote address   | Purpose                                             |
| ------------------------ | --------------- | ---------------- | --------------------------------------------------- |
| `CG bridge OSC in`       | UDP 6250        | `192.168.21.111` | your engine's OSC to our bridge                     |
| `CG bridge templates in` | TCP 7911        | `192.168.21.111` | your CEF fetching our templates                     |
| `CG probe fixtures in`   | TCP 7900–7901   | `192.168.21.111` | the recon probes' fixture servers, for the run only |

## 3. What the run does on your box, stated before it happens

We tell you the moment we connect. Then, exactly:

- Unprompted on connect, the bridge reads `INFO CONFIG` and sets `MIXER VOLUME 1` on **channel 2, layers 50–59 and 80–99** (its own layer bank). Nothing else is sent without an operator action.
- The July recon probes, re-aimed at **channel 2, layer 80**, briefly play an HTML fixture there and clear **that layer** (`CLEAR 2-80`). One template is then taken and released on channel 2 through the real path.
- `VERSION`, `INFO`, `INFO CONFIG`, `INFO 2`, and one read-only `MIXER 2-80 AUDIOMAP` query. Channel 1 receives `INFO` only. No channel-wide `CLEAR`. Your preview channels (indices 3–4) are never addressed. The plant `192.168.21.114` is never touched.
- The bridge listens for OSC on UDP 6250 at `192.168.21.93` and serves templates on TCP 7911. Whether your engine sends OSC to a non-loopback AMCP client is the one thing this run measures rather than assumes; both answers go into the record.

## 4. One reading, for your awareness — not a request

On 2026-09-16 a socket bound to `192.168.21.93` timed out connecting to `192.168.21.111:8080`, although your table lists 8080 as allowed. Our own VPN tunnel was up at the time and can explain it; we will re-test with the tunnel down before asking you anything about it.

## 5. Status

- Contract: v1 + Addendum A (C1–C8) + v1.1/D9 — unchanged.
- Engine build 2.8.45 pinned until we record the run — understood, and we will not ask you to hold it longer than the run takes.
- Test fixtures (`cg-op1`, `cg-op2`, `cg-admin`, `cg-view`, `cg-noch`, `cg-test2`): we will tell you when to release them, after the plant deployment.
