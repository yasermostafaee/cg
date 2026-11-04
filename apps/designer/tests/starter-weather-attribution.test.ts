import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('starter weather icon attribution', () => {
  it('carries the complete MIT notice inside every exported SVG byte payload', () => {
    const assets = join(process.cwd(), 'public', 'starters', 'assets');
    const license = readFileSync(join(assets, 'meteocons-LICENSE.txt'), 'utf8')
      .trim()
      .replace(/\r/g, '');
    expect(license).not.toContain('--');
    for (const icon of ['clear-day', 'cloudy', 'partly-cloudy-day', 'rain', 'snow']) {
      const svg = readFileSync(join(assets, `weather-${icon}.svg`), 'utf8').replace(/\r/g, '');
      expect(svg.startsWith(`<!--\n${license}\n-->\n<svg`), icon).toBe(true);
      expect(svg, icon).toContain('repeatCount="indefinite"');
      expect(svg, icon).not.toContain('<script');
    }
  });
});
