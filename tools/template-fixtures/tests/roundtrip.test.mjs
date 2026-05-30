// End-to-end integration test for M3.5.
//
// Builds the persian-lower-third fixture in-memory via the real pipeline
// (no filesystem fixture required), then exercises the bundled
// template-runtime against the unpacked Scene inside happy-dom.
//
// This proves that:
//   - The fixture's scene is Zod-valid (vcg-format.pack would reject it
//     otherwise)
//   - The vcg-format pack → unpack → verify round-trip works on real data
//   - The bundled template-runtime can render the unpacked Scene
//   - Field defaults render in Persian without a CG INVOKE/CALL

import { describe, expect, it } from 'vitest';
import { pack, unpack, verify } from '@cg/vcg-format';
import { createRuntime } from '@cg/template-runtime';
import {
  scene as persianLowerThirdScene,
  manifestExtras as persianLowerThirdManifestExtras,
  cgCss as persianLowerThirdCgCss,
} from '../persian-lower-third.scene.mjs';

const STUB_INDEX_HTML = '<!doctype html><html><body></body></html>';
// We don't need the real bundled cg.js for the round-trip test — the runtime
// is exercised directly via @cg/template-runtime below. The cgJs string just
// needs to be present and stable for the integrity hash.
const STUB_CG_JS = '/* runtime bundle placeholder */';

async function buildVcg() {
  return pack({
    scene: persianLowerThirdScene,
    manifestExtras: persianLowerThirdManifestExtras,
    indexHtml: STUB_INDEX_HTML,
    cgJs: STUB_CG_JS,
    cgCss: persianLowerThirdCgCss,
  });
}

describe('persian-lower-third — vcg-format round-trip', () => {
  it('pack → unpack returns the exact scene', async () => {
    const buf = await buildVcg();
    const { scene } = await unpack(buf);
    expect(scene).toEqual(persianLowerThirdScene);
  });

  it('manifest carries the expected id, type, and fields', async () => {
    const buf = await buildVcg();
    const { manifest } = await unpack(buf);
    expect(manifest.id).toBe('starter-persian-lower-third');
    expect(manifest.templateType).toBe('lower-third');
    expect(manifest.fields.map((f) => f.id)).toEqual(['anchor', 'role', 'themeColor']);
  });

  it('verify() passes integrity end-to-end', async () => {
    const buf = await buildVcg();
    const result = await verify(buf);
    expect(result.ok).toBe(true);
    expect(result.signed).toBe(false);
  });

  it('re-packing the same scene is byte-identical', async () => {
    const a = await buildVcg();
    const b = await buildVcg();
    // pack() now returns a Uint8Array (isomorphic); compare via Buffer in this
    // Node-only fixture builder.
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('persian-lower-third — template-runtime DOM render', () => {
  it('renders the lower-third with default Persian field values', async () => {
    document.body.innerHTML = '';
    document.body.className = '';

    const runtime = createRuntime(persianLowerThirdScene, { skipFontLoad: true });
    await runtime.play({});

    // Stage + accent bar + name + role should all be in the DOM.
    expect(document.querySelector('.cg-stage')).toBeTruthy();
    const nameEl = document.querySelector('[data-cg-element-id="name"]');
    const roleEl = document.querySelector('[data-cg-element-id="role"]');
    const accentEl = document.querySelector('[data-cg-element-id="accent"]');
    expect(nameEl?.textContent).toBe('سارا نادری');
    expect(roleEl?.textContent).toBe('کارشناس روابط بین‌الملل');
    expect(accentEl).toBeTruthy();

    // cg-pending was removed by play()
    expect(document.body.classList.contains('cg-pending')).toBe(false);

    runtime.remove();
  });

  it('applies a live update without re-packing', async () => {
    document.body.innerHTML = '';
    document.body.className = '';

    const runtime = createRuntime(persianLowerThirdScene, { skipFontLoad: true });
    await runtime.play({});
    await runtime.update({ anchor: 'دکتر علی موسوی' });

    const nameEl = document.querySelector('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('دکتر علی موسوی');

    // role should keep its default since we only updated anchor
    const roleEl = document.querySelector('[data-cg-element-id="role"]');
    expect(roleEl?.textContent).toBe('کارشناس روابط بین‌الملل');

    runtime.remove();
  });

  it('applies a color binding to the accent bar', async () => {
    document.body.innerHTML = '';
    document.body.className = '';

    const runtime = createRuntime(persianLowerThirdScene, { skipFontLoad: true });
    await runtime.play({ themeColor: '#0EA5E9' });
    const accentEl = document.querySelector('[data-cg-element-id="accent"]');
    expect(accentEl?.style.background).toMatch(/#0ea5e9/i);

    runtime.remove();
  });
});

describe('persian-lower-third — CSP sanity', () => {
  it('per-template CSS does not whitelist external connect-src', () => {
    // The fixture's cg.css legitimately uses Google Fonts (@import). It must
    // not introduce any other external origins. The actual CSP enforcement
    // lives in the broadcast template's index.html (set by the export
    // pipeline in M9). For now, document the invariant for the fixture's
    // CSS specifically.
    expect(persianLowerThirdCgCss).not.toMatch(/connect-src/i);
    expect(persianLowerThirdCgCss).not.toMatch(/wss?:\/\//i);
    expect(persianLowerThirdCgCss).not.toMatch(/https?:\/\/(?!fonts\.googleapis\.com)/);
  });
});
