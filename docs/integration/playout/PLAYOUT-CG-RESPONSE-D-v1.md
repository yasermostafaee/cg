# Apasai Playout → CG Control — Response D (answer to your Reply D)

**From:** Apasai Playout team · **Date:** 2026-09-21
**Re:** `CG-CONTROL-REPLY-D-2026-09-21_1.md`

> **خلاصهٔ فارسی —** شما در هر دو موردی که مطرح کردید درست می‌گفتید و ما غلط. اول: در
> فایروالِ ویندوز قانونِ منع بر اجازه مقدم است، پس قانونی که برای میزبانِ شما اضافه کرده
> بودیم از روزِ اول مرده بود. دوم: مشاهدهٔ RST روی درگاهِ ۹۹۹۹ درست تفسیر شده بود — جدولِ
> پاسخِ C وضعِ واقعیِ میزبان را توصیف نمی‌کرد. علتِ واقعی از چیزی که حدس زده بودید بدتر
> است: فایروالِ نمایه‌ای که کارتِ شبکهٔ ۱۹۲.۱۶۸.۲۱.۱۱۱ روی آن است **خاموش** است، پس هیچ‌کدام
> از قانون‌های ما اجرا نمی‌شود و درگاهِ ۵۲۵۰ همین حالا روی کلِ شبکه باز است. **لطفاً همچنان
> به ۵۲۵۰ وصل نشوید** تا بنویسیم که سیاست واقعاً برقرار شده. مدلِ درست پیاده و آزموده شده
> (نسخهٔ ۲.۸.۴۷)؛ اعمالش دو تصمیمِ ایستگاه لازم دارد که در بخشِ ۴ آمده.

---

## 1. You were right about rule precedence. We were wrong.

Your Reply D §3 states that Windows Defender Firewall evaluates an explicit Block ahead of any
Allow, so an allow rule for your host does not take effect while a block on TCP 5250 still
covers that address. **That is correct.** We verified it against Microsoft's documentation
rather than taking either side's word for it:

> "Explicit block rules take precedence over any conflicting allow rules."
> — _Windows Firewall rules_, "Rule precedence for inbound and outbound rules"

> "Because these rules are evaluated before allow rules, they take precedence. Network traffic
> that matches both an active block and an active allow rule is blocked."
> — _Order of Windows Firewall with Advanced Security Rules Evaluation_

The documented order is: Windows Service Hardening → connection security rules → **authenticated
bypass** → **block** → **allow** → default. The only construct that lets an allow beat a block is
the authenticated-bypass rule, and per `New-NetFirewallRule -OverrideBlockRules` that requires
the traffic to be authenticated by a separate IPsec rule with `RemoteUser` accounts listed. Our
rule was an ordinary allow rule. It was dead on arrival.

Concretely: the `Apasai - Allow AMCP from trusted hosts` rule we described in Response C **would
never have let you in**, even once applied. Had we shipped it and reported success, you would
have connected, failed, and spent the day looking for the fault on your side. We are glad you
challenged it before that happened.

We have corrected this in two places that carried the wrong claim in writing: the engine's
firewall service and `engine/scripts/secure-ports.ps1`.

## 2. Your `9999` observation was right too — and the cause is worse than a stale table

You wrote that `9999` being reset rather than dropped "suggests the current inbound state on
192.168.21.111 is not the state that table describes." Correct, and thank you for flagging it
rather than letting it pass.

Here is the state, measured on the host:

| Profile | Firewall enabled | Governs                                              |
| ------- | ---------------- | ---------------------------------------------------- |
| Domain  | **True**         | nothing on this host                                 |
| Private | **False**        | —                                                    |
| Public  | **False**        | `Ethernet` (192.168.21.111), and two tunnel adapters |

All three connected interfaces — including the one carrying 192.168.21.111 — are categorised
**Public**, and the Public profile's firewall is **off**. So:

- None of the `Apasai - *` rules are being enforced on that interface. They exist; they do
  nothing.
- **TCP 5250 is currently reachable from the whole LAN**, with the playout core listening on
  `0.0.0.0:5250`. The only thing that has kept it untouched is your discipline in not connecting.
- That is exactly why `9999` answers with a RST in 3.7 ms: with no filtering in force, the TCP
  stack answers for itself. Your RST-vs-drop reasoning was sound.

Our Response C §1 listed the `Apasai - *` rules and let that stand for "the inbound state". A
rule listing alone cannot show this; profile state has to be shown next to it. Our verification
command was incomplete, and we have changed what we send.

**Please continue to send nothing to TCP 5250.** Item 1 is not done, and right now the port is
open to anyone — including anyone else on that LAN.

## 3. The current listing you asked for

Run on 192.168.21.111, in the shape you specified, plus the profile state that gives it meaning:

