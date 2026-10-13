# Ops — the caspar bridge: where it runs, as whom, and where its output goes

**Created 2026-09-07 by `STALE-CLAIMS-02` §5.** Two things live here and nothing else: **which
account the bridge runs as**, and **where its stderr lands**. Both are per-MACHINE facts, which is
the entire reason the file exists.

> 🔴 **A LOG PATH NAMES A MACHINE.** The development box and the plant are different hosts with
> different launch paths and different log locations, and reading the wrong one has already cost a
> day. Every row below is labelled with the host it was measured on and the date it was measured.
> **If you are about to read a log, first answer "on which machine?"** — then use the row for that
> machine, not the one you remember.

---

## The measured state, 2026-09-07

### `frontEnd-01` — the DEVELOPMENT box (this repo's host)

| fact              | value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| runs the bridge   | **yes** — `~/.cg-runtime` is live (`bridge-live-layers.json` written today)  |
| how it is started | **by hand**, `node tools/caspar-bridge/bin/caspar-bridge.mjs --host 0.0.0.0` |
| account           | `frontend-01\yaser` — the interactive user, NOT a service account            |
| Windows service   | **none.** No `caspar`/`cg`/`bridge` service is registered on this host       |
| NSSM              | **not on `PATH`** on this host                                               |
| state directory   | `C:\Users\yaser\.cg-runtime`                                                 |
| stderr today      | **the console that launched it.** Lost when that window closes               |

🔴 **`~/.cg-runtime\bridge-stderr.log` ON THIS HOST IS A TRAP, and it is the reason this file was
written.** The file EXISTS, so a reader naturally treats it as the bridge's log. It is **175 bytes
last written 2026-07-27** and holds exactly two lines — the `WS listening` and `template HTTP
server` boot lines from that day. Its neighbour `bridge-audit.ndjson` was written the same
afternoon this was measured. **So the file is real, is genuinely the bridge's own output, and is
six weeks stale**: redirection was configured once and the current launch path does not use it. A
log that is stale rather than missing is the worst shape available — it answers, and the answer is
about July.

### The PLANT (`192.168.21.114`)

**NOT MEASURED — and deliberately not.** This session had a hard stop against touching the plant,
so every plant row would be a guess. What is known from `B-225` is that **CasparCG** there is
installed under NSSM with auto-restart, in Session 0. **Whether the BRIDGE is also an NSSM service
there is UNVERIFIED.** Fill this table in from the plant itself, not from this sentence:

| fact            | value        |
| --------------- | ------------ |
| runs the bridge | _unverified_ |
| service name    | _unverified_ |
| account         | _unverified_ |
| stderr path     | _unverified_ |

---

## Why capturing stderr matters more than it used to

The bridge says things on stderr that exist **nowhere else** — not in the audit log, not on any
console surface. Losing them means losing the only record that the event happened:

- **`B-236` raster ADOPTION** — `CHANNEL n RASTER ADOPTED …`. A **persisted value that changed by
  itself**. If this line is not captured, `channel-settings.json` differs from what it was and
  nothing anywhere says why.
- **`R-030` raster MISMATCH** — `CHANNEL n RASTER MISMATCH …`, fired on the transition.
- **persistence failures** — an unusable `channel-settings.json`, a failed atomic write. Each is
  explicitly NON-FATAL, so stderr is the only signal that it happened at all.

---

## Turning capture on — the owner runs these; nothing here was changed for him

⚠ **Nothing on any host was modified by the session that wrote this file.** These are steps, not a
report of work done. Pick the section for the machine you are on.

### If the bridge runs by hand (the development box today)

Redirect both streams at launch. PowerShell, from the repo root:

```powershell
$log = Join-Path $env:USERPROFILE '.cg-runtime\bridge-stderr.log'
node tools/caspar-bridge/bin/caspar-bridge.mjs --host 0.0.0.0 2>> $log
```

`2>>` APPENDS. Use `2>` only if you mean to discard everything the file already holds — and on
this host that file still contains the 2026-07-27 lines, which are evidence of when capture last
worked.

### If the bridge runs as an NSSM service (the plant, if it does)

NSSM redirects a service's streams itself; it does not need a shell. Run in an **elevated**
prompt, substituting the real service name for `cg-bridge`:

```powershell
nssm set cg-bridge AppStderr  C:\ProgramData\cg-bridge\bridge-stderr.log
nssm set cg-bridge AppStdout  C:\ProgramData\cg-bridge\bridge-stdout.log
nssm set cg-bridge AppRotateFiles 1
nssm set cg-bridge AppRotateOnline 1
nssm set cg-bridge AppRotateBytes 10485760
nssm restart cg-bridge
```

Then **read the value back** rather than trusting the exit code:

```powershell
nssm get cg-bridge AppStderr
```

⭐ **Put the log somewhere the SERVICE ACCOUNT can write.** A service under `LocalSystem` or a
dedicated account has no access to an operator's `C:\Users\<someone>\…`, and NSSM's failure to
open the file is itself silent — you get an empty log and no error, which reads exactly like a
quiet bridge. `C:\ProgramData\…` is writable by service accounts and survives a profile change.
**Verify by reading the file after the restart**, not by the absence of a complaint.

⚠ **Rotation is not optional on a machine that runs for weeks.** An unrotated `AppStderr` grows
without bound, and the disk it fills is the one CasparCG is playing from.

### Confirming capture actually works

Restart the bridge and check the file gained the boot lines:

```powershell
Get-Item $log | Select-Object Length, LastWriteTime
Get-Content $log -Tail 20
```

`WS listening on ws://…` and `template HTTP server on http://…` are the two lines every boot
writes, so their arrival — with **today's** timestamp — is the positive control that the
redirection is live rather than merely configured.

---

## Keeping this file honest

Every row above is dated and attributed to a host. **When a value changes, replace the row and
re-date it; do not add a second row and leave both standing** — two rows for one machine is how
the next reader picks the wrong log. A row nobody has measured says `unverified`, which is a
useful answer; a row someone guessed is worse than an empty table.
