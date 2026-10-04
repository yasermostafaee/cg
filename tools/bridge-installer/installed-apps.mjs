import { execFileSync } from 'node:child_process';

/**
 * 🔴 `RELEASE-0112-01-C` C1 — **CG BRIDGE'S INSTALLED-APPS ROW IS A CONTRACT WITH THE PLAYOUT'S ENGINE
 * INSTALLER.** Their `2.9.4` reads it to decide whether to run our file at all
 * (`PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §2): the row whose `DisplayName` is `CG Bridge`, its
 * `DisplayVersion`, in BOTH the 64-bit and the 32-bit registry views — and it leaves an installed CG
 * Bridge alone when that version is the same or newer, or cannot be read.
 *
 * This is the ONE reader the smoke and the release acceptance pin it with: every row in either view whose
 * `DisplayName` resembles `CG Bridge` (so a second, near-miss row is SEEN, never skipped), with its view,
 * its key and its two values exactly as written.
 */

/** The two views the Playout's installer reads, as a 64-bit PowerShell addresses them. */
export const UNINSTALL_VIEWS = [
  ['64-bit', 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'],
  ['32-bit', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'],
];

/** The pinned row: exactly this name, a `major.minor.patch` version, the 64-bit view (`SetRegView 64`). */
export const CG_BRIDGE_DISPLAY_NAME = 'CG Bridge';
export const CG_BRIDGE_VIEW = '64-bit';

/**
 * Every Installed-apps row in either view whose `DisplayName` contains "CG Bridge" (case-insensitive),
 * as `{ view, key, displayName, displayVersion }`. Single quotes only: argv carries it to PowerShell.
 */
export function cgBridgeRows() {
  const views = UNINSTALL_VIEWS.map(([view, at]) => `@('${view}','${at}')`).join(',');
  const json = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$out = @(); foreach ($v in @(${views})) { ` +
        `Get-ChildItem -Path $v[1] -ErrorAction SilentlyContinue | ForEach-Object { ` +
        `$p = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue; ` +
        `if ($p -and ([string]$p.DisplayName) -like '*CG Bridge*') { ` +
        `$out += [pscustomobject]@{ view = $v[0]; key = $_.PSChildName; ` +
        `displayName = [string]$p.DisplayName; displayVersion = [string]$p.DisplayVersion } } } }; ` +
        `ConvertTo-Json -Compress -Depth 3 -InputObject @($out)`,
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
  const parsed = JSON.parse(json === '' ? '[]' : json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Pin the row as the Playout's installer reads it, after an install or an upgrade: exactly ONE row, its
 * `DisplayName` exactly `CG Bridge`, its `DisplayVersion` the release in `major.minor.patch`, in the 64-bit
 * view. Any change to these fails. Answers the rows (for the evidence file).
 */
export function checkInstalledAppsRow(check, release, when) {
  const rows = cgBridgeRows();
  const row = rows[0];
  check(
    `${when}: exactly one Installed-apps row named like "CG Bridge" (both views)`,
    rows.length === 1,
    JSON.stringify(rows),
  );
  check(
    `${when}: its DisplayName is exactly "${CG_BRIDGE_DISPLAY_NAME}"`,
    row?.displayName === CG_BRIDGE_DISPLAY_NAME,
    String(row?.displayName),
  );
  check(
    `${when}: its DisplayVersion is ${String(release)}, major.minor.patch`,
    row?.displayVersion === release && /^\d+\.\d+\.\d+$/.test(String(row?.displayVersion)),
    String(row?.displayVersion),
  );
  check(
    `${when}: it is in the ${CG_BRIDGE_VIEW} registry view (HKLM\\…\\Uninstall\\${String(row?.key)})`,
    row?.view === CG_BRIDGE_VIEW,
    String(row?.view),
  );
  return rows;
}
