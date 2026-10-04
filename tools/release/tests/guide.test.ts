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
  { shown: 'Username', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Password', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Sign in', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'waiting for approval', file: 'tools/caspar-bridge/src/connection-check.ts' },
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
];

describe('CLIENT-TEST-RELEASE-01 B3 — the guide’s source', () => {
  it('carries its nine sections, in the prompt’s order — CG Bridge before CG Control, CG Designer last', () => {
    const headings = [...source.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      '۱. در بسته چه هست',
      '۲. پیش‌نیازها',
      '۳. نصب CG Bridge',
      '۴. نصب CG Control',
      '۵. اجرای نخست',
      '۶. نصب CG Designer',
      '۷. پیغام‌های CG Control',
      '۸. گزارش مشکل',
      // `RELEASE-0110-01` — `0.11.0` is the build the client gets: no longer "the test build's".
      '۹. محدودیت‌های این نسخه',
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

  it('embeds at most six pictures, each a PNG that exists', () => {
    // `RELEASE-0110-01` §2 — six at most: the two installers' Welcome joined the four.
    expect(PICTURES.length).toBeGreaterThan(0);
    expect(PICTURES.length).toBeLessThanOrEqual(6);
    const pictures = PICTURES;
    for (const src of pictures) {
      const file = path.resolve(path.dirname(GUIDE), src);
      expect(fs.readFileSync(file).subarray(1, 4).toString('latin1'), src).toBe('PNG');
    }
  });

  it('carries no private address, no test secret, no password', () => {
    expect(findingsIn(source)).toEqual([]);
    expect(source).not.toMatch(/password\s*[:=]/i);
  });

  it('`RELEASE-0110-01` §2 — carries no unconfirmed Playout-side point: the approve action is «تأیید»', () => {
    // The Playout team confirmed the button's label (`PLAYOUT-CG-RESPONSE-PLAYLIST-AUDIO-v1.md` §3), so
    // the one point `0.10.0`'s guide marked is a fact now, and the guide says it in their words.
    expect(source.split(CONFIRM_MARKER).length - 1).toBe(0);
    expect(source).toContain('«تأیید»');
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
