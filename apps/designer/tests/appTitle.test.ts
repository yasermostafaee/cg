import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `FIELD-FIXES-01` G — **THE BROWSER TAB CARRIES THE TITLE AND THE APASAI LOGO**, and nothing in
 * the page repeats the name. The favicon is `brand/apasai-icon.svg`: the logo, its content
 * unchanged, centred on a white square (the same source the installed app's icons are made from).
 */

const read = (rel: string): string => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const html = read('../index.html');
const logo = read('../brand/apasai-logo.svg');
const icon = read('../brand/apasai-icon.svg');

describe('the page', () => {
  it('🔴 is titled APASAI CG DESIGNER', () => {
    expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe('APASAI CG DESIGNER');
  });

  it('🔴 links the favicon, and the favicon is the icon made from the logo', () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(read('../public/favicon.svg')).toBe(icon);
    // The logo's own content is inside the icon byte for byte: path data and the brand blue.
    const inner = logo.slice(
      logo.indexOf('>', logo.indexOf('<svg')) + 1,
      logo.lastIndexOf('</svg>'),
    );
    expect(inner.length).toBeGreaterThan(1000);
    expect(icon).toContain(inner);
    expect(icon).toContain('#00AEEF');
  });
});
