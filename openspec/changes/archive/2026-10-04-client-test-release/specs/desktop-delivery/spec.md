## ADDED Requirements

### Requirement: CG Control, CG Designer and the bridge SHALL carry one release version

The three parts a client installs SHALL carry one release version — three numbers, never the `0.0.0`
placeholder — in every file that writes it: each app's `package.json`, `src-tauri/tauri.conf.json`
and `src-tauri/Cargo.toml`, their two entries in the workspace `Cargo.lock`, and the bridge's
`package.json`. The installer build SHALL read all of them and SHALL stop when they disagree. Each
installer SHALL be named for that version, Windows SHALL list each app under Installed apps with it,
and the bridge's first line at every start SHALL name it.

#### Scenario: The files agree, and the build reads them

- **WHEN** the installers are built
- **THEN** the build reads one version from all nine files and both installers carry it in their
  names (`CG Control_<version>_x64-setup.exe`, `CG Designer_<version>_x64-setup.exe`)

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

### Requirement: Each app SHALL name its release in one line

CG Control SHALL show `Version <release>` at the foot of Station setup's rail, and CG Designer on its
start screen under the line that says what the page is for. Each line SHALL be a fact rendered through
the app's `Tag` — not focusable, not a control — with the exact build (`<version> · <sha> · <date>`,
the build stamp's) in its `title`, and SHALL read the same build stamp the splash reads.

#### Scenario: CG Control

- **WHEN** an operator opens Station setup, on any section
- **THEN** the rail's foot reads `Version <release>` under the station it is pointed at, inside the
  dialog

#### Scenario: CG Designer

- **WHEN** CG Designer opens on its start screen
- **THEN** the line under "Broadcast template builder — …" reads `Version <release>`, above
  `New project`

### Requirement: The installers SHALL carry no private address and no test secret

Nothing either installer ships SHALL carry a private (RFC 1918) IPv4 address or a secret the test
suites use. The installer workflow SHALL scan every text file CG Control's payload, its starting page
and CG Designer's `dist` hold before either installer is built, and SHALL stop on any hit. An example
address in the apps' copy SHALL be a documentation address (RFC 5737).

#### Scenario: A leak stops the build

- **WHEN** a text file the installers are built from carries a private address or a test secret
- **THEN** the build stops, naming the file, the line and what was found

#### Scenario: What passes

- **WHEN** a file carries only loopback, `0.0.0.0`, a documentation address or a public address
- **THEN** the scan passes it

### Requirement: A release SHALL come with a Persian install guide

Each release SHALL carry a Persian install guide for a client installing alone: its source under
`docs/release/<version>/install-guide.fa.md`, built by Chromium into a PDF from the repo's own
Vazirmatn, right to left, about two pages. It SHALL name buttons and menus exactly as the apps show
them, in their own language; SHALL use screenshots taken from the real apps by the e2e harness, with no
real address, token or password in them; and SHALL mark every Playout-side step our records do not file
`[confirm with the Playout team]`.

#### Scenario: The guide is built

- **WHEN** a release is cut
- **THEN** the PDF is built from the source and carries its sections in order: the package, the needs,
  installing CG Control, the first run, CG Designer, reporting a problem, the known limits

### Requirement: A version tag SHALL open a draft release holding exactly its installers, the sums and the guide

A pushed tag `v<version>` SHALL build the installers from the tagged commit, SHALL refuse a tag that
does not name the parts' version, SHALL run the clean-Windows smokes, and only then SHALL create a DRAFT
pre-release holding exactly: the installers, `SHA256SUMS.txt` (the SHA-256 of every other file), and
the install guide PDF. CI SHALL never publish it. (Amended 2026-09-30, `CENTRAL-BRIDGE-01`: written for
the two apps' installers — four files; from `0.10.0` CG Bridge's installer joins them, five files, and
the draft also waits for CG Bridge's own smoke. `tools/release/src/release-files.mjs` names them.)

#### Scenario: The tag names the release

- **WHEN** `v<version>` is pushed and the smokes pass
- **THEN** a draft pre-release `v<version>` holds exactly those files — five from `0.10.0`

#### Scenario: A wrong tag is refused

- **WHEN** a tag names another version than the parts carry
- **THEN** no installer is built and no release is created
