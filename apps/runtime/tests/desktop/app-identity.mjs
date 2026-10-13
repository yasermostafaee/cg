/**
 * 🔴 `RELEASE-091-01` §3 (`B-290`) — **EACH APP ITS OWN ICON, AND NEVER THE OTHER'S TASKBAR GROUP**,
 * judged from what Windows reads on the clean runner after both installs: the icon inside each
 * installed exe (the title bar, the taskbar and Alt+Tab draw the window's icon, which Tauri builds from
 * the same `bundle.icon`), the icon and the AppUserModelID of every shortcut the installer wrote (Start
 * and the desktop — the taskbar groups by that id), and the icon Installed apps shows.
 *
 * The owner's `0.9.0` showed ONE icon for both apps: all five icon files had been byte-identical since
 * `f9c9b816`. Every check below would have passed per app on that build — each shortcut did show its
 * own exe's icon — so the checks that matter are the CONTROLS at the end: the two apps' values DIFFER.
 *
 * Pure and dependency-free: the smoke runs it on the clean runner (sparse checkout of this folder), and
 * `tests/installerAppIdentity.test.ts` proves each check refuses what it should.
 */

/**
 * The file an Installed-apps `DisplayIcon` value names: `"C:\…\app.exe",0` → `C:\…\app.exe`. `null` for
 * no value.
 */
export function displayIconPath(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const quoted = /^"([^"]*)"(?:,\s*-?\d+)?$/.exec(trimmed);
  if (quoted !== null) return quoted[1] ?? null;
  return trimmed.replace(/,\s*-?\d+$/, '').trim();
}

/**
 * What the smoke's PowerShell read printed — `{ exeIcon, shortcuts }` — normalised: PowerShell hands a
 * one-element array back as a bare object, and none as `null`.
 */
export function parseIdentityRead(text) {
  const read = JSON.parse(text);
  const list = read.shortcuts;
  const shortcuts = Array.isArray(list) ? list : list === null || list === undefined ? [] : [list];
  return {
    exeIcon: typeof read.exeIcon === 'string' && read.exeIcon !== '' ? read.exeIcon : null,
    shortcuts: shortcuts.map((s) => ({
      path: String(s.path),
      where: s.where === 'desktop' ? 'desktop' : 'start',
      iconSource: s.iconSource === null || s.iconSource === undefined ? null : String(s.iconSource),
      icon: typeof s.icon === 'string' && s.icon !== '' ? s.icon : null,
      aumid: typeof s.aumid === 'string' && s.aumid !== '' ? s.aumid : null,
      aumidVia: s.aumidVia === null || s.aumidVia === undefined ? null : String(s.aumidVia),
    })),
  };
}

const shortcutIcons = (app) => [...new Set(app.shortcuts.map((s) => s.icon))];
const shortcutIds = (app) => [...new Set(app.shortcuts.map((s) => s.aumid))];
/** Every value present, and none shared with the other app's. */
const disjoint = (mine, theirs) =>
  mine.length > 0 &&
  theirs.length > 0 &&
  mine.every((v) => v !== null) &&
  theirs.every((v) => v !== null) &&
  mine.every((v) => !theirs.includes(v));

/**
 * Every check, as `{ name, ok, detail }` — one per app per property, then the controls that the two
 * apps differ. `apps` is each app as read: `{ product, identifier, exe, exeIcon, shortcuts,
 * displayIcon }`.
 */
export function identityChecks(apps) {
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
  };
  for (const app of apps) {
    check(
      `${app.product}'s exe carries an icon`,
      app.exeIcon !== null,
      `${app.exe} ${String(app.exeIcon)}`,
    );
    check(
      `${app.product} has a Start menu shortcut`,
      app.shortcuts.some((s) => s.where === 'start'),
      app.shortcuts.map((s) => s.path).join(' | '),
    );
    for (const s of app.shortcuts) {
      check(
        `${app.product}'s ${s.where} shortcut shows its own exe's icon`,
        s.icon !== null && s.icon === app.exeIcon,
        `${String(s.iconSource)} ${String(s.icon)}`,
      );
      check(
        `${app.product}'s ${s.where} shortcut carries its own AppUserModelID, ${app.identifier}`,
        s.aumid === app.identifier,
        `${String(s.aumid)} (read via ${String(s.aumidVia)})`,
      );
    }
    const shown = displayIconPath(app.displayIcon);
    check(
      `Installed apps shows ${app.product} with its own exe's icon`,
      shown !== null && shown.toLowerCase() === app.exe.toLowerCase(),
      String(app.displayIcon),
    );
  }
  const [a, b] = apps;
  if (a !== undefined && b !== undefined) {
    // THE CONTROLS — the reason for all of the above. `0.9.0` passed every per-app check and failed these.
    check(
      `the two apps' exe icons differ (control)`,
      a.exeIcon !== null && b.exeIcon !== null && a.exeIcon !== b.exeIcon,
      `${a.product} ${String(a.exeIcon)} / ${b.product} ${String(b.exeIcon)}`,
    );
    check(
      `…their shortcuts' icons differ`,
      disjoint(shortcutIcons(a), shortcutIcons(b)),
      `${shortcutIcons(a).join(',')} / ${shortcutIcons(b).join(',')}`,
    );
    check(
      `…and their AppUserModelIDs differ, so the taskbar never groups one under the other`,
      disjoint(shortcutIds(a), shortcutIds(b)),
      `${shortcutIds(a).join(',')} / ${shortcutIds(b).join(',')}`,
    );
  }
  return checks;
}
