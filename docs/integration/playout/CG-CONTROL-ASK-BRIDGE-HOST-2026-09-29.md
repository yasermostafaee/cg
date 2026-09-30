# CG Control → Apasai Playout — May our "CG Bridge" run as a Windows service on the Playout machine?

> **به همکار گرامی در تیمِ Playout — لطفاً کلِ این فایل را همان‌طور که هست به Claude Code خودتان بدهید.**
> تا حالا bridgeِ ما روی سیستمِ هر اپراتور همراهِ CG Control نصب می‌شد. از نسخهٔ بعد، برای هر Playout فقط **یک** bridge داریم که به‌صورتِ سرویسِ ویندوز روی خودِ سیستمِ Playout (یا سروری کنارش) نصب می‌شود و همهٔ CG Controlها به آن وصل می‌شوند. این نامه اجازه و چند پاسخِ فنی می‌خواهد. نامه‌های قبلیِ ما سرِ جایشان هستند.

**From:** CG Control · **Date:** 2026-09-29

---

## TASK — for the Claude Code session on the Playout side

### 1. What changes

**Until now:** every CG Control ran its own bridge on the operator's PC. Two operators on one channel kept two different records of what is on air.

**From our next version (`0.10.0`):**

- **One "CG Bridge" per Playout,** a Windows service, installed by our own installer (`CG-Bridge_<version>_x64-setup.exe`) on the Playout machine, or on a server beside it.
- It starts with the system and restarts itself on failure.
- Every CG Control console connects to it with the Playout's own sign-in token (D9, `cg_channels`).
- It talks to CasparCG on loopback, and still writes only layers 50–99.
- **It uses these ports on that machine, inbound rules scoped to its exe only:**
  - TCP `5280` (consoles);
  - TCP `7911` (template pages for CasparCG and for our preview);
  - UDP `6250` (OSC from CasparCG).

### 2. Questions

1. **May it run on your Playout machines?** Any limits on CPU or RAM, the service account, or its start order relative to CasparCG and your own services?
2. **AMCP allow list:** the bridge will connect from `127.0.0.1` on the same machine. Is a loopback client admitted automatically, or does it still need the admin's approval in «تنظیمات ← اتصال به CG Control»?
3. **Reads from loopback:** the bridge reads D4, D10 and D11 from the same machine. Is there any difference (the issuer, CORS, the address) when the caller is local?
4. **Ports:** do `5280`, `7911` or UDP `6250` clash with anything of yours?
5. **Backup Playout:** today one bridge also drives the backup's core. With the bridge on the primary machine, is that still fine for you? A standby bridge on the backup would come in a later version.
6. **Optional:** could your «اتصال به CG Control» page show the bridge's status? It will offer `GET http://127.0.0.1:5280/health` (version, uptime, CasparCG and Playout connection; no secrets).
7. **Later:** would you want your installer to include ours, so a Playout install brings CG Bridge with it?
8. **For testing on `.111`:** when our build is ready, may we install CG Bridge there? We will ask for a time first, and test only on channel 2, layers 50–99.

### 3. What to send back

The answers to §2.1–§2.8. **If any part cannot be determined from your source or configuration, say so plainly rather than estimating.**

Contract v1 + A + v1.1/D9 + v1.2 + v1.3 (with C1–C5 and V13-INSTALL): unchanged. Only where our bridge runs changes. It still uses the same reads, the same AMCP rules and the same layers.
