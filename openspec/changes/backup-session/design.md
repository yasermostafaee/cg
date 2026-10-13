# backup-session — design

`§0` of `RELEASE-0112-01` (its report, `Claude outputs/REPORT-RELEASE-0112-01-v1-2026-10-04.md`) is the
evidence behind every decision here. Words: the **primary engine** and the **backup engine** (each with its own
core and API), and **the Playout client** (the operator application).

## D1 — Where the backup engine is

The backup engine's API address is the primary engine's address with **server B's host**: each engine serves
its API on its own core's machine (`IM` 140: "the slave is a separate install, with its own D4, D10 and
D11"). This is the rule `B-286`'s lookup already used (`backupMediaUrl`), now one function
(`backupEngineAddress`) every backup read and the backup's session use. No engine publishes its partner, so
nothing else can be read (question B5.1 for the Playout team). A test or the dev station may name the backup
engine's address outright (`--backup-playout-address`), because two fakes on one PC differ by port, not host.

## D2 — One session per engine, the primary's untouched

`BridgeSession` is reused unchanged in its rules for the backup: a second instance with its own file,
`bridge-session-backup.json`, beside the primary's. The record gains an optional `address` (the engine it
belongs to; the version stays `1`, so a file written before reads as it did). The backup's file is used only
when its address is the backup engine's address NOW — server B moved to another machine means that token is
never sent to the new one (it would be a token crossing engines). The primary's file and its behaviour are
not changed by a byte.

**Verifying the backup's token.** The primary's verifier (`PlayoutAuth`) adopts an issuer, and trusts the
primary's key set: it cannot verify a token the backup signed, and must not learn anything from one. The
backup's session gets its own verifier: ES256 against the BACKUP engine's JWKS, `aud` containing the
audience, `exp` within tolerance, `sub` and `name` read. Its issuer is not compared. A backup token never
authorises anything in CG — it is only the bearer for the backup engine's own reads — so what a station trusts
for its consoles stays the primary's alone.

## D3 — What the backup's session reads, and the rule for each

| Read                     | Reader                                                                | Bearer                  | Its outcome                                           |
| ------------------------ | --------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------- |
| D11 `?fingerprint=`      | `BackupMediaLookup` (unchanged but for its bearer)                    | the backup session only | B's own clip path (`B-286`)                           |
| D4                       | a second `PlayoutCatalogue`, `playoutHost` = server B's host (rule 9) | the backup session only | the backup's channels, for its line                   |
| `/api/cg/license`        | a second `PlayoutLicenseReader`                                       | the backup session only | `not-licensed` on the backup's line — never a refusal |
| D9 (introduction)        | one read per access token gained                                      | the backup session only | the backup core lets this machine's AMCP in           |
| `/api/v1/system/version` | a second `PlayoutVersionReader`                                       | none                    | whether the backup engine's API answers               |

`usableBearer()` — the primary's reads — is untouched. The backup lookup's old bearer
(`playoutAuth.usableBearer()`, the PRIMARY's token) is the one line removed: it was the token crossing engines
that `R-085` exists to end.

## D4 — The wire to the consoles is additive

New channels only: `bridgeSession.engines` (pull), `bridgeSession.engines-changed` (push) and
`bridgeSession.backup.sign-in`. `bridgeSession.state` and `bridgeSession.sign-in` keep their shapes, so a
console that does not know the new channels works exactly as before, and a console that asks a bridge that
does not know them gets "unknown channel" and shows the primary alone. The state words come from ONE function
in the bridge (`engineState`), from the session, the last sign-in's code, the license, the version read's
reachability, the core's AMCP and the guard — so the dialog, the status bar and the check cannot disagree.

## D5 — `B-312`: the saved server B comes back

The service's flags name server A (from its configuration file), so `bin/caspar-bridge.mjs` builds the
connection from flags, and `createBridge` takes that over the saved file. The fix merges the SAVED server B
(with the saved strategy and auto-failover) into a connection the service's flags built — only for the
service, only when no `--backup-*` flag was typed, and never touching server A, which stays the configuration
file's (an installer `/AMCPHOST=` still takes effect). One pure function, `withSavedBackup`.

## D6 — `B-313`: the guard, on what can be proved

No engine says it is a backup (`§0.4`), so the guard works from what CG Bridge CAN see: the `/health` of a CG
Bridge on server B's machine — unauthenticated, read-only, documented, and opened by our own installer's
firewall rule on every machine that has one. `/health` gains `casparcg.channels` (the channels a bridge
drives; empty in first-run). The predicate `drivesCore(health, core)` is the one reader. While it holds for
server B, the bridge stops its server B session (nothing at all is sent — not even `OSC SUBSCRIBE`) and blocks
failover to B; the backup line reads `core-held`. A `/health` without `casparcg.channels` (a bridge older than
this) counts as driving: unknown resolves to the safe side. Its own `/health` never counts (`startedAt` and
ports). Server A's machine is read the same way when A is remote, and is ONLY said (`core-shared`): holding
the primary would change the primary's take path, which this release must not do.

**What it does not cover, said rather than hidden:** a firewall that blocks the other bridge's port hides it,
and the other bridge's OWN sends are not ours to stop — a bridge cannot learn that its core is someone's
server B. The guard makes THIS bridge never the second sender; the guide's "untick the box on the backup
engine" and the question to the Playout team close the rest.

## D7 — Why not `R-079`

The recommended layout (CG Bridge on a separate server, `§0.2`) keeps CG working when the primary engine's
machine dies: CG fails over to the backup core on its own. A standby bridge is needed only to rescue layout
(a), which this release does not recommend.
