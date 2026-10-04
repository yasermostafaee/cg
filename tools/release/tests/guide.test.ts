import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIRM_MARKER, inline, markdownToHtml } from '../src/markdown.mjs';
import { REPO, guideHtml, pdfPageCount } from '../src/build-guide.mjs';
import { releaseFiles } from '../src/release-files.mjs';
import { releaseVersion } from '../src/release-version.mjs';
import { findingsIn } from '../src/scan-payload.mjs';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B3 — **THE PERSIAN INSTALL GUIDE**, its source and how it is built.
 *
 * The guide is a STRING deliverable a client follows alone, so the compiler can guard none of it
 * (golden rule 9). What can drift is pinned here: its sections and their order, the release it names,
 * the pictures it embeds, and — the one most likely to rot — every button and menu name it quotes,
 * each checked against the source that renders it. A label renamed in an app reddens this test,
 * which is where the guide's copy of it lives.
 */

const VERSION = releaseVersion(REPO);
const GUIDE = path.join(REPO, 'docs', 'release', VERSION, 'install-guide.fa.md');
const source = fs.readFileSync(GUIDE, 'utf8');
/** The pictures the guide embeds, by source — every figure line. */
const PICTURES = [...source.matchAll(/^!\[[^\]]*\]\(([^)\s]+)/gm)].map((m) => m[1] ?? '');

/**
 * What the guide quotes (backticked, so isolated LTR), and the file that renders it. `text` is the
 * source's spelling where CSS changes the case on screen (`PLAYOUT` is the heading `Playout`).
 */
