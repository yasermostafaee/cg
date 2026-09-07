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

/**
 * `B-236` — ADOPTION: the stored raster's only writer.
 *
 * With the typed field gone (`STATION-CHROME-01` §4), the stored value defaulted to
 * 1920×1080 and nothing in the console could ever change it — so an install whose channel
 * is not 1080 carried a standing mismatch banner with no in-console remedy. Adoption is
 * that writer: when config CONTRADICTS a raster the server actually reported, the server
 * wins.
 *
 * 🔴 **`unreadable` must never adopt and must never read as agreement.** The two failures
 * the check exists to tell apart are "config is wrong" and "the check could not be
 * performed", and a gap that renders as a pass is the defect the whole feature removes. The
 * gate is therefore the canonical `rasterVerdict` — never a local re-derivation of "did we
 * get a number" (CLAUDE.md golden rule 6).
 */
describe('ChannelSettingsStore.adoptObserved — B-236', () => {
  it('adopts the server’s raster over a contradicting config, and PERSISTS it', () => {
    const dir = tmpDir();
    const store = new ChannelSettingsStore(dir);
    store.hydrate([1]);
    store.observe({ channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } });
    expect(rasterVerdict(store.state(), 1)).toBe('mismatch');

    const adopted = store.adoptObserved(1);
    expect(adopted).toEqual({
      channel: 1,
      mode: '720p5000',
      from: { width: 1920, height: 1080 },
      to: { width: 1280, height: 720 },
    });
    // The belief is corrected, so the check now agrees — and PLACEMENT follows it, which is
    // the whole point: `rasterFor` is what rides `?cw=&ch=` onto air.
    expect(rasterVerdict(store.state(), 1)).toBe('match');
    expect(store.rasterFor(1)).toEqual({ width: 1280, height: 720 });

    // Persisted, so the correction is in force from the NEXT boot's first served template
    // rather than only after that boot's first `INFO` reply lands.
    const reloaded = new ChannelSettingsStore(dir);
    reloaded.hydrate([1]);
    expect(reloaded.rasterFor(1)).toEqual({ width: 1280, height: 720 });
  });

  it('does NOT adopt an UNREADABLE mode, and the gap does not become agreement', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    // The token was read; this build cannot map it. That is "the check is unavailable",
    // which is a different fact from "config is wrong" and must not be repaired as one.
    store.observe({ channel: 1, mode: 'holographic', raster: null });

    expect(store.adoptObserved(1)).toBeNull();
    expect(store.rasterFor(1)).toEqual({ width: 1920, height: 1080 });
    expect(rasterVerdict(store.state(), 1)).toBe('unreadable');
  });

  it('does NOT adopt when the mode was never read at all', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    expect(store.adoptObserved(1)).toBeNull();
    expect(rasterVerdict(store.state(), 1)).toBe('unreadable');
  });

  it('is a no-op when config already AGREES, and on a channel with no claim to check', () => {
    const store = new ChannelSettingsStore();
    store.hydrate([1]);
    store.observe({ channel: 1, mode: '1080i5000', raster: { width: 1920, height: 1080 } });
    expect(store.adoptObserved(1)).toBeNull();
    expect(rasterVerdict(store.state(), 1)).toBe('match');

    // `unconfigured` — no settings entry, so there is no false claim to correct. Adopting
    // here would invent one, and `rasterFor`'s reference-frame fallback is the answer.
    store.observe({ channel: 9, mode: '720p5000', raster: { width: 1280, height: 720 } });
    expect(store.adoptObserved(9)).toBeNull();
    expect(store.state().settings.some((s) => s.channel === 9)).toBe(false);
  });

  it('does not write the file when there is nothing to adopt', () => {
    const dir = tmpDir();
    const store = new ChannelSettingsStore(dir);
    store.hydrate([1]);
    store.observe({ channel: 1, mode: 'holographic', raster: null });
    expect(store.adoptObserved(1)).toBeNull();
    // A store that persisted on every no-op would rewrite `channel-settings.json` on every
    // sweep tick of every OSC-less install.
    expect(fs.existsSync(path.join(dir, 'channel-settings.json'))).toBe(false);
  });
});
