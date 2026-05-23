import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { AssetService } from '../src/main/services/AssetService.js';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { PreviewFs, parseCgPreviewUrl } from '../src/main/preview/preview-fs.js';

const CG_JS = 'export const tag = "stub-cg-js";';

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function setup(): Promise<{
  preview: PreviewFs;
  scene: Scene;
  assets: AssetService;
}> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-prevfs-'));
  const projects = new ProjectService({
    recentFilePath: path.join(tmp, 'recent.json'),
    randomId: () => 'scene-fixed',
  });
  const { scene } = projects.newScene('demo', 'lower-third');
  const assets = new AssetService({
    workingRoot: path.join(tmp, 'working'),
    randomId: () => 'asset-fixed',
  });
  const preview = new PreviewFs({ cgJs: CG_JS, assets });
  preview.setActive(scene);
  return { preview, scene, assets };
}

describe('parseCgPreviewUrl', () => {
  it('extracts sceneId + rest', () => {
    expect(parseCgPreviewUrl('cgpreview://abc-123/index.html')).toEqual({
      sceneId: 'abc-123',
      rest: 'index.html',
    });
  });

  it('rejects other schemes', () => {
    expect(parseCgPreviewUrl('https://example.com/x.html')).toBeNull();
  });

  it('rejects bare scheme without a host', () => {
    expect(parseCgPreviewUrl('cgpreview://')).toBeNull();
  });

  it('handles a host-only URL with empty rest', () => {
    expect(parseCgPreviewUrl('cgpreview://abc/')).toEqual({ sceneId: 'abc', rest: '' });
  });
});

describe('PreviewFs', () => {
  it('resolve(index.html) returns generated HTML with the cg.js + cg.css link', async () => {
    const { preview, scene } = await setup();
    const entry = await preview.resolve(`cgpreview://${scene.id}/index.html`);
    expect(entry?.contentType).toContain('text/html');
    const html = entry?.bytes.toString('utf-8') ?? '';
    expect(html).toContain('./cg.js');
    expect(html).toContain('./cg.css');
    expect(html).toContain('./template.json');
    expect(html).toContain('cg-preview-ready');
  });

  it('resolve(cg.js) returns the configured stub', async () => {
    const { preview, scene } = await setup();
    const entry = await preview.resolve(`cgpreview://${scene.id}/cg.js`);
    expect(entry?.bytes.toString('utf-8')).toBe(CG_JS);
    expect(entry?.contentType).toContain('javascript');
  });

  it('resolve(cg.css) returns the default CSS reset', async () => {
    const { preview, scene } = await setup();
    const entry = await preview.resolve(`cgpreview://${scene.id}/cg.css`);
    expect(entry?.bytes.toString('utf-8')).toContain('font-family:');
  });

  it('resolve(template.json) returns the scene JSON', async () => {
    const { preview, scene } = await setup();
    const entry = await preview.resolve(`cgpreview://${scene.id}/template.json`);
    const parsed = JSON.parse(entry?.bytes.toString('utf-8') ?? '{}') as { id: string };
    expect(parsed.id).toBe(scene.id);
  });

  it('resolve returns null for an unknown sceneId', async () => {
    const { preview } = await setup();
    expect(await preview.resolve('cgpreview://other/index.html')).toBeNull();
  });

  it('resolve returns null for a path outside the scene', async () => {
    const { preview, scene } = await setup();
    expect(await preview.resolve(`cgpreview://${scene.id}/secret.txt`)).toBeNull();
  });

  it('resolves an asset by sha256 path', async () => {
    const { preview, scene, assets } = await setup();
    const sourcePath = path.join(tmp!, 'logo.png');
    await fs.promises.writeFile(sourcePath, 'fake-png');
    const asset = await assets.import(sourcePath);
    const url = `cgpreview://${scene.id}/assets/image/${asset.sha256}.png`;
    const entry = await preview.resolve(url);
    expect(entry?.bytes.toString('utf-8')).toBe('fake-png');
    expect(entry?.contentType).toBe('image/png');
  });

  it('returns null when sha256 maps to no registered asset', async () => {
    const { preview, scene } = await setup();
    const url = `cgpreview://${scene.id}/assets/image/${'f'.repeat(64)}.png`;
    expect(await preview.resolve(url)).toBeNull();
  });

  it('clear() makes subsequent resolves return null', async () => {
    const { preview, scene } = await setup();
    preview.clear();
    expect(await preview.resolve(`cgpreview://${scene.id}/index.html`)).toBeNull();
  });

  it('activeSceneId reflects setActive / clear', async () => {
    const { preview, scene } = await setup();
    expect(preview.activeSceneId).toBe(scene.id);
    preview.clear();
    expect(preview.activeSceneId).toBeNull();
  });
});
