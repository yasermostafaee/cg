# backup-session — CG Bridge keeps one Playout session per engine, the backup survives a restart, and CG Bridge is never a second sender on the backup core (`R-085`, `B-312`, `B-313`)

Prompt: `RELEASE-0112-01` (v1), 2026-10-04, with its deltas `-A` (carried by `console-polish` §12) and `-B` (the
engine model). Order: after `RELEASE-0111-01` and its delta A (draft `v0.11.1` on `61026bc3`).

## Why

The owner's decision of 2026-10-04: **the client runs a primary AND a backup engine from the first day**, so
everything CG needs from the backup must work before hand-over, with no side step outside an app's own UI.
The Playout is ONE client (the operator application) holding a list of ENGINES; a pair is two engines, each
on its own machine with its own CasparCG core and its own API (`RELEASE-0112-01-B`).

- **`R-085`.** Each engine signs its tokens with its own ES256 key and keeps its own users
  (`PLAYOUT-CG-RESPONSE-0110-111-v1.md` §2). CG Bridge holds one session, the primary engine's, so every read
  of the backup engine — today D11 alone — answers `401`. The cost lands at the worst moment: after a
  failover, every media-plate take is refused (`backup-no-copy`), because B's media list was never read. And
  AMCP's automatic acceptance on the backup cannot happen, so its admin must press «تأیید» by hand.
- **`B-312`** (found while establishing §0). On the INSTALLED service, server B does not survive a restart:
  the service's flags build the connection with no server B, and that beats the saved file. Every reboot or
  upgrade silently stops all mirroring to the backup core.
- **`B-313`.** The engine installer's «CG Bridge هم نصب شود» is ticked by default (their §4.2), so installing
  the backup engine puts a CG Bridge on its machine. That bridge reaches the backup core over loopback with no
  approval, and the moment it is given a channel it is a SECOND sender on the core the primary's bridge
  mirrors to — and the core's `DEFER` list is shared by every connection (`V13S` 207-213). No engine
  publication tells a bridge that its engine is the backup.

## What changes

- **One session per engine (`R-085`).** CG Bridge keeps a second Playout session, the backup engine's: its
  own D1/D2, its own refresh family persisted before use, its own in-flight mark, its own file
  (`bridge-session-backup.json`), bound to the backup engine's address — the `CENTRAL-BRIDGE-01-A` / `2.9.2`
  §8 rules for each. The backup engine's address is Station setup's server B host with the primary engine's
  port. Every request to an engine carries THAT engine's token, never the other's.
- **What the backup's session unlocks.** D11 `?fingerprint=` (`B-286`), D4 (its channels, `casparHost`
  resolved to the backup's host by rule 9), `/api/cg/license`, and the introducing D9 read that lets the
  primary's machine into the backup core's AMCP. With no backup session, today's behaviour: the media box
  stays empty on B, with the reason in words.
- **States in words, per engine:** signed in · needs a station admin to sign in · CG not licensed on this
  engine · AMCP waiting for the engine's «تأیید» · unreachable. In «Sign in CG Bridge…» (each engine named,
  with its address and state, signed in with its own account and password), beside `PRIMARY A` / `BACKUP B` in
  the status bar, and as one line per engine in the check's Sign-in group.
- **Isolation.** A failure, a `401`, a reuse revocation or a password change on one engine never touches the
  other engine's session; nothing on air changes because of it; a backup problem never refuses a take on the
  primary.
- **`B-312`.** The installed service keeps Station setup's server B across a restart.
- **`B-313` — the guard.** The primary's CG Bridge reads `/health` of a CG Bridge on the backup engine's
  machine; while one there drives that core, it sends the backup core NOTHING (the primary untouched) and
  says so on the backup line and in `/health`. `/health` gains the channels a bridge drives (an idle,
  first-run bridge drives none) and the backup engine's state.
- **The fake pair.** Tests run two fake engines with different keys and passwords, each with its own CasparCG
  stand-in; `pnpm dev:station --fake --pair` runs the same on the owner's PC.

## Not in this change

- `R-079` (a standby bridge on the backup machine) — the recommended layout works without it.
- `R-086` (`cg-bridge`) — still waits on the meters answer.
- A role published by the engine — asked of the Playout team; the guard is built on what can be proved.
