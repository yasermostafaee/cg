import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/main/services/SettingsService.js';

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function makeFilePath(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-settings-'));
  return path.join(tmpDir, 'settings.json');
}

describe('SettingsService', () => {
  it("defaults to telemetry='off' when the file is missing", () => {
    const filePath = makeFilePath();
    const svc = new SettingsService({ filePath });
    expect(svc.get()).toEqual({ telemetry: 'off' });
  });

  it('isOutboundAllowed returns false for off + air-gapped, true for on', () => {
    const svc = new SettingsService({ filePath: makeFilePath() });
    expect(svc.isOutboundAllowed()).toBe(false);
    svc.set({ telemetry: 'air-gapped' });
    expect(svc.isOutboundAllowed()).toBe(false);
    svc.set({ telemetry: 'on' });
    expect(svc.isOutboundAllowed()).toBe(true);
  });

  it('set() persists to disk + emits settings-changed', () => {
    const filePath = makeFilePath();
    const svc = new SettingsService({ filePath });
    const onChange = vi.fn();
    svc.on('settings-changed', onChange);

    const next = svc.set({ telemetry: 'air-gapped' });
    expect(next).toEqual({ telemetry: 'air-gapped' });
    expect(onChange).toHaveBeenCalledWith({ telemetry: 'air-gapped' });

    // Round-trip: a fresh service reads the same value.
    const fresh = new SettingsService({ filePath });
    expect(fresh.get()).toEqual({ telemetry: 'air-gapped' });
  });

  it('rejects an invalid telemetry value', () => {
    const svc = new SettingsService({ filePath: makeFilePath() });
    expect(() => svc.set({ telemetry: 'bogus' as 'off' })).toThrow();
  });

  it('ignores undefined-keyed patches (does not overwrite a real value)', () => {
    const svc = new SettingsService({ filePath: makeFilePath() });
    svc.set({ telemetry: 'on' });
    svc.set({ telemetry: undefined });
    expect(svc.get()).toEqual({ telemetry: 'on' });
  });

  it('recovers gracefully when the file contains invalid JSON', () => {
    const filePath = makeFilePath();
    fs.writeFileSync(filePath, '}}}not-json', 'utf-8');
    const svc = new SettingsService({ filePath });
    // No throw — falls back to defaults.
    expect(svc.get()).toEqual({ telemetry: 'off' });
  });

  it('recovers gracefully when the file is valid JSON but wrong shape', () => {
    const filePath = makeFilePath();
    fs.writeFileSync(filePath, JSON.stringify({ telemetry: 'wrong-value' }), 'utf-8');
    const svc = new SettingsService({ filePath });
    expect(svc.get()).toEqual({ telemetry: 'off' });
  });
});
