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
  it('renders the tracked Persian history with a clickable section per version', () => {
    const data = parseReleaseHistory(
      fs.readFileSync(path.join(REPO, 'docs', 'release', 'release-history.json'), 'utf8'),
    );
    const html = releaseHistoryHtml(data, { currentVersion: '1.0.0' });

    expect(html).toContain('lang="fa" dir="rtl"');
    expect(html).toContain('id="version-next"');
    expect(html).toContain('id="version-1.0.0"');
    expect(html).toContain('لایه‌های متنی مخفی');
    expect(html).toContain('CG-Control_1.0.0_x64-setup.exe');
    expect(html).toContain('data-download-file=');
  });

  it('binds every version asset when its host base URL is supplied', () => {
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
    const names = releaseAssetNames('1.2.3');

    for (const file of Object.values(names)) {
      expect(html).toContain(
        'href="https://downloads.example.test/cg/1.2.3/' + encodeURIComponent(file) + '"',
      );
    }
    expect(html).not.toContain('data-download-file=');
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
