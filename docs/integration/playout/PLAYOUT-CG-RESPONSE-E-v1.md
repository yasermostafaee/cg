# Apasai Playout → CG Control — Response E: item 1 is done, you may connect

**From:** Apasai Playout team · **Date:** 2026-09-21 · **Playout build:** `2.8.48`
**Re:** `CG-CONTROL-REPLY-D-2026-09-21_1.md` §3, following our Response D

> **خلاصهٔ فارسی —** موردِ ۱ تمام شد و این همان تأییدِ کتبی است. قانونِ اجازه برای
> ۱۹۲.۱۶۸.۲۱.۹۳ روی درگاهِ ۵۲۵۰ برقرار است، قانونِ منع دیگر نشانیِ شما را پوشش نمی‌دهد،
> قانونِ فراگیرِ قدیمی برداشته شده، و — برخلافِ دفعهٔ قبل — فایروالِ نمایهٔ حاکم هم روشن
> است، پس این‌بار قانون‌ها واقعاً اجرا می‌شوند. می‌توانید UDP 6250 را باز کنید و تستِ
> مشترک را شروع کنید. موتور روی ۲.۸.۴۸ است؛ همین شماره را در سندِ اعتبارسنجی بنویسید.

---

## 1. Written confirmation

**`secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` is applied** — through the engine's own
reconciler rather than a one-shot script run, so it is re-checked every 60 seconds and survives
restarts. **TCP 5250 on 192.168.21.111 now accepts 192.168.21.93 and nothing else on the
network.** You may proceed with your item 2 and the joint test.

## 2. The listing, with the profile state next to it

```
Rule                                       Enabled     Dir Action Proto LocalPort           Remote
----                                       -------     --- ------ ----- ---------           ------
Apasai - Allow AMCP from trusted hosts        True Inbound  Allow TCP   5250                192.168.21.93
Apasai - Block untrusted playout-core AMCP    True Inbound  Block TCP   5250                0.0.0.1-126.255.255.255 |
                                                                                            128.0.0.0-192.168.21.92 |
                                                                                            192.168.21.94-255.255.255.254 |
                                                                                            ::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
Apasai - Allow engine API                     True Inbound  Allow TCP   8080,8443           Any
Apasai - Allow engine PGM streams             True Inbound  Allow TCP   9250-9269,9350-9369 Any

Profile   Enabled  DefaultInboundAction        InterfaceAlias          NetworkCategory
Domain       True         NotConfigured        Ethernet 5              Public
Private      True         NotConfigured        Kerio Virtual Network   Public
Public       True         NotConfigured        singbox_tun             Public
```

Reading it against the two things you asked for in your Reply D §3:

- **`Apasai - Allow AMCP from trusted hosts`** — present, enabled, remote `192.168.21.93`. ✔
- **The remote scope of the block rule** — this is the part that changed. The old
  `Apasai - Block external playout-core AMCP` with remote `Any` **no longer exists**; it has been
  replaced by `Apasai - Block untrusted playout-core AMCP`, whose scope is the whole address
  space **minus** `127.0.0.0/8`, `::1`, and **exactly `192.168.21.93`**. Note the two boundaries:
  `…-192.168.21.92` and `192.168.21.94-…`. Your address falls in the gap between them, so no
  block rule matches your traffic at all, and the allow rule is what decides. ✔

That is the answer to the point you raised: we did not try to out-rank the block, we removed
your address from it.

- **Profiles are all enabled**, and every connected interface is governed by one of them. This is
  what was false when we sent Response C, and what your `9999` RST correctly detected.

## 3. How we know it is actually enforced, not merely configured

The engine verifies this itself now, and it is the check we did not have before. It reads the
rules back after writing them, maps the listener's interface to its profile, and only reports
success when both the rule and the profile hold. The transition is in the log:

```
17:18:38  Error    the rule is written correctly but the Public profile's firewall is off
                   — port 5250 is open to the whole network
17:19:55  Warning  playout control port (5250) is open to 192.168.21.93; the rest of the
                   network is blocked
```

The first message is the honest state we reported to you in Response D. The second is the first
reconcile after the profile was switched on. Nothing between those two lines touched a rule —
only enforcement changed.

## 4. Air was not disturbed

Checked after every step: all four CasparCG channels still `PLAYING`, the engine answers on
loopback and on `192.168.21.111:8080`, and the engine's own control connection to the core is
unaffected (loopback is exempt from filtering, and we additionally keep loopback out of the
block scope so that remains true even if that exemption ever changed).

## 5. Build

The test playout is on **2.8.48**, for the reason given in Response D §4: the 2.8.45 pin was
self-blocking — that build recreates the blanket block on every start and would have undone
this within minutes. Please name **2.8.48** in `docs/recon/<date>-apasai-core-validation.md`.
The AMCP surface you are validating is untouched, and contract v1 + Addendum A (C1–C8) +
v1.1/D9 are unchanged.

## 6. Over to you

1. Open inbound UDP 6250 from 192.168.21.111 on 192.168.21.93 (your item 2).
2. Tell us before you connect, as agreed.
3. `VERSION` against `192.168.21.111:5250` should answer `2.5.0 6b29237 Dev`.
4. Then your recon run and the §8 checklist from the bridge host.

One request in return: when you first connect, tell us what you observe on 5250 from a host
that is **not** 192.168.21.93 — we expect a silent drop now rather than a reset, and an
independent reading of that would close the loop on the whole question your Reply D opened.
