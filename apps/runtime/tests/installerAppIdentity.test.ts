import { describe, expect, it } from 'vitest';
import {
  displayIconPath,
  identityChecks,
  parseIdentityRead,
  type AppIdentity,
} from './desktop/app-identity.mjs';

/**
 * 🔴 `RELEASE-091-01` §3 (`B-290`) — the installer smoke's judgement of each app's icon and taskbar
 * identity. The owner's `0.9.0` put ONE icon on both apps; every per-app check here would have passed
 * on it, which is why the CONTROLS — the two apps' values differ — are the checks this pins hardest.
 */

const CONTROL_EXE = 'C:\\Program Files\\CG Control\\cg-control.exe';
const DESIGNER_EXE = 'C:\\Users\\runner\\AppData\\Local\\CG Designer\\cg-designer.exe';

function app(over: Partial<AppIdentity> & Pick<AppIdentity, 'product'>): AppIdentity {
  const control = over.product === 'CG Control';
  const exe = control ? CONTROL_EXE : DESIGNER_EXE;
  const icon = control ? 'dark-tile' : 'light-tile';
  return {
    identifier: control ? 'app.cgbroadcast.control' : 'app.cgbroadcast.designer',
    exe,
    exeIcon: icon,
    shortcuts: [
      {
        path: `C:\\…\\Start Menu\\Programs\\${over.product}.lnk`,
        where: 'start',
        iconSource: exe,
        icon,
        aumid: control ? 'app.cgbroadcast.control' : 'app.cgbroadcast.designer',
        aumidVia: 'shortcut',
      },
    ],
    displayIcon: `"${exe}",0`,
    ...over,
  };
}

const failing = (apps: AppIdentity[]): string[] =>
  identityChecks(apps)
    .filter((c) => !c.ok)
    .map((c) => c.name);

