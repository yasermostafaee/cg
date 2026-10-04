## MODIFIED Requirements

### Requirement: CI SHALL build three Windows installers, and drive them on clean runners

The project SHALL build, on `windows-latest`, an installer for CG Bridge (per machine: the service every
console connects to), one for CG Control (per user, no administrator: a console with no bridge and no
port) and one for CG Designer (per user, no administrator), and SHALL drive them on clean runners that
built nothing: CG Bridge's own lifecycle on one, and the two apps against an installed CG Bridge on
another. `CENTRAL-BRIDGE-01` §1 A, C, E. `INSTALLER-DESIGN-01`: each installer is CG Setup with the
product's NSIS installer — built as before — appended behind it as its engine; the smokes also run every
silent path against the engine alone and the installer, drive every page of each installer's setup window
through UI Automation, and capture them; a third job opens each setup window on Windows Server 2022 and
2025 before anything is installed.

#### Scenario: Three installers are produced

- **WHEN** the desktop workflow runs **THEN** the three installers are uploaded as artifacts, each named
  for the release, and their three engines as a separate artifact for the smokes

#### Scenario: The apps are driven against CG Bridge

- **WHEN** the apps' smoke runs **THEN** CG Bridge is installed first, CG Control is installed without
  administrator rights, and it connects to CG Bridge on the Playout's host

#### Scenario: The setup windows are driven

- **WHEN** the smokes run **THEN** each installer is installed through its window (Welcome, Location,
  Installing, Done), updated over an older release, and shown failing, each page captured

## ADDED Requirements

### Requirement: A silent install SHALL be the engine's own, argument for argument and exit code for exit code

An installer given `/S` SHALL show nothing, run its engine and exit with the engine's exit code. `/S` is
NSIS's own token — upper case, unquoted, on its own; for CG Control and CG Designer Tauri's `/P` is
passed on the same way. The engine (the product's NSIS installer, unchanged) is given the installer's own
command line after the program path exactly as given, `/D=` included. Every documented code stays the engine's: `0` done, `1` cancelled (an
interactive run only), `2` failed — `CG-BRIDGE-FOR-PLAYOUT.md` §2. The uninstallers are the engines' own.
Nothing is downloaded.

#### Scenario: The same arguments, the same codes

- **WHEN** CG Bridge's installer and its engine alone are each run with `/S /OSCPORT=6250` **THEN** both
  exit `2`
- **WHEN** each is run with `/S` **THEN** both exit `0`, and the uninstall line
  `uninstall.exe /S _?=<folder>` exits `0`
- **WHEN** CG Control's or CG Designer's installer and its engine are each run with `/S` over an installed
  copy **THEN** both exit `0`

#### Scenario: The command line is read as NSIS reads it

- **WHEN** the command line holds `"/S"` (quoted), `/s`, or `/SILENT` **THEN** it is not silent
- **WHEN** it holds `/D=C:\Program Files\CG Bridge` last **THEN** the folder runs to the end of the line,
  spaces and all, and the engine is given it unchanged

### Requirement: Each installer SHALL open a setup window of its own, in the product's own look

Run without `/S`, each installer SHALL open one frameless 800 × 520 window of its own — the system's
shadow, rounded corners on Windows 11 and a square edge on Windows 10, its own title bar with minimise and
close only, no resize and no maximise — with a step rail (Welcome → Location → Installing → Done: done
steps ticked, the current one marked, Help at its foot) on the splash's ground, and the page on the
sign-in card's surface and foot. Every colour SHALL be a console token or the splash's brand constant,
every face the one the splash and the sign-in card render with, every shape vector or a
multi-resolution source. The window SHALL carry no explanatory prose beyond the lines named below.

#### Scenario: Welcome

- **WHEN** an installer opens on a machine without the product **THEN** Welcome reads "Install
  <product>?", shows the product's tile, "Publisher: APASAI" and "Version <release>" (from
  `tools/release`), and two or three lines on what it installs — for CG Bridge "A Windows service · ports
  5280, 7911 · UDP 6251"
- **WHEN** Installed apps names an older release **THEN** Welcome reads "Update <product>?" and "Update
  from <old> to <new>. Your settings are kept."

#### Scenario: Location

- **WHEN** CG Control or CG Designer is installed for the first time **THEN** Location shows the folder
  with Change, the space needed and the space free
- **WHEN** the product is installed already, or is CG Bridge **THEN** the folder is a fact, not a control

#### Scenario: Installing

- **WHEN** the engine runs **THEN** the bar follows its real steps — never a timer — and the step is in
  words; Cancel is enabled only while the setup is still preparing

#### Scenario: Done and Error

- **WHEN** the engine exits `0` **THEN** Done reads "<product> is installed" (or "updated"), offers
  "Launch when ready" (CG Bridge: "Open CG Bridge status") and one primary, Finish — and Finish with the
  option ticked starts the app (opens `/health`)
- **WHEN** CG Bridge's engine warned **THEN** Done shows its first warning in one line, with "Open log"
- **WHEN** the engine fails, or the installer is damaged **THEN** Error gives the reason in words, "Open
  log" and Close, and Close exits `2`

### Requirement: The setup window SHALL answer the keyboard, the display's scale, reduced motion and UI Automation

The setup window SHALL move focus with Tab and Shift+Tab, press the page's primary with Enter and the
focused control with Space, cancel with Esc where Cancel is allowed, and draw the focus only once the
keyboard has moved it. It SHALL be per-monitor DPI aware and draw at the monitor's scale. Its page
entrance and its rail's tick SHALL animate, and SHALL NOT when Windows' "Animation effects" is off. Every
text and control of the page SHALL be in its UI Automation tree, named in the window's own words, with
Invoke, Toggle and RangeValue where they apply.

#### Scenario: The keyboard

- **WHEN** Welcome is open **THEN** Next has the focus, Tab moves it on, Shift+Tab back, Enter goes to
  Location, and Esc closes the window with exit code `1`

#### Scenario: 150 % and 200 %

- **WHEN** the display is scaled to 150 % (or 200 %) **THEN** the window is drawn 1200 (1600) pixels
  wide, sharp

### Requirement: The setup window's first screen SHALL NOT need WebView2

The setup window SHALL draw its first screen with Windows' own Direct2D, DirectWrite and DWM only. An
installer whose engine needs WebView2 (CG Control, CG Designer) SHALL leave installing it to the engine,
offline, as before.

#### Scenario: No WebView2

- **WHEN** WebView2 is made unavailable to every program by policy **THEN** each installer still opens
  Welcome, loads no WebView2 module, and loads Direct2D and DirectWrite (the control)

### Requirement: Each installer SHALL grow by at most 15 MB

Each installer SHALL be at most 15 MB larger than its engine (the installer as it was built before).

#### Scenario: The sizes

- **WHEN** the installers are packed **THEN** the log names each engine's size and each installer's, and
  the difference is under 15 MB
