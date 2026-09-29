# desktop-delivery

## ADDED Requirements

### Requirement: Each app SHALL show its own icon wherever Windows draws it

CG Control and CG Designer SHALL each carry their own icon set — CG Control the dark Apasai tile, CG
Designer the light one — so that the taskbar, Alt+Tab, the title bar, the Start menu, the desktop shortcut
and Installed apps each show that app's own icon, and the two apps never share one there. Each app's
shortcuts SHALL carry its own AppUserModelID (its bundle identifier), so the two never group together in
the taskbar. The clean-Windows smoke SHALL read each installed exe's icon resource, each shortcut's icon
and each shortcut's AppUserModelID (Start and the desktop, all users and the current user), and each
Installed-apps entry's icon, and SHALL fail when the two apps' values are equal. The identifier each
shortcut must carry SHALL be read from the app's own `tauri.conf.json`, never restated in the smoke.

#### Scenario: Two installed apps

- **WHEN** both installers have run on a clean Windows **THEN** CG Control's exe icon, its shortcut's icon
  and its shortcut's AppUserModelID each differ from CG Designer's

#### Scenario: Each app's own

- **WHEN** the smoke reads either app **THEN** each of its shortcuts shows its own exe's icon and carries
  its own bundle identifier, and Installed apps shows its own exe's icon
- **WHEN** both apps embed one icon, as `0.9.0` did **THEN** the per-app checks pass and the controls fail

### Requirement: The release's SHA256SUMS.txt SHALL be the only one, and SHALL match its assets

A CI build of the installers SHALL NOT carry a `SHA256SUMS.txt` in its artifacts, so the only file of that
name is the release's. After the draft release is created, the release job SHALL check its
`SHA256SUMS.txt` against the uploaded assets: every line SHALL name an asset of the release by its exact
name, every asset but the sums SHALL have a line, and each hash SHALL match the file uploaded — and
GitHub's own digest of that asset when it reports one. Any mismatch SHALL fail the job.

#### Scenario: The names match

- **WHEN** `v<version>` is released **THEN** each line of `SHA256SUMS.txt` names one of the three other
  assets exactly, with its hash

#### Scenario: A wrong name fails

- **WHEN** a line names a file the release does not hold (for example `CG Control_<v>_x64-setup.exe`,
  with a space) **THEN** the check fails, naming the line
