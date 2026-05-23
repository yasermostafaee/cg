import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { AssetService } from '../src/main/services/AssetService.js';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { PreviewService } from '../src/main/preview/PreviewService.js';

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function setup(): Promise<{
  preview: PreviewService;
  scene: Scene;
}> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-prevsvc-'));
  const projects = new ProjectService({
    recentFilePath: path.join(tmp, 'recent.json'),
    randomId: () => 'scene-fixed',
  });
  const { scene } = projects.newScene('demo', 'lower-third');
  const assets = new AssetService({ workingRoot: path.join(tmp, 'working') });
  const preview = new PreviewService({ cgJs: 'stub', assets });
  return { preview, scene };
}

describe('PreviewService', () => {
  it('loadScene returns the canonical cgpreview:// URL', async () => {
    const { preview, scene } = await setup();
    const src = preview.loadScene(scene);
    expect(src).toBe(`cgpreview://${scene.id}/index.html`);
    expect(preview.fs.activeSceneId).toBe(scene.id);
  });

  it('pushFieldUpdate emits + accumulates the latest values', async () => {
    const { preview, scene } = await setup();
    preview.loadScene(scene);
    const events: { fields: Record<string, unknown> }[] = [];
    preview.on('field-update', (info) => events.push(info));
    preview.pushFieldUpdate({ title: 'one' });
    preview.pushFieldUpdate({ subtitle: 'two' });
    expect(events).toHaveLength(2);
    expect(preview.fields).toEqual({ title: 'one', subtitle: 'two' });
  });

  it('loadScene resets accumulated fields', async () => {
    const { preview, scene } = await setup();
    preview.loadScene(scene);
    preview.pushFieldUpdate({ title: 'one' });
    expect(preview.fields).toEqual({ title: 'one' });
    preview.loadScene(scene);
    expect(preview.fields).toEqual({});
  });

  it('markReady emits the ready event', async () => {
    const { preview, scene } = await setup();
    preview.loadScene(scene);
    let captured: { sceneId: string } | null = null;
    preview.on('ready', (info) => (captured = info));
    preview.markReady(scene.id);
    expect(captured).toEqual({ sceneId: scene.id });
  });

  it('clear() drops the active scene', async () => {
    const { preview, scene } = await setup();
    preview.loadScene(scene);
    preview.clear();
    expect(preview.fs.activeSceneId).toBeNull();
    expect(preview.fields).toEqual({});
  });
});