```
Rule                                      Enabled     Dir Action Proto LocalPort           Remote
----                                      -------     --- ------ ----- ---------           ------
Apasai - Block external playout-core AMCP    True Inbound  Block TCP   5250                Any
Apasai - Allow engine API                    True Inbound  Allow TCP   8080,8443           Any
Apasai - Allow engine PGM streams            True Inbound  Allow TCP   9250-9269,9350-9369 Any
apasai-engine  (x8)                          True Inbound  Allow TCP/UDP Any               Any
apasai-core    (x4)                          True Inbound  Allow TCP/UDP Any               Any

Profile   Enabled  DefaultInboundAction
Domain       True         NotConfigured
Private     False         NotConfigured
Public      False         NotConfigured

InterfaceAlias          NetworkCategory
Ethernet                Public
Kerio Virtual Network   Public
singbox_tun             Public
```

Answering your two specific questions:

- **`Apasai - Allow AMCP from trusted hosts`** — **not present**. It was never applied, and per
  §1 it would have been inert anyway.
- **Remote scope of `Apasai - Block external playout-core AMCP`** — **`Any`**. So even with the
  firewall on, it would have covered 192.168.21.93 and beaten any allow rule. Your analysis
  was right in every particular.

Note also the twelve auto-created program rules for `apasai-engine` / `apasai-core` — inbound,
allow, **any port, any remote address**. With the block rule in place they cannot open 5250
(block wins), but they are the reason the blanket block must never simply be deleted.

## 4. What we changed, and the two decisions that remain

### The corrected model (engine build 2.8.47)

Because a block beats an allow, the hole has to be cut in the **block rule's own address scope**,
not layered on top of it. Two twin rules, both always present, only their scopes tracking the
configured list:

| Rule                          | Action | Remote scope                                         |
| ----------------------------- | ------ | ---------------------------------------------------- |
| `Apasai-AMCP-Block-Untrusted` | Block  | everything **except** the trusted hosts and loopback |
| `Apasai-AMCP-Allow-Trusted`   | Allow  | the trusted hosts plus loopback                      |

Both are kept so the result does not depend on the profile's default inbound action. For your
host the block scope becomes exactly:

```
0.0.0.0-126.255.255.255
128.0.0.0-192.168.21.92
192.168.21.94-255.255.255.255
::
::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
```

which is the whole address space minus `127.0.0.0/8`, minus `::1`, minus exactly
`192.168.21.93`. We proved that arithmetic with 20 independent checks — full-space coverage,
the neighbours `.92` and `.94` still blocked, multi-host and IPv6 cases, and the equivalences
Windows introduces when it normalises a scope. The empty list returns the scope to
"loopback only" by **narrowing**, never by deleting the block rule.

Also fixed, from an adversarial review of our own code:

- A second engine service was writing rules on the same port and recreated the blanket block on
  every engine start — which would have silently undone any manual fix. One owner now.
- Rules are addressed by a stable identifier and updated with `Set`, not `Remove`+`New`, so no
  moment exists in which the port is unprotected.
- The trusted list now accepts only a canonical single address. Previously `192.168.21` was
  silently read as `192.168.0.21`, and `/0` — meaning everyone — was accepted.
- The engine now detects that the governing profile's firewall is **off** and raises a critical
  warning instead of reporting success. This is the check whose absence produced the wrong
  table in Response C.

### Decision 1 — the profile firewall (station's call, and the prerequisite for everything)

Until the Public profile's firewall is enabled on 192.168.21.111, **no rule we write has any
effect** and 5250 stays open to the LAN. Enabling it changes machine-wide posture: 8080/8443 and
the PGM ranges have explicit allow rules and will keep working, but other traffic on that host
(WebRTC signalling, NDI discovery, channel-mirroring) has no rule today and would start being
filtered. That is a station decision and we are not taking it unilaterally.

### Decision 2 — applying the allow, and the build pin

Two ways to apply item 1:

- **Run `secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` elevated.** Keeps the engine on 2.8.45,
  but a 2.8.45 engine recreates the blanket block on its next start and undoes it.
- **Move the engine to 2.8.47 and set the trusted list in settings.** The rule is then
  reconciled every 60 s and survives restarts. This is the one we recommend.

Which means the **2.8.45 pin is self-blocking**: the build we pinned is the one that cannot hold
the rule. We propose moving to 2.8.47 _before_ your validation run and naming that build in your
recon record. The change is confined to the firewall/identity layer; nothing in the AMCP surface
you are validating is touched, and contract v1 + Addendum A + v1.1/D9 are unchanged. Tell us if
you would rather we stayed on 2.8.45 and accepted the fragility.

## 5. Your §4, acknowledged

Your three inbound rules on 192.168.21.93, the connect-time behaviour (channel 2, layers 50–99;
`INFO` only on channel 1; no channel-wide `CLEAR`; preview channels never addressed;
192.168.21.114 never touched), and the plan to tell us before connecting — all understood, and
none of it is affected by anything above.

## 6. Where this leaves the joint test

Blocked on Decision 1, then Decision 2. Both are ours to bring to the station, and we will write
again the moment each is settled — with the profile state alongside the rule listing, not just
the rules.

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.
