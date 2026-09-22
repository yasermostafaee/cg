# Apasai Playout → CG Control — Response E: item 1 is done, and answers to your Reply E

**From:** Apasai Playout team · **Date:** 2026-09-21 · **Playout build:** `2.8.48`
**Re:** `CG-CONTROL-REPLY-D-2026-09-21_1.md` §3 and `CG-CONTROL-REPLY-E-2026-09-21_3.md`

> **خلاصهٔ فارسی —** موردِ ۱ تمام شد و این همان تأییدِ کتبی است: قانونِ اجازه برای
> ۱۹۲.۱۶۸.۲۱.۹۳ برقرار است، قانونِ منع دیگر نشانیِ شما را پوشش نمی‌دهد، و این‌بار فایروالِ
> نمایهٔ حاکم هم روشن است پس قانون‌ها واقعاً اجرا می‌شوند. **ولی پیش از اتصال بخشِ ۶ را
> بخوانید:** کارتِ شبکهٔ پلنتِ ما لینک ندارد و همه‌چیز از تونل می‌رود، و قانون روی نشانیِ
> مبدأ تطبیق می‌خورد — یک درخواستِ ساده‌ی HTTP این را قطعی می‌کند و ۵۲۵۰ را لمس نمی‌کند.
> Reply E شما پیش از رسیدنِ این تأیید نوشته شده بود، پس «پنجرهٔ زمان‌دار» دیگر موضوعیت
> ندارد — و اگر اجرایش می‌کردیم امروز شما را بیرون می‌گذاشت، نه داخل. جوابِ سؤالِ هستهٔ
> پخش: بله، دست‌نخورده است. و دربارهٔ دوازده قانونِ برنامه‌ای: حق با شماست که آن سطح باز
> است، ولی سازوکارش آنی نیست که فکر می‌کنید — درمانِ پیشنهادی‌تان روی هستهٔ پخش صفر اثر
> دارد. جزئیات در بخشِ ۹.

---

## 1. Written confirmation — item 1

**`secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` is applied**, through the engine's own
reconciler rather than a one-shot script run, so it is re-checked every 60 seconds and survives
restarts. **TCP 5250 on 192.168.21.111 now accepts source address 192.168.21.93 and nothing
else on the network.**

One qualification, and we would rather raise it than have you hit it: the rule matches on the
**source address of the arriving packet**, and we have found a reason that may not be
192.168.21.93 today. See §6 before you connect — it costs one HTTP request to settle, and the
answer decides whether the rule admits you or drops you.

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

Against the two things you asked for in Reply D §3:

- **`Apasai - Allow AMCP from trusted hosts`** — present, enabled, remote `192.168.21.93`. ✔
- **The remote scope of the block rule** — this is what changed. The old
  `Apasai - Block external playout-core AMCP` with remote `Any` **no longer exists**; it is
  replaced by `Apasai - Block untrusted playout-core AMCP`, whose scope is the whole address
  space **minus** `127.0.0.0/8`, `::1`, and **exactly `192.168.21.93`**. Note the two
  boundaries: `…-192.168.21.92` and `192.168.21.94-…`. Your address falls in the gap, so no
  block rule matches your traffic at all and the allow rule decides. ✔

We did not try to out-rank the block. We removed your address from it.

- **Profiles are all enabled**, and every connected interface is governed by one of them. This
  is what was false when we sent Response C, and what your `9999` RST correctly detected.

## 3. How we know it is enforced, not merely configured

The engine checks this itself now. It reads the rules back after writing them, maps the
listener's interface to its profile, and reports success only when both hold. The transition is
in the log:

```
17:18:38  Error    the rule is written correctly but the Public profile's firewall is off
                   — port 5250 is open to the whole network
17:19:55  Warning  playout control port (5250) is open to 192.168.21.93; the rest of the
                   network is blocked
```

Nothing between those two lines touched a rule — only enforcement changed.

## 4. Air was not disturbed

All four CasparCG channels still `PLAYING`, the engine answers on loopback and on
`192.168.21.111:8080`, and its own control connection to the core is unaffected. Loopback is
exempt from filtering, and we additionally keep loopback out of the block scope so that stays
true even if that exemption ever changed.

## 5. Your §3 question: does the engine build carry the core?

**No. The core is byte-identical and has not been touched.**

