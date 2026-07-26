import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack } from '@cg/vcg-format';
import { expect, test } from './fixtures/designer.js';
import type { Download } from '@playwright/test';

/**
 * D-128 Phase 5 — both exporters carry a placed video, end-to-end in the REAL
 * app: import through the modal (real wasm conversion of the 64×64 fixture),
 * place, then (a) the single-file HTML inlines the stored WebM as a
 * `data:video/webm` URI under a CSP that admits it, and (b) the `.vcg` packs
 * the bytes under `assets/video/<sha>.webm` with a `kind: 'video'` index entry
 * and wires the index.html `assetUrls` map — zero external references in both.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'box-64x64-bgra.avi');

test('a placed video rides BOTH exports: base64-inline in the single-file HTML, packaged bytes + index entry in the .vcg', async ({
  app,
  page,
}) => {
  await app.newProject('VideoExport');

  // ---- import + place through the real modal (the proven fast path) ----
  await page.getByRole('button', { name: 'Project assets' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Video…' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'export-clip.avi',
    mimeType: 'video/x-msvideo',
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.locator('[data-testid="video-probe-meta"]')).toContainText('64×64');
  await page.getByRole('button', { name: 'Convert & import' }).click();
  await page.getByRole('button', { name: 'Place element' }).click({ timeout: 25_000 });
  await expect(page.getByRole('dialog', { name: 'Import video' })).not.toBeAttached();

  // ---- (a) single-file HTML: inline bytes + a CSP that admits them ----
  const { html } = await app.exportHtml();
  expect(html).toContain('data:video/webm;base64,');
  const csp = /Content-Security-Policy"\s*content="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(csp).toContain('media-src data:');
  expect(html).not.toMatch(/src="https?:/);

  // ---- (b) .vcg: packaged bytes + kind 'video' index entry + assetUrls wiring ----
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .vcg', exact: true }).click();
  const download: Download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const { manifest, files } = await unpack(new Uint8Array(Buffer.concat(chunks)));

  const entry = manifest.assetIndex.find((e) => e.kind === 'video');
  expect(entry, 'a kind:video assetIndex entry').toBeDefined();
  expect(entry?.path).toMatch(/^assets\/video\/[0-9a-f]{64}\.webm$/);
  expect(entry?.mime).toBe('video/webm');
  const packed = files.get(entry?.path ?? '');
  expect(packed, 'the packaged WebM bytes').toBeDefined();
  expect(packed?.byteLength).toBe(entry?.bytes);
  // WebM magic — the stored canonical bytes, verbatim (never re-encoded).
  expect([...(packed?.slice(0, 4) ?? [])]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  const indexHtml = new TextDecoder().decode(files.get('index.html'));
  expect(indexHtml).toContain(entry?.path ?? '--missing--');
  expect(indexHtml).not.toMatch(/(https?:|file:)/);
});
