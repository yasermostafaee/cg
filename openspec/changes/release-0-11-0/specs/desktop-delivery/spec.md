## MODIFIED Requirements

### Requirement: CG Control, CG Designer and the bridge SHALL carry one release version

The three parts a client installs SHALL carry one release version — three numbers, never the `0.0.0`
placeholder — in every file that writes it: each app's `package.json`, `src-tauri/tauri.conf.json`
and `src-tauri/Cargo.toml`, their two entries in the workspace `Cargo.lock`, and the bridge's
`package.json`. The version SHALL be set in all of them by one command
(`tools/release/src/release-version.mjs --set <version>`), which changes nothing but the version and
refuses a file it finds no version in. The installer build SHALL read all of them and SHALL stop when
they disagree. Each installer SHALL be named for that version, Windows SHALL list each app under
Installed apps with it, and the bridge's first line at every start SHALL name it.

#### Scenario: The files agree, and the build reads them

- **WHEN** the installers are built
- **THEN** the build reads one version from all nine files and both installers carry it in their
  names (`CG Control_<version>_x64-setup.exe`, `CG Designer_<version>_x64-setup.exe`)

#### Scenario: One command sets it

- **WHEN** `release-version.mjs --set 0.11.0` runs
- **THEN** all nine read `0.11.0`, and every other line of every file is unchanged

#### Scenario: One file drifting stops the build

- **WHEN** one of the nine files carries another version
- **THEN** the build stops, naming every file and the version it carries

#### Scenario: Installed apps

- **WHEN** CG Control is installed (per machine) and CG Designer (per user)
- **THEN** Windows lists each under Installed apps with the release version
- **AND WHEN** CG Control is uninstalled **THEN** it is no longer listed

#### Scenario: The bridge names its version first

- **WHEN** the bridge starts — including a start it then refuses
- **THEN** its first line is `[caspar-bridge] bridge <version> starting (node <version>, pid <n>)`
- **AND** the one-shot `--set-playout-address`, whose last line the shell reads, prints no such line

### Requirement: A release SHALL come with a Persian install guide

Each release SHALL carry a Persian install guide for a client installing alone: its source under
`docs/release/<version>/install-guide.fa.md`, built by Chromium into a PDF from the repo's own
Vazirmatn, right to left, a few pages. It SHALL name buttons and menus exactly as the apps show
them, in their own language — each one checked against the source that renders it; SHALL use at most
six pictures, taken from the real apps and installers of that release, with no real address, token or
password in them; and SHALL mark every Playout-side step our records do not file
`[confirm with the Playout team]`.

#### Scenario: The guide is built

- **WHEN** a release is cut
- **THEN** the PDF is built from the source and carries its sections in order: the package, the needs,
  installing CG Bridge, installing CG Control, the first run, CG Designer, CG Control's messages,
  reporting a problem, the known limits

#### Scenario: Its words are the apps'

- **WHEN** an app renames a label the guide quotes
- **THEN** the guide's test fails, naming the label and the file that renders it

### Requirement: A version tag SHALL open a draft release holding exactly its installers, the sums and the guide

A pushed tag `v<version>` SHALL build the installers from the tagged commit, SHALL refuse a tag that
does not name the parts' version, SHALL run the clean-Windows smokes and the release acceptances, and
only then SHALL create a DRAFT pre-release titled `APASAI CG <version>` holding exactly: the installers,
`SHA256SUMS.txt` (the SHA-256 of every other file), and the install guide PDF. CI SHALL never publish it.
(Amended 2026-09-30, `CENTRAL-BRIDGE-01`: written for the two apps' installers — four files; from
`0.10.0` CG Bridge's installer joins them, five files, and the draft also waits for CG Bridge's own
smoke. Amended 2026-10-04, `RELEASE-0110-01`: the draft also waits for both release acceptances, and no
longer says "test build" — `0.11.0` is the client's. `tools/release/src/release-files.mjs` names them.)

#### Scenario: The tag names the release

- **WHEN** `v<version>` is pushed and the smokes and the acceptances pass
- **THEN** a draft pre-release `v<version>`, titled `APASAI CG <version>`, holds exactly those files —
  five from `0.10.0`

#### Scenario: A wrong tag is refused

- **WHEN** a tag names another version than the parts carry
- **THEN** no installer is built and no release is created

## ADDED Requirements

### Requirement: A release SHALL be accepted on clean Windows before its draft opens

The installer workflow SHALL accept each release on fresh Windows runners, with CG Bridge talking to a
fake Playout and to CasparCG's stand-in, whose received AMCP lines it reads back:

- the three installers in the guide's order — CG Bridge, CG Control, CG Designer — each through its
  setup window, with the runner's network cut for the installs (a positive control proves the cut);
- the INSTALLED CG Control driven end to end against the INSTALLED CG Bridge: the Playout's address, a
  station admin's sign-in, channel 2, CG Bridge signed in, a take that reads ON AIR and reaches
  CasparCG, and a clear that takes it off air;
- the real upgrade from the release the owner and the test plant hold (`0.10.0`, from its own draft's
  installers), with a row ON AIR: each installer's Welcome reads `Update from <old> to <new>. Your
settings are kept.`, its silent upgrade (`/S`) exits 0, and the service's account, start type and
  recovery, CG Bridge's configuration and session, CG Control's station record and the row ON AIR are
  all kept — with no `CLEAR`, `CG STOP` or `MIXER CLEAR` of that row reaching CasparCG;
- the uninstall of all three: the service, its firewall rules and the shortcuts gone; per-user data and
  CG Bridge's configuration kept.

#### Scenario: Offline, in the guide's order

- **WHEN** the three are installed through their windows with the network cut
- **THEN** each Done page says it is installed, each exits 0, and Installed apps names the release

#### Scenario: End to end

- **WHEN** CG Control is driven against the installed CG Bridge and the fake Playout
- **THEN** the row reads ON AIR, CasparCG holds the graphic, and after the clear the row reads off air
  and CasparCG was told

#### Scenario: The upgrade keeps what is on air

- **WHEN** each `0.11.0` installer runs over the classic `0.10.0` with a row ON AIR
- **THEN** nothing on air is cleared (control: CasparCG heard the upgraded CG Bridge), and the upgraded
  CG Control shows the row ON AIR without asking its first question again

### Requirement: The built installers SHALL carry no token and no dev-only code

Beyond the scan of what the installers are built from, the workflow SHALL open each BUILT installer's
engine and read every text file it holds, and read CG Setup's own front end for its strings, for a
private address, a test secret, a signed token's shape, and dev-only code — the development station's
flags (`--fake`, `--caspar`, `--playout-only`) and the test suite's fakes, by the names they carry. A
flag the product owns (`--caspar-host`) SHALL pass.

#### Scenario: A leak inside a built installer stops the build

- **WHEN** a file inside an installer carries a token or a dev-only marker
- **THEN** the build stops, naming the file, the line and what was found
