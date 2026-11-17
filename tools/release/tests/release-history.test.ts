import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseReleaseHistory,
  releaseAssetNames,
  releaseHistoryHtml,
} from '../src/build-release-history.mjs';
import { REPO } from '../src/build-guide.mjs';

describe('versioned release history', () => {
  it('records confirmed customer releases as published in both languages', () => {
    const data = parseReleaseHistory(
      fs.readFileSync(path.join(REPO, 'docs', 'release', 'release-history.json'), 'utf8'),
    );
    for (const version of ['1.0.0', '1.1.0', '1.2.4', '1.2.5']) {
      expect(data.releases.find((release) => release.version === version)?.status).toBe('published');
    }
    const html = releaseHistoryHtml(data, { currentVersion: '1.2.11' });
    for (const [prefix, label] of [['version-', 'منتشرشده'], ['en-version-', 'Published']]) {
      const card = html.slice(html.indexOf('id="' + prefix + '1.1.0"'));
      const summary = card.slice(0, card.indexOf('</summary>'));
      expect(summary).toContain('data-status="published">' + label);
      expect(summary).not.toContain('data-status="development"');
    }
  });

  it('renders both locales with distinct feature and fix sections and an embedded Persian font', () => {
    const data = parseReleaseHistory(
      fs.readFileSync(path.join(REPO, 'docs', 'release', 'release-history.json'), 'utf8'),
    );
    const html = releaseHistoryHtml(data, { currentVersion: '1.0.0' });

    expect(html).toContain('lang="fa" dir="rtl"');
    expect(html).not.toContain('id="version-next"');
    expect(html).not.toContain('id="en-version-next"');
    expect(html).toContain('id="version-1.0.0"');
    expect(html).toContain('id="en-version-1.0.0"');
    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain('Features and improvements');
    expect(html).toContain('Bug fixes');
    expect(html).toContain('قابلیت‌ها و بهبودها');
    expect(html).toContain('رفع باگ‌ها');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).toContain('لایه‌های متنی مخفی');
    expect(html).not.toContain('data-download-file=');
    expect(html).not.toContain('class="downloads"');
    expect(html).not.toContain('دانلودهای این نسخه');
    expect(html).not.toContain('Downloads for this version');
    expect(html).toContain('aria-label="صفحه‌بندی نسخه‌ها"');
    expect(html).toContain('aria-label="Release history pages"');
  });

  it('requires both locales for new history entries', () => {
    expect(() =>
      parseReleaseHistory(JSON.stringify({
        schemaVersion: 2,
        product: 'APASAI CG',
        releases: [{
          version: '1.2.3',
          title: { fa: 'نسخه', en: 'Release' },
          date: '2026-11-08',
          status: 'prepared',
          summary: { fa: 'آماده', en: 'Ready' },
          features: [],
          fixes: [{ fa: 'رفع باگ' }],
        }],
      })),
    ).toThrow(/fixes\[0\]\.en/);
  });

  it('keeps download sections hidden when a historical host URL is supplied', () => {
    const data = parseReleaseHistory(
      JSON.stringify({
        schemaVersion: 1,
        product: 'APASAI CG',
        releases: [
          {
            version: '1.2.3',
            title: 'Release',
            date: '2026-11-08',
            status: 'published',
            summary: 'Ready',
            changes: ['One change'],
            planned: [],
            downloadBaseUrl: 'https://downloads.example.test/cg/1.2.3/',
          },
        ],
      }),
    );
    const html = releaseHistoryHtml(data, { currentVersion: '1.2.3' });
    expect(releaseAssetNames('1.2.3').control).toBe('CG-Control_1.2.3_x64-setup.exe');
    expect(html).not.toContain('https://downloads.example.test');
    expect(html).not.toContain('class="downloads"');
    expect(html).not.toContain('data-download-file=');
  });

  it('shows the first fifteen recorded versions per language and excludes the next-release draft', () => {
    const data = parseReleaseHistory(JSON.stringify({
      schemaVersion: 2,
      product: 'APASAI CG',
      releases: [
        {
          version: 'next',
          title: { fa: 'بعدی', en: 'Next' },
          date: '2026-11-17',
          status: 'development',
          summary: { fa: 'آینده', en: 'Future' },
          features: [],
          fixes: [],
        },
        ...Array.from({ length: 32 }, (_, index) => ({
          version: '2.0.' + String(index),
          title: { fa: 'نسخه', en: 'Release' },
          date: '2026-11-17',
          status: 'published',
          summary: { fa: 'تغییرات', en: 'Changes' },
          features: [],
          fixes: [],
        })),
      ],
    }));
    const html = releaseHistoryHtml(data);
    expect(html.match(/<details class="release"/g)).toHaveLength(64);
    expect(html.match(/<details class="release"[^>]* hidden/g)).toHaveLength(34);
    expect(html).toContain('Page 1 of 3');
    expect(html).toContain('صفحه ۱ از ۳');
    expect(html).not.toContain('id="version-next"');
    expect(html).not.toContain('id="en-version-next"');
  });

  it('refuses an installer build whose version has no recorded changes', () => {
    const data = parseReleaseHistory(
      JSON.stringify({
        schemaVersion: 1,
        product: 'APASAI CG',
        releases: [
          {
            version: '1.0.0',
            title: 'Release',
            date: '2026-11-08',
            status: 'prepared',
            summary: 'Ready',
            changes: [],
          },
        ],
      }),
    );
    expect(() => releaseHistoryHtml(data, { currentVersion: '1.0.1' })).toThrow(
      /add its changes before building installers/u,
    );
  });
});