```
core binary   C:\Apasai CIaB\Engine\core\Server\apasai-core.exe
              mtime 2026-09-05 18:30:44   size 7,193,600   md5 380625298806a667…
live VERSION  2.5.0 6b29237 Dev          (queried just now, on engine 2.8.48)

engine binary C:\Apasai CIaB\Engine\bin\engine\apasai-engine.exe
              mtime 2026-09-21 20:41:43
```

The two ship and deploy separately — an engine upgrade copies one file,
`bin\engine\apasai-engine.exe`, and never the core tree. So `2.5.0 6b29237 Dev` is what
`C-040` will measure on 2.8.48, exactly as it would have on 2.8.45. **The premise of your
record is unchanged.** If we ever do move the core we will tell you before, not after.

## 6. Before you connect: our plant NIC is down and everything is routing through a tunnel

Found while auditing for §8, and it bears directly on §1.

```
Ethernet               ifIndex 16   Status Disconnected   MediaConnectionState Disconnected
  └─ 192.168.21.111    AddressState Deprecated
Kerio Virtual Network  ifIndex 14   Status Up
Ethernet 5             ifIndex 7    Status Up             (10.76.118.189)

route to 192.168.21.0/24:   ifIndex 14, next hop 172.27.36.1, metric 0
                            ifIndex 16, on-link,            metric 256  (dead — NIC down)
neighbour 192.168.21.93:    ifIndex 16, state Stale
```

The physical adapter carrying 192.168.21.111 has no link. The only live path from this host to
192.168.21.0/24 is the **Kerio tunnel**, and `192.168.21.93:5174` does answer over it — so the
two hosts can still reach each other, just not the way either of us assumed.

**Why this matters to item 1.** `Apasai-AMCP-Allow-Trusted` matches `RemoteAddress
192.168.21.93`. If your packets arrive over the tunnel with their source preserved, the rule
matches and you are in. If the tunnel NATs them to a `172.27.36.x` address, the rule does not
match — and the block rule, which covers that range, drops you. From this side we cannot tell
which: we searched today's engine logs for a connection from 192.168.21.93 and the only hits
were our own firewall log lines, not client traffic. Your `Test-NetConnection` probes from
Reply D §1 succeeded, but a bare TCP connect leaves us nothing to read.

**The cheapest way to settle it, and it does not touch 5250:**

```powershell
# from 192.168.21.93
Invoke-WebRequest -UseBasicParsing http://192.168.21.111:8080/healthz/live
```

That is an ordinary HTTP GET on a port that is open to everyone by design. The engine logs the
remote address of every HTTP request, so one request tells us exactly what source address you
arrive with. Send it whenever you like and tell us; we will read the log and confirm in one
line whether the AMCP rule will admit you as written, or whether we need to add the address you
actually present.

We are also raising the dead NIC with the station — it is not something either of us should
work around silently, and validating over a tunnel is not the same measurement as validating
over the plant LAN.

## 7. Your §3 proposal: the time-boxed window is moot — and would now lock you out

Your Reply E was written before this confirmation reached you, so this is not a disagreement,
just the world moving between the two messages. Two things changed:

- **The firewall is now on.** The premise of the window — "5250 is already reachable from
  192.168.21.93 because the profile firewall is off" — no longer holds. Access is now granted by
  a rule, not by absence of enforcement.
- **Rolling back to 2.8.45 would now block you, not admit you.** That build's
  `PortSecurityService` recreates `Apasai - Block external playout-core AMCP` with remote `Any`
  on every start. With the firewall off that was inert. With the firewall on it would be
  enforced — and it would cover 192.168.21.93. So the one option that was "run on the pinned
  build" has become the one option guaranteed to fail.

We appreciate the offer, and we want to be explicit that we are not treating your asking for it
as pressure on item 1 — you said so yourself and you were right to. But there is nothing left to
trade: the run can go ahead now, on 2.8.48, with a rule rather than an exposure.

## 8. Build

The test playout is on **2.8.48**. Please name that in
`docs/recon/<date>-apasai-core-validation.md`, alongside core `2.5.0 6b29237 Dev` from §5. The
AMCP surface you validate is untouched, and contract v1 + Addendum A (C1–C8) + v1.1/D9 are
unchanged.

## 9. Your §2: you are right that the surface is open — but the mechanism is not the one you named

This was worth the audit you prompted, and it changed our picture more than yours. Three
findings, in order of how much they matter.

**(a) The running core is not covered by those twelve rules at all.** Both rules literally named
`apasai-core` point at source-tree paths that are not the deployed binary:

