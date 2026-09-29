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

/**
 * What the guide quotes (backticked, so isolated LTR), and the file that renders it. `text` is the
 * source's spelling where CSS changes the case on screen (`PLAYOUT` is the heading `Playout`).
 */
const LABELS: readonly { shown: string; text?: string; file: string }[] = [
  { shown: 'STARTING BRIDGE', file: 'apps/runtime/src-tauri/starting/start.js' },
  { shown: 'Set up CG Control', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'PLAYOUT', text: '>Playout<', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Check', text: 'Check', file: 'apps/runtime/src/renderer/features/firstRun/PlayoutConnection.tsx' },
  { shown: 'Connect', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'waiting for sign-in', file: 'tools/caspar-bridge/src/connection-check.ts' },
  { shown: 'SIGN IN', text: '>Sign in<', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Username', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Password', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Sign in', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'waiting for approval', file: 'tools/caspar-bridge/src/connection-check.ts' },
  { shown: 'CHANNEL', text: '>Channel<', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'SERVE ADDRESS', text: '>Serve address<', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Use this channel', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'Use these channels', file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx' },
  { shown: 'LOAD', text: "'LOAD'", file: 'apps/runtime/src/renderer/features/layers/layerRowActions.ts' },
  { shown: 'Import a .vcg', file: 'apps/runtime/src/renderer/features/fixedLayers/useTemplatePicker.tsx' },
  { shown: 'LOG', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  { shown: 'Audit log', file: 'apps/runtime/src/renderer/features/audit/AuditPanel.tsx' },
  { shown: 'Open log folder', file: 'apps/runtime/src/renderer/features/audit/AuditPanel.tsx' },
  { shown: 'SETTINGS', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  { shown: `Version ${VERSION}`, text: 'Version {version.release}', file: 'apps/runtime/src/renderer/ui/Tabs.tsx' },
  { shown: '+ New project', file: 'apps/designer/src/renderer/features/shell/LandingView.tsx' },
  { shown: 'START FROM A TEMPLATE', file: 'apps/designer/src/renderer/features/shell/LandingView.tsx' },
  { shown: 'Compositions', text: '>Compositions<', file: 'apps/designer/src/renderer/features/compositions/CompositionsPanel.tsx' },
  { shown: 'Export (.vcg)', file: 'apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx' },
];

describe('CLIENT-TEST-RELEASE-01 B3 — the guide’s source', () => {
  it('carries its seven sections, in the prompt’s order', () => {
    const headings = [...source.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      '۱. در بسته چه هست',
      '۲. پیش‌نیازها',
      '۳. نصب CG Control',
      '۴. اجرای نخست',
      '۵. نصب CG Designer',
      '۶. گزارش مشکل',
      '۷. محدودیت‌های این نسخهٔ آزمایشی',
    ]);
  });

  it(`names this release (${VERSION}) and both installers by the names the release gives them`, () => {
    const files = releaseFiles(VERSION);
    expect(source).toContain(`\`${VERSION}\``);
    expect(source).toContain(`\`${files.control.name}\``);
    expect(source).toContain(`\`${files.designer.name}\``);
    expect(source).toContain(`\`${files.sums}\``);
    // Never the built names: GitHub rewrites the space, so a client never downloads those.
    expect(source).not.toContain(files.control.built);
    expect(source).not.toContain(files.designer.built);
  });

  it('every label it quotes is one an app shows — checked against the source that renders it', () => {
    for (const { shown, text, file } of LABELS) {
      expect(source, `the guide quotes \`${shown}\``).toContain(`\`${shown}\``);
      expect(fs.readFileSync(path.join(REPO, file), 'utf8'), `${file} renders ${shown}`).toContain(
        text ?? shown,
      );
    }
  });

  it('embeds at most four pictures, each a PNG that exists', () => {
    const pictures = [...source.matchAll(/^!\[[^\]]*\]\(([^)\s]+)/gm)].map((m) => m[1] ?? '');
    expect(pictures.length).toBeGreaterThan(0);
    expect(pictures.length).toBeLessThanOrEqual(4);
    for (const src of pictures) {
      const file = path.resolve(path.dirname(GUIDE), src);
      expect(fs.readFileSync(file).subarray(1, 4).toString('latin1'), src).toBe('PNG');
    }
  });

  it('carries no private address, no test secret, no password', () => {
    expect(findingsIn(source)).toEqual([]);
    expect(source).not.toMatch(/password\s*[:=]/i);
  });

  it('marks the one Playout-side point our records do not file', () => {
    expect(source.split(CONFIRM_MARKER).length - 1).toBe(1);
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
    expect((html.match(/<img src="data:image\/png;base64,/g) ?? []).length).toBe(4);
    expect(html).not.toMatch(/(src|href)="https?:/);
    expect(html).not.toMatch(/url\((['"]?)https?:/);
  });

  it('counts a PDF’s pages from its page objects, never its page tree', () => {
    const pdf = Buffer.from('<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page >>', 'latin1');
    expect(pdfPageCount(pdf)).toBe(2);
  });
});
