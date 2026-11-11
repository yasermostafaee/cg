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
 * Guard the installer workflow, release files, images and operator-facing labels
 * in the current guide. Check quoted controls against the source that renders them.
 */

const VERSION = releaseVersion(REPO);
const GUIDE = path.join(REPO, 'docs', 'release', VERSION, 'install-guide.fa.md');
const source = fs.readFileSync(GUIDE, 'utf8');
/** The pictures the guide embeds, by source — every figure line. */
const PICTURES = [...source.matchAll(/^!\[[^\]]*\]\(([^)\s]+)/gm)].map((m) => m[1] ?? '');

const LABELS: readonly { shown: string; text?: string; file: string }[] = [
  {
    shown: 'CG Bridge and APASAI Playout Engine run on separate servers',
    file: 'tools/setup-ui/src/server.rs',
  },
  {
    shown: 'APASAI PLAYOUT ENGINE ADDRESS',
    text: '"APASAI Playout Engine address"',
    file: 'tools/setup-ui/src/server.rs',
  },
  {
    shown: "THIS SERVER'S ADDRESS",
    text: '"This server\'s address"',
    file: 'tools/setup-ui/src/server.rs',
  },
  {
    shown: 'SHARED FILES FOLDER',
    text: '"Shared files folder"',
    file: 'tools/setup-ui/src/server.rs',
  },
  { shown: 'Finish', text: '"Finish"', file: 'tools/setup-ui/src/layout.rs' },
  {
    shown: 'Set up CG Control',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'APASAI Playout Engine address',
    text: '{PLAYOUT_ENGINE_NAME} address',
    file: 'apps/runtime/src/renderer/features/firstRun/StationAddressFields.tsx',
  },
  {
    shown: 'CG Bridge address',
    file: 'apps/runtime/src/renderer/features/firstRun/StationAddressFields.tsx',
  },
  {
    shown: 'Host',
    text: 'label="Host"',
    file: 'apps/runtime/src/renderer/features/firstRun/StationAddressFields.tsx',
  },
  {
    shown: 'Port',
    text: 'label="Port"',
    file: 'apps/runtime/src/renderer/features/firstRun/StationAddressFields.tsx',
  },
  {
    shown: 'Connect',
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutAddressGate.tsx',
  },
  {
    shown: 'Sign in',
    text: '>Sign in<',
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'cg-admin',
    text: "BRIDGE_SESSION_DEFAULT_ACCOUNT = 'cg-admin'",
    file: 'packages/shared-ipc/src/channels/bridgeSession.ts',
  },
  {
    shown: 'Sign in CG Bridge…',
    file: 'apps/runtime/src/renderer/features/status/BridgeSessionBanner.tsx',
  },
  {
    shown: 'Use this channel',
    text: "'Use these channels' : 'Use this channel'",
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'Use these channels',
    text: "'Use these channels' : 'Use this channel'",
    file: 'apps/runtime/src/renderer/features/firstRun/FirstRunScreen.tsx',
  },
  {
    shown: 'Add backup',
    text: 'aria-label="Add backup"',
    file: 'apps/runtime/src/renderer/features/stationSetup/StationSetupDialog.tsx',
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
    shown: 'Save backup channels',
    file: 'apps/runtime/src/renderer/features/stationSetup/BackupChannelsCard.tsx',
  },
  {
    shown: 'Check',
    text: "'Checking…' : 'Check'",
    file: 'apps/runtime/src/renderer/features/firstRun/PlayoutConnection.tsx',
  },
  { shown: 'SETTINGS', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  {
    shown: 'Connection',
    text: "title: 'Connection'",
    file: 'apps/runtime/src/renderer/features/stationSetup/sections.ts',
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
  {
    shown: 'Export (.vcg)',
    file: 'apps/designer/src/renderer/features/compositions/CompositionActionBar.tsx',
  },
  {
    shown: 'ON PVW',
    text: "deps.rehearsing ? 'OFF PVW' : 'ON PVW'",
    file: 'apps/runtime/src/renderer/features/layers/layerRowActions.ts',
  },
  {
    shown: 'PLAY',
    text: "'PLAY',",
    file: 'apps/runtime/src/renderer/features/layers/layerRowActions.ts',
  },
  {
    shown: 'Update on air',
    text: "{onAir ? 'Update on air' : 'Update'}",
    file: 'apps/runtime/src/renderer/features/inspector/Inspector.tsx',
  },
  {
    shown: 'CLEAR',
    text: "label: 'CLEAR'",
    file: 'apps/runtime/src/renderer/features/layers/layerRowActions.ts',
  },
  { shown: 'LOG', file: 'apps/runtime/src/renderer/features/shell/AppHeader.tsx' },
  { shown: 'Download logs', file: 'apps/runtime/src/renderer/features/audit/AuditPanel.tsx' },
  {
    shown: 'Set up again',
    text: '\n      Set up again\n',
    file: 'apps/runtime/src/renderer/features/shell/SetUpAgain.tsx',
  },
];

describe('the Persian release guide', () => {
  const sections = source.split(/^## /m).slice(1);
  const [install = '', connection = ''] = sections;
  const backupHeading = /^### .*پشتیبان/m;

  it('follows the installation, connection, and verification workflow', () => {
    expect(sections.map((section) => section.split(/\r?\n/, 1)[0])).toEqual([
      'آماده‌سازی و نصب',
      'اتصال CG Control',
      'آزمون و رفع مشکل',
    ]);
    expect(connection, 'backup is part of connection setup').toMatch(backupHeading);
  });

  it(`names this release (${VERSION}) and its exact installer and checksum files`, () => {
    const files = releaseFiles(VERSION);
    expect(source).toContain(`\`${VERSION}\``);
    let previous = -1;
    for (const file of [files.bridge.name, files.control.name, files.designer.name]) {
      const at = source.indexOf(`\`${file}\``);
      expect(at, file).toBeGreaterThan(previous);
      previous = at;
    }
    expect(source).toContain(`\`${files.sums}\``);
    expect(source).not.toContain(files.control.built);
    expect(source).not.toContain(files.designer.built);
  });

  it('quotes the actual setup and operator controls', () => {
    for (const { shown, text, file } of LABELS) {
      expect(source, `the guide quotes ${shown}`).toContain(`\`${shown}\``);
      expect(fs.readFileSync(path.join(REPO, file), 'utf8'), `${file} renders ${shown}`).toContain(
        text ?? shown,
      );
    }
  });

  it('covers same-host and separate-server setup, UNC access, and upgrades', () => {
    expect(install).toMatch(/(?:رایانه|سرور|دستگاه).{0,4}Playout[^\n]+خالی بگذارید/);
    expect(install).toMatch(/سرور.{0,8}جدا[^\n]+تیک بزنید[^\n]+IP ثابت/);
    expect(connection).toMatch(/همان (?:رایانه|سرور|دستگاه)[^\n]+CG Bridge address[^\n]+خالی بگذارید/);
    expect(source).toContain('UNC');
    for (const access of ['Read', 'Sharing', 'Security']) expect(source).toContain(access);
    expect(source).toMatch(/(?:هویت|حساب)\s+(?:سرویس\s+)?CG Bridge/);
    expect(install).toContain('1.1.0');
    expect(install).toContain('1.2.0');
    expect(install).toMatch(/تنظیمات.{0,35}حفظ|حفظ.{0,35}تنظیمات/);
    expect(source).toContain('«تأیید»');
  });

  it('uses a separate Bridge and explicit mirrored-channel mapping for backup', () => {
    const backup = connection.slice(connection.search(backupHeading));
    expect(backup).toMatch(/سرور.{0,10}جدا/);
    expect(backup).toContain('«تأیید»');
    expect(backup).toMatch(/کانال.{0,10}(?:آینه|متناظر)/);
    expect(backup).toContain('Save backup channels');
  });

  it('embeds one or two local PNG pictures', () => {
    expect(PICTURES.length).toBeGreaterThanOrEqual(1);
    expect(PICTURES.length).toBeLessThanOrEqual(2);
    for (const src of PICTURES) {
      const file = path.resolve(path.dirname(GUIDE), src);
      expect(fs.readFileSync(file).subarray(1, 4).toString('latin1'), src).toBe('PNG');
    }
  });

  it('avoids images stamped with a previous release', () => {
    // Version-neutral examples may be reused. The welcome and enrollment pages print a version.
    const showsVersion = /^\d+-(bridge-welcome|control-welcome|playout-address)\.png$/u;
    const sha = (file: string): string =>
      createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const releases = path.join(REPO, 'docs', 'release');
    const earlier = new Map<string, string>();
    for (const release of fs.readdirSync(releases)) {
      const img = path.join(releases, release, 'img');
      if (release === VERSION || !fs.existsSync(img)) continue;
      for (const file of fs.readdirSync(img)) {
        if (showsVersion.test(file)) earlier.set(sha(path.join(img, file)), `${release}/img/${file}`);
      }
    }
    expect(earlier.size).toBeGreaterThan(0);
    for (const src of PICTURES) {
      const was = earlier.get(sha(path.resolve(path.dirname(GUIDE), src)));
      expect(was, `${src} is ${was ?? ''}, an earlier release's picture`).toBeUndefined();
    }
  });

  it('contains no private network address or test secret', () => {
    expect(findingsIn(source)).toEqual([]);
    expect(source).not.toMatch(/password\s*[:=]/i);
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