describe('the installer smoke — each app its own icon and taskbar identity', () => {
  it('two apps, each with its own icon and id: every check passes', () => {
    const checks = identityChecks([
      app({ product: 'CG Control' }),
      app({ product: 'CG Designer' }),
    ]);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    // Every property is asked, per app, and the three controls.
    expect(checks.map((c) => c.name)).toEqual([
      "CG Control's exe carries an icon",
      'CG Control has a Start menu shortcut',
      "CG Control's start shortcut shows its own exe's icon",
      "CG Control's start shortcut carries its own AppUserModelID, app.cgbroadcast.control",
      "Installed apps shows CG Control with its own exe's icon",
      "CG Designer's exe carries an icon",
      'CG Designer has a Start menu shortcut',
      "CG Designer's start shortcut shows its own exe's icon",
      "CG Designer's start shortcut carries its own AppUserModelID, app.cgbroadcast.designer",
      "Installed apps shows CG Designer with its own exe's icon",
      "the two apps' exe icons differ (control)",
      "…their shortcuts' icons differ",
      '…and their AppUserModelIDs differ, so the taskbar never groups one under the other',
    ]);
  });

  it('🔴 THE 0.9.0 BUILD — one icon in both apps: only the controls fail, which is why they exist', () => {
    const same = 'apasai-logo';
    const control = app({ product: 'CG Control', exeIcon: same });
    const designer = app({ product: 'CG Designer', exeIcon: same });
    const withIcon = (a: AppIdentity): AppIdentity => ({
      ...a,
      shortcuts: a.shortcuts.map((s) => ({ ...s, icon: same })),
    });
    expect(failing([withIcon(control), withIcon(designer)])).toEqual([
      "the two apps' exe icons differ (control)",
      "…their shortcuts' icons differ",
    ]);
  });

  it('🔴 one AppUserModelID on both — the taskbar would group them — fails its own check and the control', () => {
    const control = app({ product: 'CG Control' });
    const designer = app({ product: 'CG Designer' });
    const shared: AppIdentity = {
      ...designer,
      shortcuts: designer.shortcuts.map((s) => ({ ...s, aumid: 'app.cgbroadcast.control' })),
    };
    expect(failing([control, shared])).toEqual([
      "CG Designer's start shortcut carries its own AppUserModelID, app.cgbroadcast.designer",
      '…and their AppUserModelIDs differ, so the taskbar never groups one under the other',
    ]);
  });

  it('a shortcut with no id, or none at all, never passes as "different"', () => {
    const designer = app({ product: 'CG Designer' });
    const noId: AppIdentity = {
      ...designer,
      shortcuts: designer.shortcuts.map((s) => ({ ...s, aumid: null, aumidVia: null })),
    };
    expect(failing([app({ product: 'CG Control' }), noId])).toContain(
      '…and their AppUserModelIDs differ, so the taskbar never groups one under the other',
    );
    const none: AppIdentity = { ...designer, shortcuts: [] };
    expect(failing([app({ product: 'CG Control' }), none])).toEqual([
      'CG Designer has a Start menu shortcut',
      "…their shortcuts' icons differ",
      '…and their AppUserModelIDs differ, so the taskbar never groups one under the other',
    ]);
  });

  it('a shortcut showing another icon than its exe, and Installed apps naming the other exe, each fail', () => {
    const designer = app({ product: 'CG Designer' });
    const wrong: AppIdentity = {
      ...designer,
      shortcuts: designer.shortcuts.map((s) => ({ ...s, icon: 'something-else' })),
      displayIcon: `"${CONTROL_EXE}",0`,
    };
    expect(failing([app({ product: 'CG Control' }), wrong])).toEqual([
      "CG Designer's start shortcut shows its own exe's icon",
      "Installed apps shows CG Designer with its own exe's icon",
    ]);
  });

  it('an exe the shell reads no icon from fails, and cannot pass the control', () => {
    expect(
      failing([app({ product: 'CG Control', exeIcon: null }), app({ product: 'CG Designer' })]),
    ).toEqual([
      "CG Control's exe carries an icon",
      "CG Control's start shortcut shows its own exe's icon",
      "the two apps' exe icons differ (control)",
    ]);
  });
});

describe('what the Windows reads hand back', () => {
  it('reads a DisplayIcon value in each spelling Windows stores', () => {
    expect(displayIconPath(`"${CONTROL_EXE}",0`)).toBe(CONTROL_EXE);
    expect(displayIconPath(`${CONTROL_EXE},0`)).toBe(CONTROL_EXE);
    expect(displayIconPath(`"${CONTROL_EXE}"`)).toBe(CONTROL_EXE);
    expect(displayIconPath(CONTROL_EXE)).toBe(CONTROL_EXE);
    expect(displayIconPath(null)).toBeNull();
    expect(displayIconPath('  ')).toBeNull();
  });

  it('normalises PowerShell’s JSON: one shortcut comes back as an object, none as null', () => {
    const one = parseIdentityRead(
      JSON.stringify({
        exeIcon: 'abc',
        shortcuts: {
          path: 'x.lnk',
          where: 'start',
          iconSource: 'x.exe',
          icon: 'abc',
          aumid: 'id',
          aumidVia: 'shortcut',
        },
      }),
    );
    expect(one.shortcuts).toHaveLength(1);
    expect(parseIdentityRead(JSON.stringify({ exeIcon: null, shortcuts: null }))).toEqual({
      exeIcon: null,
      shortcuts: [],
    });
    // An empty id is no id.
    const blank = parseIdentityRead(
      JSON.stringify({
        exeIcon: '',
        shortcuts: [
          {
            path: 'x.lnk',
            where: 'desktop',
            iconSource: null,
            icon: '',
            aumid: '',
            aumidVia: null,
          },
        ],
      }),
    );
    expect(blank.exeIcon).toBeNull();
    expect(blank.shortcuts[0]).toMatchObject({ where: 'desktop', icon: null, aumid: null });
  });
});
