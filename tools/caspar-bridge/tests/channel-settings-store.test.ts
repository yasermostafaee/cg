import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rasterVerdict } from '@cg/shared-ipc';
import { ChannelSettingsStore, defaultChannelSettings } from '../src/channel-settings-store.js';

/**
 * R-030 — the per-channel raster STORE: persistence, defaults, the
 * `unknown-channel` guard, and the warning wording.
 *
 * The pure pieces — `videoModeRaster`, `parseVideoModeFromInfo`,
 * `rasterVerdict`, `mismatchedChannels` — are tested in `@cg/shared-ipc`, which
 * is where they live and where BOTH tiers read them from. They are exercised here
 * only through the store's own behaviour, so there is one home per assertion.
 */

const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-channel-settings-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ChannelSettingsStore', () => {
  it('defaults every declared channel to the REFERENCE raster — pre-R-030 behaviour', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1, 2]);
    // A fresh install must behave exactly as it did before this feature (scale
    // 1) rather than acquiring a new default nobody chose.
    expect(store.state().settings).toEqual([
      { channel: 1, raster: { width: 1920, height: 1080 } },
      { channel: 2, raster: { width: 1920, height: 1080 } },
    ]);
    expect(store.rasterFor(1)).toEqual({ width: 1920, height: 1080 });
    expect(defaultChannelSettings(7)).toEqual({
      channel: 7,
      raster: { width: 1920, height: 1080 },
    });
  });

  it('persists a change and reloads it — install config survives a restart', () => {
    const dir = tmpDir();
    const first = new ChannelSettingsStore(dir);
    first.hydrate([1]);
    expect(first.set({ channel: 1, raster: { width: 1280, height: 720 } })).toBeNull();
    expect(first.rasterFor(1)).toEqual({ width: 1280, height: 720 });

    const second = new ChannelSettingsStore(dir);
    second.hydrate([1]);
    expect(second.rasterFor(1)).toEqual({ width: 1280, height: 720 });
  });

  it('refuses a channel this install never declared — the guard is bridge-side', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    const refusal = store.set({ channel: 9, raster: { width: 1280, height: 720 } });
    expect(refusal?.reason).toBe('unknown-channel');
    // Named in the refusal, so an operator can see what IS declared.
    expect(refusal?.message).toContain('9');
    expect(refusal?.message).toContain('1');
    expect(store.state().settings).toHaveLength(1);
  });

  it('degrades to the reference raster on an unusable file rather than refusing to boot', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'channel-settings.json'), '{ this is not json', 'utf8');
    const store = new ChannelSettingsStore(dir);
    // Deliberately NOT `fixed-layers-store`'s hard failure: a dropped raster
    // falls back to the PREVIOUS behaviour and the mismatch check then reports
    // the disagreement out loud. Refusing to boot the operator's only control
    // surface over a bad geometry file is the worse trade.
    expect(() => store.hydrate([1])).not.toThrow();
    expect(store.rasterFor(1)).toEqual({ width: 1920, height: 1080 });
  });

  it('rasterFor NEVER falls back to the observed value', () => {
    // If an unconfigured channel silently adopted whatever INFO reported, config
    // and reality could never disagree and the mismatch check would report a
    // match on every install while proving nothing.
    const store = new ChannelSettingsStore();
    store.hydrate([]);
    store.observe({ channel: 4, mode: '720p5000', raster: { width: 1280, height: 720 } });
    expect(store.rasterFor(4)).toEqual({ width: 1920, height: 1080 });
  });

  it('observe() reports NEW information only, so an idle re-read publishes nothing', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    const reading = { channel: 1, mode: '1080i5000', raster: { width: 1920, height: 1080 } };
    expect(store.observe(reading)).toBe(true);
    expect(store.observe({ ...reading })).toBe(false);
    expect(
      store.observe({ channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } }),
    ).toBe(true);
  });

  it('the mismatch warning names BOTH rasters and the consequence', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    expect(store.mismatchWarning(1)).toBeNull();
    store.observe({ channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } });
    const warning = store.mismatchWarning(1);
    // "raster mismatch on channel 1" is not actionable; the two numbers and the
    // mode token are what let an operator decide which side is wrong.
    expect(warning).toContain('1920×1080');
    expect(warning).toContain('1280×720');
    expect(warning).toContain('720p5000');
    expect(warning).toContain('mis-placed');
  });

  it('an unreadable mode produces NO warning — a gap is not an alarm', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    store.observe({ channel: 1, mode: 'holographic', raster: null });
    expect(store.mismatchWarning(1)).toBeNull();
    expect(rasterVerdict(store.state(), 1)).toBe('unreadable');
  });
});
