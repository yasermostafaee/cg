import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectService } from '../src/main/services/ProjectService.js';

let tmp: string | undefined;

afterEach(async () => {
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

async function setup(): Promise<{ svc: ProjectService; tmpDir: string }> {
  tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-projsvc-'));
  const svc = new ProjectService({
    recentFilePath: path.join(tmp, 'recent.json'),
    now: () => new Date('2026-05-23T10:00:00.000Z'),
    randomId: () => 'fixed-id',
  });
  return { svc, tmpDir: tmp };
}

describe('ProjectService', () => {
  it('newScene constructs a Scene with defaults and emits active-changed', async () => {
    const { svc } = await setup();
    let captured: { scene: { id: string } | null } | null = null;
    svc.on('active-changed', (i) => (captured = i));
    const { scene, path: p } = svc.newScene('My LT', 'lower-third');
    expect(p).toBeNull();
    expect(scene.id).toBe('fixed-id');
    expect(scene.templateType).toBe('lower-third');
    expect(scene.layers).toEqual([]);
    expect(captured).toMatchObject({ scene: { id: 'fixed-id' } });
  });

  it('current() reflects newScene', async () => {
    const { svc } = await setup();
    svc.newScene('LT', 'lower-third');
    expect(svc.current()?.scene.name).toBe('LT');
  });

  it('save writes pretty JSON and bumps updatedAt', async () => {
    const { svc, tmpDir } = await setup();
    const { scene } = svc.newScene('LT', 'lower-third');
    const target = path.join(tmpDir, 'project.scene.json');
    const result = await svc.save(scene, target);
    expect(result.path).toBe(target);
    expect(result.scene.metadata.updatedAt).toBe('2026-05-23T10:00:00.000Z');
    const onDisk = JSON.parse(await fs.promises.readFile(target, 'utf-8')) as { id: string };
    expect(onDisk.id).toBe(scene.id);
  });

  it('save records the project in recents', async () => {
    const { svc, tmpDir } = await setup();
    const { scene } = svc.newScene('LT', 'lower-third');
    await svc.save(scene, path.join(tmpDir, 'p.scene.json'));
    const recent = await svc.recent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.name).toBe('LT');
  });

  it('open parses a scene round-tripped through save', async () => {
    const { svc, tmpDir } = await setup();
    const { scene } = svc.newScene('LT', 'lower-third');
    const p = path.join(tmpDir, 'p.scene.json');
    await svc.save(scene, p);
    const reopened = await svc.open(p);
    expect(reopened.scene.id).toBe(scene.id);
  });

  it('open rejects a malformed file', async () => {
    const { svc, tmpDir } = await setup();
    const bad = path.join(tmpDir, 'bad.json');
    await fs.promises.writeFile(bad, '{"not":"a scene"}');
    await expect(svc.open(bad)).rejects.toThrow();
  });

  it('recents are capped + deduped on save', async () => {
    const { tmpDir } = await setup();
    const cappingSvc = new ProjectService({
      recentFilePath: path.join(tmpDir, 'recent-capped.json'),
      recentCap: 2,
      now: () => new Date('2026-05-23T10:00:00.000Z'),
      randomId: () => 'fixed-id',
    });
    const a = cappingSvc.newScene('A', 'lower-third').scene;
    const b = cappingSvc.newScene('B', 'ticker').scene;
    const c = cappingSvc.newScene('C', 'fullscreen').scene;
    await cappingSvc.save(a, path.join(tmpDir, 'a.json'));
    await cappingSvc.save(b, path.join(tmpDir, 'b.json'));
    await cappingSvc.save(c, path.join(tmpDir, 'c.json'));
    // Re-saving `a` should move it to the head and evict `b`.
    await cappingSvc.save(a, path.join(tmpDir, 'a.json'));
    const recent = await cappingSvc.recent();
    expect(recent.map((r) => r.name)).toEqual(['A', 'C']);
  });

  it('recent() returns empty array when the file is missing', async () => {
    const { svc } = await setup();
    expect(await svc.recent()).toEqual([]);
  });

  it('recent() drops malformed rows without throwing', async () => {
    const { svc, tmpDir } = await setup();
    await fs.promises.writeFile(
      path.join(tmpDir, 'recent.json'),
      JSON.stringify([{ path: 'p', name: 'x', templateType: 't', lastOpenedAt: 'iso' }, 'junk']),
    );
    expect(await svc.recent()).toHaveLength(1);
  });
});
