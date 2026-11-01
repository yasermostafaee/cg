## Context

Fixed-file templates store a safe relative path. CG Bridge resolves that path below
`textSourceRoot`, whose installed default is `%ProgramData%\CG Bridge\text-sources`. Designer's
native picker may browse a different local or UNC folder, so successful authoring does not configure
the service that reads the file at runtime.

## Decisions

### 1. Configure one root per installed Bridge

CG Bridge Setup owns an optional **Shared files folder** value. It accepts an existing local or UNC
folder through a native folder picker or text field and passes it as `/TEXTSOURCEROOT=`. The Bridge
installer writes it through the existing `--write-service-config` schema path. No customer path is
compiled into any binary.

### 2. Keep templates relative and portable

Designer continues to save only `zirnevis.txt` (or another safe relative name), even when the author
browsed `\\server\share\zirnevis.txt`. CG Control sends that relative name to Bridge; Bridge alone
combines it with its configured root. This preserves traversal containment and lets the same template
move between stations.

### 3. Preserve upgrades and silent administration

Setup reads an existing `textSourceRoot` into the field. Windowed installs pass the selected value;
silent installs accept `/TEXTSOURCEROOT=<folder>`. Omitting it keeps the existing configuration, and
a first install with no value retains the private default.

### 4. Prove access as the service, not as Setup

For a configured local folder, the Bridge installer grants `NT SERVICE\CGBridge` inherited
read/execute access to the folder and its current and future children. It reads the effective root
back from `cg-bridge.json`, so an upgrade without `/TEXTSOURCEROOT=` repairs a missing grant as well.
The installer adds this narrow grant and does not replace the producer's existing ACL or grant the
service write/modify/full control.

The operator-facing name is intentionally broader than the persisted compatibility key
`textSourceRoot`; the current reader remains fixed text files, while the setup wording does not
promise that the folder can never host another supported shared-asset class.

A direct remote UNC has two independent permission layers on another server: share and NTFS. The
local installer does not mutate either one. It warns the administrator to grant the Bridge server's
computer account Read in both layers. This keeps UNC support station-independent without pretending
that a successful browse under the administrator's identity proves service access.

### 5. Change the path from the server that owns it

CG Control Station setup exposes the effective path as a Bridge-server path, not a client-side
folder picker: the console may be on another computer, so browsing its filesystem would choose the
wrong machine. `sharedFiles.get` is a read; `sharedFiles.set` is station-admin only. The Bridge
validates existence and read access using its own process/service identity before changing memory or
the installed config. A rejected path leaves both unchanged and names the local Setup or remote
share/NTFS permission remedy.

## Operational note

The preferred layout is a local folder on the Bridge server, shared to Designer workstations by UNC.
Bridge is configured with the local path while Designer browses the share; the template remains
portable because it stores only the relative filename.
