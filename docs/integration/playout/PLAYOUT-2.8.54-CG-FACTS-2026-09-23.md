# Playout 2.8.54 — the built-in CG account and the AMCP allow list (2026-09-23, revised)

The Playout team's answer of 2026-09-23 (build **2.8.54**) and its revision the same day, recorded
in the bridge's documentation at their request, with what CG Control does about each fact
(`DESKTOP-APPS-01-B`, corrected by `-01-C`). 🔴 **No password appears in this file or anywhere in
this repository.**

## The built-in account

Every Playout install creates **`cg-admin`** on its first run:

| Field         | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| `roles`       | `["station-admin","operator","viewer"]`                                  |
| `cg_channels` | `"*"`                                                                    |
| `sub`         | random per install                                                       |
| `name`        | `حسابِ داخلیِ CG Control`                                                |
| scope         | CG only — signing in to the Playout's own client with it answers **403** |

**The password is random per install.** The Playout administrator reads it at
**تنظیمات ← اتصال به CG Control ← حسابِ داخلیِ CG Control**, which has a copy button and a
«گذرواژهٔ تازه» button that sets a new one.

## The issuer

`iss` is **`urn:apasai:playout`**, the same on every install. Their warning, adopted: **`iss` does
not identify an install. The root of trust is the JWKS at the address the client enters.** CG
Control never uses `iss` as an install identity — a station configured by the Playout's ADDRESS
learns it from the first `station-admin` sign-in and then compares it as a constant (ADR 0010's
amendment). Each install makes its own P-256 signing key; that key, fetched from the configured
address, is what tells one install from another.

## The catalogue and CORS

- D4's `casparHost` is **`127.0.0.1`** on a fresh install — the engine naming its own machine. The
  bridge's one D4 reader resolves a loopback host to the Playout's host (`DESKTOP-APPS-01-A` A4).
- CORS allows **`http://127.0.0.1:5174`** by default — the one origin every CG Control console is
  served from (ADR 0011).

## The AMCP allow list — the one new wire behaviour (REVISED)

🔴 **Revised 2026-09-23.** The Playout team revised its first answer after an internal review
(their `PLAYOUT-CG-RESPONSE-BUILTIN-ACCOUNT-v1`, revised, §2.5). The earlier text here — any of
D4, D8 or D9 introduces, and a 7-day expiry — is **superseded** by what follows.

AMCP (TCP 5250) is **refused to every machine not on the Playout's AMCP allow list.** The rule:

1. **Only a D9 read introduces a machine**, and only one that is:
   - **server-side** — it carries **no `Origin`** (a browser always sends one);
   - made with a **valid, unrevoked** token;
   - by an account that is **active today and holds `station-admin`** — the Playout reads the
     role from the ACCOUNT, not from the token.

   **D4 and D8 introduce nothing.**

2. **The first machine is let in once, automatically.** On a fresh install, the FIRST machine
   introduced is added to the allow list without anyone acting — once per install lifetime — and
   that automatic path is then **sealed for good**.
3. **Every later machine waits for approval.** Any other machine — including the **same** machine
   after its **IP address changes** — is recorded as **pending** until the Playout's administrator
   approves it at **تنظیمات ← اتصال به CG Control**, inside the Playout's own app.
4. **No expiry.** A machine stays on the list until the administrator rejects it. Access is not
   tied to any account.
5. **An operator's first contact seals the automatic path.** If the first introduction comes from
   an `operator`, that machine is recorded pending and the automatic path is sealed. A **loopback**
   bridge seals it too.
6. **The same IPv4.** The D9 read must come from the **same IPv4 address** AMCP comes from. A
   Playout address that resolves to IPv6 introduces a different address.
7. **A backup Playout keeps its own list**; the lists are not mirrored.

NAT and proxies still break it: `X-Forwarded-For` is not honoured, so the bridge must reach the
Playout directly.

⚠ **For engineers, and only for Playout builds BEFORE 2.8.54:** those builds had no allow list,
and AMCP was opened by hand on the Playout server with `secure-ports.ps1 -AllowAmcpFrom <ip>`
(Response B–E in this folder). From 2.8.54 no operator or administrator runs a script: the
approval is a button in the Playout's app, and no CG Control surface names the script.

## What CG Control does

1. **Until a `station-admin` signs in, AMCP WAITS.** A refused AMCP link on a station that
   authenticates is not an alarm; the console says _"Waiting for a station admin to sign in."_,
   and the bridge's one reconnect loop keeps trying with its usual backoff. A link that has been up
   once alarms as it always did.
2. **A `station-admin` sign-in reads D9 at once** (`DESKTOP-APPS-01-C` C4) with that admin's own
   token — the introducing read — instead of waiting for the next tick of the 60 s D9 cycle, which
   is unchanged.
3. **Then the link is retried promptly for 30 s** (every half second at most), so it comes up
   within seconds of the Playout letting this machine in.
4. **Before the issuer is adopted, only a `station-admin` reaches the Playout** (C5): a refused
   sign-in is never a bearer for D4, D8 or D9, so an operator's first attempt cannot seal the
   automatic path.
5. **One IPv4** (C6): the Playout's host is resolved ONCE to an IPv4 literal, and every bridge
   request to the Playout AND the AMCP session use it. A host with no IPv4 address is one line in
   first-run's check.
6. **Every bridge request to the Playout — D4, D9 and the JWKS — goes out server-side through one
   function: no `Origin`, no proxy** whatever the machine's environment says (`playout-http.ts`;
   measured: with `NODE_USE_ENV_PROXY=1` Node's own `fetch` would have used the proxy).
7. **The connection check's AMCP line** (C7): "waiting for sign-in" before a `station-admin` has
   signed in; "waiting for the Playout to let this machine in" for 30 s after; then _"This machine,
   `<its IPv4>`, is waiting for approval in the Playout, at تنظیمات ← اتصال به CG Control, where
   the Playout's administrator approves it. If it is not listed there, this machine reaches the
   Playout through NAT, a proxy or a VPN."_ No script is named.

**Known limits, not fixes (`C-043`).** (a) The bridge machine needs a **static IP**: after an IP
change, AMCP waits for the administrator's approval. (b) A **backup Playout** keeps its own list,
so a mirrored pair needs the bridge approved on each Playout. (c) On a fresh install, **whoever
introduces a machine first wins the automatic slot.** `C-042` (a 7-day expiry) is withdrawn: the
revised rule has none.
