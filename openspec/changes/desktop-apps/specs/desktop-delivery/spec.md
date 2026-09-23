## ADDED Requirements

### Requirement: CI builds two Windows installers

The project SHALL build, on `windows-latest`, an NSIS installer for CG Control (per-machine) and one
for CG Designer (per-user, no administrator), and SHALL install and drive both on a second, clean
runner.

#### Scenario: Both installers are produced

- **WHEN** the desktop workflow runs **THEN** both installers are uploaded as artifacts

### Requirement: CG Control starts its bridge and loads the console from it

CG Control SHALL start its bridge sidecar with every path under the user's own data folder, wait
until the bridge answers on `http://127.0.0.1:5174`, and then load the console from it; until then it
SHALL show a starting page, and on failure the sentence, who holds each port and the log's path.

#### Scenario: The installed sidecar answers

- **WHEN** CG Control starts **THEN** the bridge answering is the installed `cg-bridge.exe` **AND**
  the window loads the console from `http://127.0.0.1:5174`

### Requirement: CG Control leaves no bridge behind

CG Control SHALL stop its bridge when it closes, and a killed CG Control SHALL leave no bridge
running; a leftover bridge of this install found at start SHALL be stopped and started fresh.

#### Scenario: Close and kill

- **WHEN** CG Control is closed or killed **THEN** no `cg-bridge.exe` is left running

### Requirement: CG Control runs one instance

CG Control SHALL run a single instance; a second launch SHALL focus the open window.

#### Scenario: A second launch

- **WHEN** CG Control is launched again **THEN** one instance remains

### Requirement: The CG Control installer opens exactly the ports CasparCG needs

The CG Control installer SHALL add inbound firewall rules for UDP 6250 and TCP 7911 scoped to the
bridge sidecar's own path, and the uninstaller SHALL remove them.

#### Scenario: Install and uninstall

- **WHEN** CG Control is installed **THEN** both rules exist for `cg-bridge.exe` **AND WHEN** it is
  uninstalled **THEN** neither exists

### Requirement: The Playout address is written only by CG Control

The Playout target SHALL be written only by CG Control's own command, callable from the console the
bridge serves in CG Control's window, through the bridge CLI's one-shot writer — never over the
control socket.

#### Scenario: The door

- **WHEN** the console in CG Control sets the Playout address **THEN** the playout config holds the
  normalised address and no issuer **AND** the bridge restarts with it in force

### Requirement: The installers need no internet

Both installers SHALL install WebView2 with no internet, and both apps SHALL render Persian from
self-hosted fonts.

#### Scenario: An offline machine

- **WHEN** WebView2 is absent and there is no network **THEN** the installer installs it from its
  own copy
