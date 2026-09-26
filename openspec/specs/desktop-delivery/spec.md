# desktop-delivery Specification

## Purpose

TBD - created by archiving change desktop-apps. Update Purpose after archive.

## Requirements

### Requirement: CI builds two Windows installers

The project SHALL build, on `windows-latest`, an NSIS installer for CG Control (per-machine) and one
for CG Designer (per-user, no administrator), and SHALL install and drive both on a second, clean
runner.

#### Scenario: Both installers are produced

- **WHEN** the desktop workflow runs **THEN** both installers are uploaded as artifacts

### Requirement: CG Control starts its bridge and loads the console from it

CG Control SHALL start its bridge sidecar with every path under the user's own data folder, wait
until the bridge answers on `http://127.0.0.1:5174`, and then load the console from it. Until then
it SHALL show the console's own splash — ONE design from one source: the starting page SHALL be
composed at staging from the built console's `index.html` (its title, the splash's CSS and the
splash markup, byte for byte, build stamp included) and SHALL take none of that splash's clock. While
it waits, the splash's phase slot SHALL say what the window is waiting for; on failure the splash
SHALL show, inside itself, the sentence, who holds each port and the log's path, with its progress
hidden. When the console replaces the starting page inside CG Control, the console's splash SHALL
continue the one on screen — its entrance already over — while in a browser it SHALL make its
entrance as before.

#### Scenario: The installed sidecar answers

- **WHEN** CG Control starts **THEN** the bridge answering is the installed `cg-bridge.exe` **AND**
  the window loads the console from `http://127.0.0.1:5174`

#### Scenario: One splash from launch to ready

- **WHEN** CG Control starts **THEN** the window shows the console's splash, its phase reading
  `STARTING BRIDGE`, and the console's splash then continues it with no entrance replayed
- **WHEN** the bridge cannot be started **THEN** the sentence, the port holders and the log's path
  appear inside that splash
- **WHEN** the console is opened in a browser **THEN** its splash makes its entrance as before

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

### Requirement: The installed apps SHALL let HTML5 drag and drop reach the page

Every window of CG Control and CG Designer SHALL set `dragDropEnabled: false`, so that WebView2
delivers a drop to the page's HTML5 `dragover`/`drop` events instead of Tauri's native handler: an
asset dragged from the Designer's Assets panel onto the canvas, and a file dragged in from Explorer.

#### Scenario: Every window hands drops to the page

- **WHEN** the apps' window configuration is read
- **THEN** every window declares `dragDropEnabled: false`, and a window without the key is reported

### Requirement: Each app SHALL name itself once, in the window's title bar, with the Apasai logo

CG Control's window SHALL be titled `APASAI CG CONTROL` and CG Designer's `APASAI CG DESIGNER`, and
each page's `<title>` SHALL read the same. Their icons (title bar, taskbar, installer) and the pages'
favicon SHALL be made from the Apasai logo. Neither app SHALL render an in-app brand in its header or
landing page, and CG Control SHALL have no native menu bar. `productName`, the identifiers, the
installers' names and every state or log folder SHALL be unchanged.

#### Scenario: The title bar and the tab carry the name

- **WHEN** either app's window configuration and page are read
- **THEN** the title is `APASAI CG CONTROL` or `APASAI CG DESIGNER`, the favicon is the logo's icon,
  and `productName` and `identifier` are unchanged

#### Scenario: No second copy of the name

- **WHEN** CG Control's header or CG Designer's landing page renders
- **THEN** neither shows an in-app brand, and the header still shows the channel strip

### Requirement: CG Control's log folder SHALL be reachable from its console

The log folder (`bridge.log` and `amcp.log`) SHALL open from the audit log's `Open log folder`, inside
CG Control only, through the shell's own command; a console in a browser SHALL show no such control.

#### Scenario: Inside CG Control and in a browser

- **WHEN** the audit log opens inside CG Control
- **THEN** `Open log folder` is offered and opens it; in a browser the control is absent

### Requirement: Each installed app's window SHALL paint its splash's ground before any page does

CG Control's and CG Designer's windows SHALL declare, as their window and webview background, the
ground of the app's own splash, so that no white frame shows before the first page paints or, in CG
Control, while the starting page gives way to the console.

#### Scenario: No white frame

- **WHEN** either installed app opens its window **THEN** the window's background is its splash's
  ground, read from that splash
