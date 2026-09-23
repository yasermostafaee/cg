# Playout 2.8.54 — the built-in CG account and AMCP auto-trust (2026-09-23)

The Playout team's answer of 2026-09-23 (build **2.8.54**), recorded in the bridge's documentation
at their request, with what CG Control does about each fact (`DESKTOP-APPS-01-B`). 🔴 **No password
appears in this file or anywhere in this repository.**

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

## AMCP auto-trust — the one new wire behaviour

AMCP (TCP 5250) is **refused to every machine the Playout has not trusted.** A machine becomes
trusted when:

- it sends a **server-side** request to D4, D8 or D9 — one with **no `Origin` header**;
- that request carries a **valid, unrevoked token holding `station-admin`**;
- then the Playout adds the request's **source IP** to its firewall allow list within a few
  seconds.

Limits:

- a trusted IP not seen for **7 days** drops off the list;
- the Playout administrator can view the list and turn the feature off;
- a browser (it always sends `Origin`), an `operator` token and a `viewer` token never trust
  anything;
- **NAT and proxies break it**: `X-Forwarded-For` is not honoured, so the bridge must reach the
  Playout directly.

## What CG Control does

1. **Until a `station-admin` signs in, AMCP WAITS.** A refused AMCP link on a station that
   authenticates is not an alarm; the console says _"Waiting for a station admin to sign in."_,
   and the bridge's one reconnect loop keeps trying with its usual backoff. A link that has been up
   once alarms as it always did.
2. **A `station-admin` sign-in reads D4 at once** with that admin's own token — the read that
   trusts this machine — instead of waiting for the next 30 s catalogue tick or the D9 minute.
3. **Then the link is retried promptly for 30 s** (every half second at most), so it comes up
   within seconds of the Playout's firewall opening.
4. **Every bridge request to the Playout — D4, D9 and the JWKS — goes out server-side through one
   function: no `Origin` header, and no proxy** whatever the machine's environment says
   (`playout-http.ts`; measured: with `NODE_USE_ENV_PROXY=1` Node's own `fetch` would have used
   the proxy).
5. **The connection check's AMCP line follows the same order:** "waiting for sign-in" before a
   `station-admin` has signed in; judged after, over 30 s; and if still refused or dropped, _"The
   Playout did not trust this machine"_ with the likely reasons — auto-trust off, NAT/proxy/VPN,
   a Playout older than 2.8.54 — and only then the manual fallback
   `secure-ports.ps1 -AllowAmcpFrom <this IP>`.

**A known limit, not a fix (`C-042`).** Once a station has accounts that are not `station-admin`,
a `station-admin` must sign in from the bridge machine at least once every 7 days, or AMCP is
refused until one does. Today only `cg-admin` exists, and it is used daily.