const LABELS: readonly { shown: string; text?: string; file: string }[] = [
  // `CENTRAL-BRIDGE-01` — the splash says the console is connecting; it starts no bridge.
  { shown: 'CONNECTING', text: "phase('CONNECTING')", file: 'apps/runtime/src/renderer/main.tsx' },
  {
    shown: 'Set up CG Control',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  // `CENTRAL-BRIDGE-01` (D8) — CG Control's first question, and where a separate server goes.
  {
    shown: 'Playout address',
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutAddressGate.tsx',
  },
  {
    shown: 'CG Bridge address',
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutAddressGate.tsx',
  },
  // `CENTRAL-BRIDGE-01` §1 C — the lines a console shows, each with what to do.
  {
    shown: 'CG Bridge not reachable at',
    file: 'apps/runtime/src/renderer/features/status/ConnectionBanner.tsx',
  },
  {
    shown: 'nothing is listening on port',
    file: 'apps/runtime/src/renderer/hooks/useBridgeReachability.ts',
  },
  {
    shown: 'does not answer (switched off, a wrong address, or a firewall)',
    file: 'apps/runtime/src/renderer/hooks/useBridgeReachability.ts',
  },
  {
    shown: 'something there answers, but not as CG Bridge',
    file: 'apps/runtime/src/renderer/hooks/useBridgeReachability.ts',
  },
  {
    shown: 'Set up again',
    file: 'apps/runtime/src/renderer/features/status/ConnectionBanner.tsx',
  },
  {
    shown: 'CG Bridge needs a station admin to sign in',
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
  {
    shown: 'Sign in CG Bridge…',
    file: 'apps/runtime/src/renderer/features/status/BridgeSessionBanner.tsx',
  },
  {
    shown: 'CG Bridge:',
    text: 'CG Bridge: <bdi>',
    file: 'apps/runtime/src/renderer/features/status/BridgeSessionBanner.tsx',
  },
  {
    shown: 'are different releases',
    file: 'packages/shared-ipc/src/channels/capabilities.ts',
  },
  // `CENTRAL-BRIDGE-01` — the gate's Connect (the station's Playout is checked on open, unpressed).
  {
    shown: 'Connect',
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutAddressGate.tsx',
  },
  // `CONSOLE-POLISH-01` (`R-080`) — CG Control's first question: CG Bridge's address may stay empty.
  {
    shown: 'Found automatically',
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutAddressGate.tsx',
  },
  // `CONSOLE-POLISH-01` (`R-081`) — the check in four groups, the sign-in the gate between them.
  { shown: 'Reachable', text: "title: 'Reachable'", file: 'packages/shared-ipc/src/channels/setup.ts' },
  { shown: 'Versions', text: "title: 'Versions'", file: 'packages/shared-ipc/src/channels/setup.ts' },
  { shown: 'Sign-in', text: "title: 'Sign-in'", file: 'packages/shared-ipc/src/channels/setup.ts' },
  {
    shown: 'After sign-in',
    text: "title: 'After sign-in'",
    file: 'packages/shared-ipc/src/channels/setup.ts',
  },
  {
    shown: 'SIGN IN',
    text: '>Sign in<',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  { shown: 'Username', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Password', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Sign in', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'waiting for approval', file: 'tools/caspar-bridge/src/connection-check.ts' },
  {
    shown: 'CHANNEL',
    text: '>Channel<',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  // `R-081` — Station setup runs the same check again: SETTINGS → Servers → Playout → Check.
  { shown: 'Servers', text: "title: 'Servers'", file: 'apps/runtime/src/renderer/features/stationSetup/sections.ts' },
  {
    shown: 'Playout',
    text: '<span className="cg-card__title">Playout</span>',
    file: 'apps/runtime/src/renderer/features/stationSetup/StationSetupDialog.tsx',
  },
  {
    shown: 'Check',
    text: "'Checking…' : 'Check'",
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutConnection.tsx',
  },
  // `INSTALLER-DESIGN-01` (`P-063`) — the setup window every installer opens: its pages and buttons.
  { shown: 'Install CG Bridge?', text: 'format!("Install {name}?")', file: 'tools/setup-ui/src/model.rs' },
  { shown: 'Install CG Control?', text: 'format!("Install {name}?")', file: 'tools/setup-ui/src/model.rs' },
  { shown: 'Install CG Designer?', text: 'format!("Install {name}?")', file: 'tools/setup-ui/src/model.rs' },
  { shown: 'Next', text: '"Next"', file: 'tools/setup-ui/src/layout.rs' },
  { shown: 'Install', text: '"Install"', file: 'tools/setup-ui/src/layout.rs' },
  { shown: 'Finish', text: '"Finish"', file: 'tools/setup-ui/src/layout.rs' },
  { shown: 'Launch when ready', file: 'tools/setup-ui/src/product.rs' },
  { shown: 'Open CG Bridge status', file: 'tools/setup-ui/src/product.rs' },
  // `RELEASE-0111-01` Part A (`P-065`) — CG Bridge's Playout page: the checkbox and its three fields.
  // The window draws a field's label in capitals; `server.rs` spells it in sentence case.
  { shown: 'Playout', text: 'Page::Server => "Playout".into()', file: 'tools/setup-ui/src/model.rs' },
  {
    shown: 'CG Bridge runs on a separate server (not on the Playout machine)',
    file: 'tools/setup-ui/src/server.rs',
  },
  { shown: 'PLAYOUT ADDRESS', text: '"Playout address"', file: 'tools/setup-ui/src/server.rs' },
  {
    shown: 'CASPARCG (AMCP) HOST',
    text: '"CasparCG (AMCP) host"',
    file: 'tools/setup-ui/src/server.rs',
  },
  {
    shown: "THIS SERVER'S ADDRESS",
    text: '"This server\'s address"',
    file: 'tools/setup-ui/src/server.rs',
  },
  {
    shown: `Update from 0.10.0 to ${VERSION}. Your settings are kept.`,
    text: 'Update from {from} to {v}. Your settings are kept.',
    file: 'tools/setup-ui/src/model.rs',
  },
  {
    shown: 'SERVE ADDRESS',
    text: '>Serve address<',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'Use this channel',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'Use these channels',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'LOAD',
    text: "'LOAD'",
    file: 'apps/runtime/src/renderer/features/layers/layerRowActions.ts',
  },
  {
    shown: 'Import a .vcg',
    file: 'apps/runtime/src/renderer/features/fixedLayers/useTemplatePicker.tsx',
  },
  { shown: 'LOG', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  { shown: 'Audit log', file: 'apps/runtime/src/renderer/features/audit/AuditPanel.tsx' },
  // `CENTRAL-BRIDGE-01` — CG Bridge's logs, one zip (the old `Open log folder` was CG Control's own).
  { shown: 'Download logs', file: 'apps/runtime/src/renderer/features/audit/AuditPanel.tsx' },
  { shown: 'SETTINGS', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  {
    shown: `Version ${VERSION}`,
    text: 'Version {version.release}',
    file: 'apps/runtime/src/renderer/ui/Tabs.tsx',
  },
  // `D-161` — the Designer's version is in Help → About too. `Help` is the menu button's own JSX line
  // (the file says "Help" in comments as well, so the bare word would prove nothing).
  {
    shown: 'Help',
    text: '\n            Help\n',
    file: 'apps/designer/src/renderer/features/shell/TopToolbar.tsx',
  },
  {
    shown: 'About',
    text: 'label="About"',
    file: 'apps/designer/src/renderer/features/shell/TopToolbar.tsx',
  },
  { shown: '+ New project', file: 'apps/designer/src/renderer/features/shell/LandingView.tsx' },
  {
    shown: 'START FROM A TEMPLATE',
    file: 'apps/designer/src/renderer/features/shell/LandingView.tsx',
  },
  {
    shown: 'Compositions',
    text: '>Compositions<',
    file: 'apps/designer/src/renderer/features/compositions/CompositionsPanel.tsx',
  },
  {
    shown: 'Export (.vcg)',
    file: 'apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx',
  },
  // `RELEASE-0112-01` (`R-085`) — «با موتورِ پشتیبان»: server B in Station setup, the backup engine's
  // sign-in, and the status bar's words beside `BACKUP B`.
  {
    shown: 'Backup server',
    text: '<span className="cg-card__title">Backup server</span>',
    file: 'apps/runtime/src/renderer/features/stationSetup/StationSetupDialog.tsx',
  },
  {
    shown: 'Add backup',
    text: 'aria-label="Add backup"',
    file: 'apps/runtime/src/renderer/features/stationSetup/StationSetupDialog.tsx',
  },
  {
    shown: 'Host address',
    text: 'label="Host address"',
    file: 'apps/runtime/src/renderer/features/stationSetup/BackupServerDialog.tsx',
  },
  {
    shown: 'AMCP port',
    text: 'label="AMCP port"',
    file: 'apps/runtime/src/renderer/features/stationSetup/BackupServerDialog.tsx',
  },
  {
    shown: 'OSC port',
    text: 'label="OSC port"',
    file: 'apps/runtime/src/renderer/features/stationSetup/BackupServerDialog.tsx',
  },
  {
    shown: 'Add to draft',
    text: 'confirmLabel="Add to draft"',
    file: 'apps/runtime/src/renderer/features/stationSetup/BackupServerDialog.tsx',
  },
  {
    shown: 'Apply servers',
    text: '\n                Apply servers\n',
    file: 'apps/runtime/src/renderer/features/stationSetup/StationSetupDialog.tsx',
  },
  {
    shown: 'Backup engine',
    text: "backup: 'Backup engine'",
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
  {
    shown: 'Account',
    file: 'apps/runtime/src/renderer/features/status/BridgeSessionBanner.tsx',
  },
  { shown: 'cg-bridge', text: "CG_BRIDGE_ACCOUNT = 'cg-bridge'", file: 'packages/shared-ipc/src/channels/bridgeSession.ts' },
  {
    shown: 'PRIMARY A',
    text: 'PRIMARY {health.primary.label}',
    file: 'apps/runtime/src/renderer/features/status/StatusBar.tsx',
  },
  {
    shown: 'BACKUP B',
    text: 'BACKUP {health.backup.label}',
    file: 'apps/runtime/src/renderer/features/status/StatusBar.tsx',
  },
  { shown: 'HEALTHY', text: "text: 'HEALTHY'", file: 'apps/runtime/src/renderer/features/status/StatusBar.tsx' },
  {
    shown: 'B: SIGN IN CG BRIDGE',
    text: '${server}: SIGN IN CG BRIDGE',
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
  {
    shown: 'B: CG NOT LICENSED',
    text: '${server}: CG NOT LICENSED',
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
  {
    shown: 'B: HELD — ANOTHER CG BRIDGE',
    text: '${server}: HELD — ANOTHER CG BRIDGE',
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
];

describe('CLIENT-TEST-RELEASE-01 B3 — the guide’s source', () => {
  it('carries its ten sections, in the prompt’s order — CG Bridge before CG Control, the backup engine after the first run, CG Designer last', () => {
    const headings = [...source.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      '۱. در بسته چه هست',
      '۲. پیش‌نیازها',
      '۳. نصب CG Bridge',
      '۴. نصب CG Control',
      '۵. اجرای نخست',
      // `RELEASE-0112-01` Part B — "With a backup engine": the client runs a pair from day one.
      '۶. با موتورِ پشتیبان',
      '۷. نصب CG Designer',
      '۸. پیغام‌های CG Control',
      '۹. گزارش مشکل',
      // `RELEASE-0110-01` — `0.11.0` is the build the client gets: no longer "the test build's".
      '۱۰. محدودیت‌های این نسخه',
    ]);
  });

  it(`names this release (${VERSION}) and the three installers by the names the release gives them`, () => {
    const files = releaseFiles(VERSION);
    expect(source).toContain(`\`${VERSION}\``);
    expect(source).toContain(`\`${files.bridge.name}\``);
    expect(source).toContain(`\`${files.control.name}\``);
    expect(source).toContain(`\`${files.designer.name}\``);
    expect(source).toContain(`\`${files.sums}\``);
    // Never the built names: GitHub rewrites the space, so a client never downloads those.
    expect(source).not.toContain(files.control.built);
    expect(source).not.toContain(files.designer.built);
  });

  it('`CENTRAL-BRIDGE-01` — no "one CG Control per channel" limit: several consoles share one CG Bridge', () => {
    // The 0.9.x guide's own limit sentence, pinned as an ABSENCE — and the positive it became.
    expect(source).not.toContain('دو CG Control روی یک کانال پشتیبانی نمی‌شود');
    expect(source).toContain('چند CG Control می‌توانند هم‌زمان به یک CG Bridge وصل شوند');
  });

  it('every label it quotes is one an app shows — checked against the source that renders it', () => {
    for (const { shown, text, file } of LABELS) {
      expect(source, `the guide quotes \`${shown}\``).toContain(`\`${shown}\``);
      expect(fs.readFileSync(path.join(REPO, file), 'utf8'), `${file} renders ${shown}`).toContain(
        text ?? shown,
      );
    }
  });

  it('embeds at most seven pictures, each a PNG that exists', () => {
    // `RELEASE-0110-01` §2 — six: the two installers' Welcome joined the four. `RELEASE-0111-01` §D2 —
    // seven: CG Bridge's separate-server page, ticked and filled, replaced a PowerShell line.
    expect(PICTURES.length).toBeGreaterThan(0);
    expect(PICTURES.length).toBeLessThanOrEqual(7);
    const pictures = PICTURES;
    for (const src of pictures) {
      const file = path.resolve(path.dirname(GUIDE), src);
      expect(fs.readFileSync(file).subarray(1, 4).toString('latin1'), src).toBe('PNG');
    }
  });

  it('`RELEASE-0111-01` §D2 — a picture that shows the version is this build’s, never a past release’s file', () => {
    // The Welcome pages and CG Control's first question print `Version x.y.z`. A guide is started
    // from the last one's, pictures included, so a picture not captured again would show the old
    // version to the client — byte for byte the earlier release's file. The other pictures may
    // legitimately carry over.
    const SHOWS_VERSION = ['img/1-bridge-welcome.png', 'img/3-control-welcome.png', 'img/4-playout-address.png'];
    const sha = (file: string): string =>
      createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const releases = path.join(REPO, 'docs', 'release');
    const earlier = new Map<string, string>();
    for (const release of fs.readdirSync(releases)) {
      const img = path.join(releases, release, 'img');
      if (release === VERSION || !fs.existsSync(img)) continue;
      for (const file of fs.readdirSync(img)) earlier.set(sha(path.join(img, file)), `${release}/img/${file}`);
    }
    // Positive control: there ARE earlier pictures to compare with.
    expect(earlier.size).toBeGreaterThan(0);
    for (const src of SHOWS_VERSION) {
      expect(PICTURES, `the guide embeds ${src}`).toContain(src);
      const was = earlier.get(sha(path.resolve(path.dirname(GUIDE), src)));
      expect(was, `${src} is ${was ?? ''}, an earlier release's picture`).toBeUndefined();
    }
  });

  it('carries no private address, no test secret, no password', () => {
    expect(findingsIn(source)).toEqual([]);
    expect(source).not.toMatch(/password\s*[:=]/i);
  });

  it('`RELEASE-0110-01` §2 — the approve action is «تأیید», in the Playout team’s words', () => {
    // The Playout team confirmed the button's label (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §3), so
    // the one point `0.10.0`'s guide marked is a fact now, and the guide says it in their words.
    expect(source).toContain('«تأیید»');
    expect(source.split('\n').find((line) => line.includes('«تأیید»'))).not.toContain(CONFIRM_MARKER);
  });

  /** The guide's lines inside one `## ` section, by its heading. */
  const sectionLines = (heading: string): string[] => {
    const lines = source.split('\n');
    const start = lines.indexOf(`## ${heading}`);
    const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
    expect(start, `the guide has "## ${heading}"`).toBeGreaterThanOrEqual(0);
    return lines.slice(start + 1, end < 0 ? undefined : end);
  };
  const BACKUP_SECTION = '۶. با موتورِ پشتیبان';
  /** Their installer's two lines, exactly as their letter gives them (`RELEASE-0112-01-C` C1). */
  const THEIR_CHECKBOX = 'CG Bridge هم نصب شود';
  const THEIR_LINE_ABOVE = 'CG Control (اگر CG Bridge روی سرورِ جداست، تیک را بردارید):';

  it('`RELEASE-0112-01-C` C1 — their installer’s two lines, quoted exactly from their letter, and no longer marked', () => {
    // `PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md` §2 gives the label and the line above it as their
    // installer shows them, so the point `0.11.1`'s guide marked is a fact now, said in their words.
    const letter = fs.readFileSync(
      path.join(REPO, 'docs/integration/playout/PLAYOUT-CG-RESPONSE-0111-INSTALLER-v1.md'),
      'utf8',
    );
    for (const words of [THEIR_CHECKBOX, THEIR_LINE_ABOVE]) {
      expect(letter, `their letter gives «${words}»`).toContain(`\`${words}\``);
      expect(source).toContain(`«${words}»`);
    }
    const install = sectionLines('۳. نصب CG Bridge').find((line) => line.includes(`«${THEIR_LINE_ABOVE}»`));
    expect(install).toContain(`«${THEIR_CHECKBOX}»`);
    expect(install).not.toContain(CONFIRM_MARKER);
  });

  it('`RELEASE-0112-01` Part B — the unconfirmed Playout-side points are the backup engine’s, marked, and only there', () => {
    // Nobody has seen a backup engine's installer, approval or password page: each is marked on the
    // line that says it, inside «با موتورِ پشتیبان», and nowhere else.
    const marks = source.split(CONFIRM_MARKER).length - 1;
    const backup = sectionLines(BACKUP_SECTION);
    const markedThere = backup.filter((line) => line.includes(CONFIRM_MARKER));
    expect(marks).toBe(3);
    expect(markedThere).toHaveLength(3);
    expect(markedThere[0]).toContain(`«${THEIR_CHECKBOX}»`);
    expect(markedThere[1]).toContain('«تأیید»');
    expect(markedThere[2]).toContain('`Backup engine`');
  });

  it('`RELEASE-0112-01-C` C1 — their silent switch appears only where a silent Playout install is described', () => {
    const silent = '`/MERGETASKS="!cgbridge"`';
    expect(source.split(silent).length - 1).toBe(1);
    const line = sectionLines(BACKUP_SECTION).find((l) => l.includes(silent));
    expect(line).toContain('بی‌صدا');
  });

  it('`RELEASE-0112-01` Part B — with a backup engine, CG Bridge goes on a separate server beside both engines', () => {
    const backup = sectionLines(BACKUP_SECTION).join('\n');
    expect(backup).toContain('روی سروری جدا، کنارِ هر دو موتور');
    expect(backup).toContain('**هر دو** رایانهٔ موتور');
  });

  it('`RELEASE-0111-01` §D2 — a separate server is the installer’s page, never a PowerShell line', () => {
    // `0.11.0`'s step 4 handed the client a command line; the page replaced it. Pinned as an ABSENCE.
    expect(source).not.toContain('/BRIDGEADDRESS=');
    expect(source).not.toContain('PowerShell');
    expect(source).toContain('`CG Bridge runs on a separate server (not on the Playout machine)`');
  });
});

describe('CLIENT-TEST-RELEASE-01 B3 — the markdown the guide is written in', () => {
  it('isolates an app’s words as a left-to-right run, escaped', () => {
    expect(inline('بزنید `Use this channel` را')).toBe(
      'بزنید <bdi class="ui" dir="ltr">Use this channel</bdi> را',
    );
    expect(inline('`<b>` & more')).toBe('<bdi class="ui" dir="ltr">&lt;b&gt;</bdi> &amp; more');
  });

  it('lets bold span a code span, and keeps a code span literal', () => {
    expect(inline('**گذرواژهٔ `cg-admin`**')).toBe(
      '<strong>گذرواژهٔ <bdi class="ui" dir="ltr">cg-admin</bdi></strong>',
    );
    expect(inline('`**not bold**`')).toBe('<bdi class="ui" dir="ltr">**not bold**</bdi>');
  });

  it('marks the confirm point', () => {
    expect(inline(`تأیید کند ${CONFIRM_MARKER}`)).toContain('<mark class="confirm" dir="ltr">');
  });

  it('builds headings, lists with continuations, figures and a row of figures', () => {
    const html = markdownToHtml(
      [
        '## عنوان',
        '',
        '1. یک',
        '   ادامه',
        '2. دو',
        '',
        '- الف',
        '',
        '![یک](a.png "40%")',
        '![دو](b.png "30%")',
        '',
        '![کنار](c.png "22% side")',
      ].join('\n'),
      (src) => `data:${src}`,
    );
    expect(html).toContain('<h2>عنوان</h2>');
    expect(html).toContain('<ol><li>یک ادامه</li><li>دو</li></ol>');
    expect(html).toContain('<ul><li>الف</li></ul>');
    expect(html).toContain(
      '<div class="figures"><figure style="width:40%"><img src="data:a.png" alt="یک">',
    );
    expect(html).toContain('<figure class="side" style="width:22%"><img src="data:c.png"');
  });
});

describe('CLIENT-TEST-RELEASE-01 B3 — the page Chromium prints', () => {
  const html = guideHtml(GUIDE);

  it('is Persian and right to left, in the repo’s own Vazirmatn — six faces, inlined', () => {
    expect(html).toMatch(/^<!doctype html><html lang="fa" dir="rtl">/);
    const faces = html.match(/@font-face\{font-family:'Vazirmatn'/g) ?? [];
    expect(faces).toHaveLength(6);
    expect((html.match(/unicode-range:U\+0600-06FF/g) ?? []).length).toBe(3);
    expect((html.match(/url\('data:font\/woff2;base64,/g) ?? []).length).toBe(6);
  });

  it('inlines every picture and reaches for nothing off the page', () => {
    expect((html.match(/<img src="data:image\/png;base64,/g) ?? []).length).toBe(PICTURES.length);
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/url\((['"]?)https?:/);
  });

  it('counts a PDF’s pages from its page objects, never its page tree', () => {
    const pdf = Buffer.from(
      '<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>',
      'latin1',
    );
    expect(pdfPageCount(pdf)).toBe(2);
  });
});
