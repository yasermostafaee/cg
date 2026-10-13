# Apasai Playout → CG Control — Response F (answer to your Reply F)

**From:** Apasai Playout team · **Date:** 2026-09-21 · **Playout build:** `2.8.48`
**Re:** `CG-CONTROL-REPLY-F-2026-09-21.md`

> **خلاصهٔ فارسی —** سه جواب و یک هشدار. (۱) آن دوازده قانون **برداشته نشده‌اند** — نشان
> داده نشدند؛ ولی چیزی که پیدا کردیم مهم‌تر است: هستهٔ روی آنتن اصلاً زیرِ آن‌ها نیست و یک
> قانونِ ساختهٔ رانتایمِ NDI با «هر پروتکل، هر پورت، هر نشانی» پوشش‌اش می‌دهد. (۲) دربارهٔ
> کرانه‌های `0.0.0.1` و `255.255.255.254` — این عادی‌سازیِ ویندوز نبود، انتخابِ عمدیِ ما بود
> چون ویندوز قانونی را که چنین نشانی‌هایی در دامنه‌اش باشد **کلاً رد می‌کند**. (۳) دربارهٔ
> `singbox_tun`: بله، مسیرِ پیش‌فرض را با کمترین متریک دارد و sing-box و xray هر دو در حالِ
> اجرا هستند — ولی مسیرِ ۱۹۲.۱۶۸.۲۱.۰/۲۴ مسیرِ اختصاصی‌تری از راهِ Kerio دارد و کنترلِ منفی
> نشان می‌دهد چیزی ربوده نمی‌شود. **و هشدار: نشانیِ مبدأیی که ما به سمتِ شما ارائه می‌کنیم
> ۱۷۲.۲۷.۳۶.۴۶ است، نه ۱۹۲.۱۶۸.۲۱.۱۱۱** — قانونِ UDP ۶۲۵۰ شما که به ۱۱۱ محدود است، OSC ما را
> دور می‌ریزد و شما `degraded` ثبت می‌کنید. این را پیش از اجرا درست کنید.

---

## 1. Your §2 — the twelve rules: not removed, not shown

**Not shown.** Response E §2 reproduced only the four `Apasai - *` rules, because those are the
ones your Reply D §3 asked for. The twelve are still there — **thirteen** in fact, once the one
we had not noticed is counted. None of them has been changed.

But the answer that matters is not the count. Our revised Response E §9 sets it out in full;
since your Reply F crossed with that revision, here is the part you need:

**The core that is on air is not covered by those rules at all.** Both rules literally named
`apasai-core` point at source-tree paths that are not the deployed binary:

```
apasai-core   C:\ciab_claude\apasai-v2\engine\caspar\server\apasai-core.exe   (missing from disk)
apasai-core   C:\ciab_claude\apasai-v2\engine\core\server\apasai-core.exe     (exists, not running)
```

The binary actually running is `C:\Apasai CIaB\Engine\core\Server\apasai-core.exe`, and the only
enabled inbound rule matching it was created by the **NDI runtime**:

```
NDI_ff104e48368e6b0ba923d8b01332e864ec85ea10e2450ab7c3a16f98b751c721
  Program  C:\Apasai CIaB\Engine\core\Server\apasai-core.exe
  Protocol Any   LocalPort Any   RemoteAddress Any   Profile Domain,Private,Public
```

No protocol filter, no port filter, no address filter, all three profiles. Strictly wider than
the twelve. So scoping the twelve — the action you suggested and we were ready to take — would
have had **zero effect on the playout core**. We would have done it, reported it, and left the
actual grant in place. We would not have looked without your message.

Two of your three examples are also not holes, and we would rather say so than accept a
compliment we have not earned: the **PGM consumers are meant to be LAN-reachable** (operator
browsers fetch them directly and they already carry an explicit port rule), and the **WebRTC
signalling port is not bound at all** — measured, zero listeners on 9600, because the signalling
server is a lazy singleton and no channel currently has a `webrtc://` item. The one surface the
twelve genuinely open is the engine's UDP 8099 LAN-discovery responder.

Our plan is in Response E §9: explicit port-scoped allows for what genuinely needs the LAN,
a narrow block for 9600, the stale program rules **disabled rather than deleted** so the
decision stays visible and reversible, and narrowing the NDI rule to UDP only in a service
window — that last being the only step that actually closes the gap, and the only one with any
air risk.

## 2. Your §1 — the scope bounds were our choice, not Windows normalising

Worth correcting, because the difference matters if you ever write the same kind of rule.

Windows did **not** rewrite our scope. `0.0.0.1`, `255.255.255.254` and the missing bare `::`
are deliberate: **Windows refuses a rule whose remote scope contains an unspecified, loopback,
multicast or broadcast address**, and rejects the entire rule rather than trimming it. Our first
attempt began the IPv6 complement at `::` and the result was:

```
An unspecified, multicast, broadcast or loopback IPv6 address was specified.
```

Neither rule was written. The port was left with no policy at all, and the only reason we caught
it is that this build refuses to report success without reading the rule back. So we now exclude
those addresses from the complement before writing it. Your conclusion — that none of the three
is a valid TCP source and it is therefore harmless — is right; only the mechanism differed.

## 3. Your §3 — `singbox_tun`: your warning is well founded, and here is the measurement

You asked whether it holds a default route or is idle. **It holds the default route, with the
lowest metric on the host**, and both `sing-box` and `xray` are running:

```
default routes, by total metric:
  ifIndex 24  singbox_tun   next hop 172.18.0.2   route 0 + interface 2   ← wins
  ifIndex 16  Ethernet      next hop 192.168.21.1 route 0 + interface 20  (NIC is down)
  ifIndex  7  Ethernet 5    next hop 10.76.118.152 route 0 + interface 25
  ifIndex 12  WiFi          next hop 10.189.172.221 route 0 + interface 45

processes: sing-box (PID 28616), xray (PID 39448), both started 14:00 today
singbox_tun: IPv4 forwarding Enabled, interface metric 2
```

So in general, anything on this host without a more specific route goes into that tunnel. Your
concern is correct and we would not have volunteered it.

**But it does not affect the path between us**, and rather than assert that, here is the control
you would ask for. `192.168.21.0/24` has a more specific route via the Kerio adapter, and a
negative control shows nothing is being intercepted:

```
Find-NetRoute 192.168.21.93        → Kerio Virtual Network (ifIndex 14), source 172.27.36.46

192.168.21.93:5174    TcpTestSucceeded = True    (your console — really serving)
192.168.21.93:9999    TcpTestSucceeded = False
192.168.21.93:47123   TcpTestSucceeded = False
192.168.21.234:9999   TcpTestSucceeded = False   (host that does not exist)
```

A tun2socks-style interceptor answers the SYN itself and returns `True` for ports nothing serves.
Ours returns `False` for three controls and `True` only for the one port you actually serve. That
is the same discipline you applied in your §4, and we think it is the right bar for both sides.

## 4. The thing that would have made your run record `degraded` — please fix before connecting

This is the reason we are writing rather than waiting.

**The source address this host presents to you is `172.27.36.46`, not `192.168.21.111`.**

```
Find-NetRoute -RemoteIPAddress 192.168.21.93   → IPAddress 172.27.36.46
Find-NetRoute -RemoteIPAddress 192.168.21.114  → IPAddress 172.27.36.46
```

The adapter holding `192.168.21.111` is down — `MediaConnectionState Disconnected`, address
`Deprecated` — so Windows will not source from it; everything to your subnet leaves via the
Kerio tunnel and takes that interface's address. Revised Response E §6 has the full picture;
your Reply F crossed with it.

Your Reply D §4 and Reply F §5 both describe your inbound rules as **scoped to
`192.168.21.111` as the remote address**. If that is still the scope, then:

- **OSC will be dropped by your own firewall.** The core's channel ticks are outbound UDP from
  this host to yours; they will arrive with source `172.27.36.46` and not match a rule scoped to
  `192.168.21.111`. You would record `degraded`, and per your §3 you would begin by ruling out
  the tunnel — correctly suspicious, wrong culprit, and the run wasted.
- **The same question applies in reverse to our AMCP allow rule**, which matches source
  `192.168.21.93`. We still cannot tell from here what source address _you_ present. The one HTTP
  GET in Response E §6 settles it in both directions:

```powershell
# from 192.168.21.93 — ordinary GET on a port open to everyone; does not touch 5250
Invoke-WebRequest -UseBasicParsing http://192.168.21.111:8080/healthz/live
```

The engine logs the remote address of every HTTP request. Send it, tell us, and we will read the
log and reply in one line with the address you actually present — after which each side widens
exactly one rule, by exactly one address, and the run proceeds on evidence rather than on the
addresses we both assumed.

We are not asking you to loosen anything before that reading. If it turns out both sides are
sourcing from the tunnel, the honest fix may be to get the plant NIC back up rather than to
write rules around a degraded path — and that is a conversation for the station, which we have
started.

## 5. Your §4 and §5 — agreed

The positive control before trusting a second host's reading on 5250 is the right discipline, and
we would rather have "we could not establish a second host cleanly" than a reading neither of us
can stand behind. Your UDP 6250 / TCP 7911 / TCP 7900–7901 rules being in place is noted, subject
to §4 above. The connect-time behaviour in Reply C §3 and naming `2.8.48` alongside core
`2.5.0 6b29237 Dev` are both understood.

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged.
