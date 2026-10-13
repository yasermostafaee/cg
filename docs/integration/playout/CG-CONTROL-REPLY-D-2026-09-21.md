# CG Control → Apasai Playout — Reply D (path verified end to end; one item remains)

**From:** CG Control · **Date:** 2026-09-21 · **Re:** `PLAYOUT-CG-RESPONSE-C-v1.md`

> **خلاصهٔ فارسی —** موتورِ شما برگشت و ما از میزبانِ bridge اندازه گرفتیم: ۸۰۸۰ و ۸۴۴۳ و ۹۲۵۰
> هر سه آنی جواب می‌دهند. مسیرِ شبکه تأیید شد و سمتِ ما کاملاً پاک است. فقط **یک** چیز مانده:
> تأییدِ کتبیِ رولِ AMCP با فهرستِ هر دو رول. ما به ۵۲۵۰ دست نزده‌ایم و تا رسیدنِ آن فهرست نمی‌زنیم.

---

## 1. Verified from `192.168.21.93`, just now

| Target                                    | Result                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `192.168.21.111:8080`                     | **CONNECTED, 0.00 s** (`Test-NetConnection` → `SourceAddress 192.168.21.93`, `TcpTestSucceeded True`) |
| `192.168.21.111:8443`                     | CONNECTED, 0.00 s                                                                                     |
| `192.168.21.111:9250`                     | CONNECTED, 0.00 s                                                                                     |
| `192.168.21.111:9999` (nothing serves it) | refused — the control we expect to fail                                                               |

The network path between the two hosts is confirmed in both directions, with nothing between them
adding latency. Your engine API is reachable from the bridge host exactly as the contract assumes.

## 2. What we measured while it was down — offered for your records

Earlier today, before your engine came back, every port on `192.168.21.111` answered our SYN with a
`RST` in **3.7 ms**, captured on our own NIC (`pktmon`):

```
192.168.21.93:56583 > 192.168.21.111:8080  Flags [S]      (50-EB-F6-7D-1F-86 > 4C-CF-7C-09-16-1F)
192.168.21.111:8080 > 192.168.21.93:56583  Flags [R.]     3.7 ms later
```

That is a live host with a closed port, not a blocked packet — Windows Defender Firewall drops what
it blocks, which shows up as ~21 s of silence rather than a reset. So we could tell the service was
simply not running, and did not trouble you with it. We spent that time proving our own side clean
instead: routes, tunnel adapters, outbound firewall policy and the NIC capture all check out.

**One observation worth a moment of your attention:** `9999` is reset rather than dropped. Under the
firewall table in your Response C §1 it would have been dropped. That suggests the current inbound
state on `192.168.21.111` is not the state that table describes. Please send the current listing
along with item 1 below.

## 3. The one item that remains — item 1, in writing

Per the ordering you proposed in Response C §1, we are waiting on your written confirmation that
`secure-ports.ps1 -AllowAmcpFrom 192.168.21.93` has been applied. **We have sent nothing to TCP 5250
and will not until it arrives.**

To make it one paste, this on `192.168.21.111` gives us everything we need:

```powershell
Get-NetFirewallRule -DisplayName "Apasai*" | ForEach-Object {
  $pf = $_ | Get-NetFirewallPortFilter
  $af = $_ | Get-NetFirewallAddressFilter
  [pscustomobject]@{
    Rule = $_.DisplayName; Enabled = $_.Enabled; Dir = $_.Direction; Action = $_.Action
    Proto = $pf.Protocol; LocalPort = $pf.LocalPort; Remote = $af.RemoteAddress
  }
} | Format-Table -AutoSize
```

We are looking for two lines in particular: `Apasai - Allow AMCP from trusted hosts` present and
enabled with remote `192.168.21.93`, **and** the remote scope of `Apasai - Block external
playout-core AMCP`. As noted in our Reply C, Windows Defender Firewall evaluates an explicit Block
ahead of any Allow, so an allow rule for our host does not take effect while a block on TCP 5250
still covers that address — the listing settles it either way.

## 4. Our side, for the record

Three inbound rules on `192.168.21.93`, all enabled and scoped to `192.168.21.111` as the remote
address, so nothing on your host is affected by them:

| Rule                     | Protocol / port | Purpose                                             |
| ------------------------ | --------------- | --------------------------------------------------- |
| `CG bridge OSC in`       | UDP 6250        | your engine's OSC to our bridge                     |
| `CG bridge templates in` | TCP 7911        | your CEF fetching our templates                     |
| `CG probe fixtures in`   | TCP 7900–7901   | the recon probes' fixture servers, for the run only |

When we do connect, we will tell you first, and the run behaves exactly as described in Reply C §3:
unprompted on connect the bridge reads `INFO CONFIG` and sets `MIXER VOLUME 1` on **channel 2, layers
50–59 and 80–99**; every write stays on channel 2, layers 50–99; channel 1 receives `INFO` only; no
channel-wide `CLEAR`; your preview channels are never addressed; the plant `192.168.21.114` is never
touched.

Contract v1 + Addendum A (C1–C8) + v1.1/D9: unchanged. Engine build **2.8.45** pinned until we have
recorded the validation run — understood, and we will not ask you to hold it longer than the run takes.
