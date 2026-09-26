## ADDED Requirements

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
