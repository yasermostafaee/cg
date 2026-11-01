## Context

Fixed-file templates store a safe relative path. CG Bridge resolves that path below
`textSourceRoot`, whose installed default is `%ProgramData%\CG Bridge\text-sources`. Designer's
native picker may browse a different local or UNC folder, so successful authoring does not configure
the service that reads the file at runtime.

## Decisions

### 1. Configure one root per installed Bridge

CG Bridge Setup owns an optional **Shared text folder** value. It accepts an existing local or UNC
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

## Operational note

The Windows service account must be able to read the chosen folder. A local folder on the Bridge
server, shared to Designer workstations by UNC, is the most reliable deployment. If a remote UNC is
used directly, both share and NTFS permissions must permit the Bridge server/service identity.