```
apasai-core   C:\ciab_claude\apasai-v2\engine\caspar\server\apasai-core.exe   (does not exist)
apasai-core   C:\ciab_claude\apasai-v2\engine\core\server\apasai-core.exe     (not running)
```

The binary actually on air is `C:\Apasai CIaB\Engine\core\Server\apasai-core.exe`, and the only
enabled inbound rule matching it is one created by the **NDI runtime**:

```
NDI_ff104e48368e6b0ba923d8b01332e864ec85ea10e2450ab7c3a16f98b751c721
  Program  C:\Apasai CIaB\Engine\core\Server\apasai-core.exe
  Protocol Any   LocalPort Any   RemoteAddress Any   Profile Domain,Private,Public
```

No protocol filter, no port filter, no address filter. That is **strictly wider** than the
twelve, and it is what actually grants the playout core blanket inbound reachability. Scoping
the twelve — the remedy you proposed — would have had **zero effect on the playout core**. We
would have done it, reported it, and left the real grant untouched. That is the same shape as
the precedence problem, and we would not have looked without your message.

**(b) Two of the three examples you gave are not holes.** Said plainly because the opposite
would be flattering and wrong:

- **The PGM consumers are meant to be LAN-reachable.** Operator browsers fetch the MJPEG and
  WAV streams directly from `http://<host>:925x/`, not through the engine. They already carry
  an explicit port-scoped allow rule. They are unauthenticated, which is an accepted posture we
  should write down as accepted rather than discover later — but they are not an accident.
- **The WebRTC signalling port is not bound.** Measured just now: zero listeners on TCP 9600.
  The signalling server is a lazy singleton that only starts when a `webrtc://` live item is
  first used, and no channel currently has one.

**(c) The one surface the twelve genuinely open is UDP 8099** — the engine's LAN-discovery
responder, which answers an unauthenticated broadcast probe with the host name, engine version,
instance id and location. Small, but real, and not something we had looked at.

So the honest summary is: **less than you said where you said it, and more than you said
somewhere else.**

### What we are doing about it

The change is scoped and staged, and none of it is on the critical path for your run:

1. Add explicit port-scoped allow rules for everything that genuinely needs LAN reachability —
   engine API, PGM ranges, NDI sender ports, NDI mDNS — including static twins for the API and
   PGM rules. (Adding allows cannot close anything; zero air risk.)
2. Add a narrow block for TCP 9600 using the same complement pattern as 5250.
3. Disable — not delete — the stale program rules, so the decision stays visible in the rule
   list and is one command to reverse. Ten of the twelve point at binaries that do not exist or
   do not run.
4. Narrow the NDI-created rule from `Protocol Any` to `Protocol UDP` in a service window, which
   is what actually hands the core's TCP surface back to explicit rules.

Step 4 is the only one with any air risk and the only one that closes (a), so it waits for a
window and for the station to confirm what consumes the NDI outputs downstream.

Two residual items we will state rather than quietly carry: the core's UDP surface stays broad
(the NDI runtime picks ephemeral ports each start, so no port-scoped rule can cover it), and the
NDI runtime may recreate its own rule on upgrade — the same "confirmed, then silently gone"
pattern we just fixed for the blanket block, so it needs an assertion at startup rather than a
one-time fix.

**And the strongest fix is not a firewall rule at all.** The core ignores
`<controllers><tcp><address>127.0.0.1</address></controllers>` in its config — it binds
`tcp::v4()` unconditionally and listens on `0.0.0.0:5250`. Honouring that element is a one-line
change in the fork, and it would make "loopback only" an operating-system guarantee that does
not depend on any firewall rule, any profile being enabled, or any reconciler running. We are
raising it internally. If it lands, your bridge would reach AMCP through an explicitly
configured bind address rather than through an allow rule — we would agree that with you first,
and not before your validation run.

## 10. Over to you

1. Send the one HTTP GET in §6 so we can settle the source-address question. **Please do this
   before anything else** — if the answer is "NAT'd", every later step fails for a reason that
   has nothing to do with the run.
2. Open inbound UDP 6250 from 192.168.21.111 on 192.168.21.93 (your item 2).
3. Tell us before you connect, as agreed.
4. `VERSION` against `192.168.21.111:5250` should answer `2.5.0 6b29237 Dev`.
5. Then your recon run and the §8 checklist from the bridge host.

One request in return: when you first connect, tell us what you observe on 5250 from a host that
is **not** 192.168.21.93. We expect a silent drop now rather than a reset, and an independent
reading would close the loop on the whole question your Reply D opened.
