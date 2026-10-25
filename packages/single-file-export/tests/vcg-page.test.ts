import { describe, expect, it } from 'vitest';
import type { AssetEntry, Scene } from '@cg/shared-schema';
import { buildVcgIndexHtml } from '../src/vcg-page.js';

const scene = {
  name: `Client's <Clock>`,
  resolution: { width: 1920, height: 1080 },
} as Scene;

const image: AssetEntry = {
  id: 'logo<id',
  path: 'assets/image/logo.svg',
  kind: 'image',
  bytes: 1,
  sha256: 'a'.repeat(64),
  mime: 'image/svg+xml',
};
const lottie: AssetEntry = {
  id: 'motion',
  path: 'assets/lottie/motion.json',
  kind: 'lottie',
  bytes: 1,
  sha256: 'b'.repeat(64),
  mime: 'application/json',
};
const font: AssetEntry = {
  id: 'font-1',
  path: 'fonts/font-1.otf',
  kind: 'font',
  bytes: 1,
  sha256: 'c'.repeat(64),
  mime: 'font/otf',
};

describe('buildVcgIndexHtml', () => {
  it('writes the canonical asset maps, font face, output mode and escaped title', () => {
    const html = buildVcgIndexHtml(scene, [image, lottie], [font], true);

    expect(html).toContain("import './cg-lottie.js'");
    expect(html).toContain('&lt;Clock&gt;');
    expect(html).toContain('Client&#39;s');
    expect(html).toContain("format('opentype')");
    expect(html).toContain('assets/lottie/motion.json');
    expect(html).toContain('assets/image/logo.svg');
    expect(html).toContain('logo\\u003cid');
    expect(html).toContain("mode: 'output'");
    expect(html).toContain('installCasparGlobals(runtime)');
  });

  it('does not import the Lottie player when the caller says none is needed', () => {
    expect(buildVcgIndexHtml(scene, [], [], false)).not.toContain('cg-lottie.js');
  });
});
