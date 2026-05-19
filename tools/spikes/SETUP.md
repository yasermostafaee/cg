# CasparCG 2.3.x — Setup Runbook

A working CasparCG 2.3.x reachable on your LAN, with the HTML producer enabled and OSC configured to push events to your operator workstation.

## 1. Download

CasparCG releases live at <https://github.com/CasparCG/server/releases>. Target version: **2.3.3 LTS** or the latest 2.3.x patch.

Pick the Windows zip (e.g., `CasparCG Server 2.3.3 LTS.zip`). Extract anywhere; suggested path: `C:\casparcg\`.

## 2. Reach the operator workstation

The Runtime workstation needs to be on the same subnet as CasparCG. For the spike, two configurations work:

- **All-on-one-machine:** install CasparCG and run the spike scripts on the same Windows host. AMCP and OSC use `localhost`.
- **VM + host:** install CasparCG inside a Windows VM (Hyper-V / VMware / VirtualBox). Configure bridged networking so the VM gets a LAN IP. Use that IP from the host's scripts.

Note the IP of the CasparCG machine — referenced below as `<CASPAR_IP>`. Note the IP of the operator workstation — referenced as `<OPERATOR_IP>`.

## 3. Configure `casparcg.config`

Open `casparcg.config` (XML, in the install dir). The minimum edits:

### 3.1 Channels — 1080i50

```xml
<channels>
  <channel>
    <video-mode>1080i5000</video-mode>
    <consumers>
      <screen>
        <device>1</device>
      </screen>
    </consumers>
  </channel>
</channels>
```

`<screen>` consumer writes to a desktop window — fine for the spike (no SDI card required). For real broadcast you'd add `<decklink>` or `<ndi>`.

### 3.2 AMCP TCP

Default is already 5250:

```xml
<amcp>
  <media-server>
    <host>0.0.0.0</host>
    <port>3250</port>
  </media-server>
</amcp>
```

If your CasparCG version uses the older `<controllers>` block, look for `<tcp><port>5250</port></tcp>` and confirm it's there.

### 3.3 OSC push to operator workstation

The critical bit. CasparCG **pushes** OSC; we need to tell it where to push.

```xml
<osc>
  <default-port>6250</default-port>
  <disable-send-to-amcp-clients>false</disable-send-to-amcp-clients>
  <predefined-clients>
    <predefined-client>
      <address><OPERATOR_IP></address>
      <port>6250</port>
    </predefined-client>
  </predefined-clients>
</osc>
```

Replace `<OPERATOR_IP>` with the IP where you'll run `osc-capture`. If running all-on-one-machine, use `127.0.0.1`.

### 3.4 HTML producer

HTML producer is built in to 2.3.x — no plugin install needed. Just confirm there's no `<producers>` block that explicitly excludes `html`.

### 3.5 Windows Firewall

Allow:

- **TCP 5250** inbound to CasparCG.
- **UDP 6250** inbound to the operator workstation.

```pwsh
New-NetFirewallRule -DisplayName "CasparCG AMCP" -Direction Inbound -Protocol TCP -LocalPort 5250 -Action Allow
New-NetFirewallRule -DisplayName "CasparCG OSC"  -Direction Inbound -Protocol UDP -LocalPort 6250 -Action Allow
```

## 4. Boot CasparCG

From the install directory:

```pwsh
.\casparcg.exe
```

You should see:

- A console window with startup logs.
- A separate `<screen>` window showing a black 1920×1080 frame.
- Lines like `[info] Initial frame buffer ...`, `[info] AMCP TCP server listening on port 5250 ...`, `[info] OSC sending to <OPERATOR_IP>:6250 ...`.

## 5. Verify reachability

From the operator workstation:

### 5.1 AMCP

```pwsh
# In one terminal — listen for OSC:
node tools/spikes/osc-capture/osc-capture.mjs

# In another — connect to AMCP:
node tools/spikes/amcp-poke/amcp-poke.mjs
# At the > prompt:
VERSION
# Expect a 201 OK response with the CasparCG version string.
```

The osc-capture terminal should immediately start receiving `/channel/1/...` bundles.

### 5.2 HTML producer smoke

In `amcp-poke`:

```
PLAY 1-20 [HTML] "file:///C:/casparcg/templates/test.html"
```

(After creating a one-line `test.html` for verification.) The screen consumer should overlay the HTML.

## 6. What "ready for M1" means

- [ ] CasparCG boots cleanly; screen consumer shows a black frame.
- [ ] AMCP `VERSION` returns 201 in `amcp-poke`.
- [ ] OSC bundles arrive in `osc-capture`.
- [ ] `PLAY 1-20 [HTML]` with a tiny test HTML displays correctly on the screen consumer.

All four boxes ticked → proceed to `PROTOCOL.md`.

## Troubleshooting

| Symptom                          | Likely cause                                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| `VERSION` returns nothing        | Firewall blocking TCP 5250                                                 |
| No OSC bundles                   | `<predefined-client>` address wrong, or firewall blocking UDP 6250         |
| HTML producer flashes black      | CEF cache permissions; run CasparCG once as Admin to seed `%LOCALAPPDATA%` |
| Persian text shows as boxes      | System fonts incomplete; install Vazirmatn or Noto Sans Arabic system-wide |
| `osc-capture` shows `EADDRINUSE` | Another process listening on 6250; close it or change the port both sides  |
