import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reservedLayerNumbers } from '@cg/shared-ipc';
import {
  ReservedLayersFileError,
  loadReservedLayers,
  parseReservedLayersFlag,
} from '../src/reserved-layers-store.js';

/**
 * R-028 / C-015 (task 1.2) — the reserved playout layers come from REAL
 * config. Present-but-unusable is a HARD failure (a silently-dropped
 * reservation would let our graphics land on the company's playout layers);
 * an absent file is the normal nothing-reserved case.
 */

describe('parseReservedLayersFlag', () => {
  it('parses a range, a single layer, and a mixed list', () => {
    expect(reservedLayerNumbers(parseReservedLayersFlag('60-69'))).toEqual([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    ]);
    expect(reservedLayerNumbers(parseReservedLayersFlag('105'))).toEqual([105]);
    expect(reservedLayerNumbers(parseReservedLayersFlag('60-62, 105'))).toEqual([60, 61, 62, 105]);
  });

  it('refuses garbage and backwards ranges, naming the bad token', () => {
    expect(() => parseReservedLayersFlag('sixty')).toThrow(/sixty/);
    expect(() => parseReservedLayersFlag('69-60')).toThrow(/backwards/);
  });

  it("a typo'd huge range fails LEGIBLY instead of expanding (flag and file alike)", () => {
    expect(() => parseReservedLayersFlag('0-2000000000')).toThrow(/exceeds layer 9999/);
  });
});

describe('loadReservedLayers', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function tmpFile(name: string): string {
    dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-reserved-'));
    return path.join(dir, name);
  }

  it('round-trips a declared file and expands its ranges', () => {
    const file = tmpFile('reserved.json');
    fs.writeFileSync(file, JSON.stringify({ ranges: [{ from: 60, to: 63 }] }), 'utf8');
    const loaded = loadReservedLayers(file);
    expect(loaded).toEqual({ ranges: [{ from: 60, to: 63 }] });
    expect(reservedLayerNumbers(loaded ?? { ranges: [] })).toEqual([60, 61, 62, 63]);
  });

  it('absent file → null (nothing reserved — the normal case)', () => {
    expect(loadReservedLayers(tmpFile('missing.json'))).toBeNull();
  });

  it('bad JSON / schema-invalid → HARD failure naming the file (never warn-and-ignore)', () => {
    const garbage = tmpFile('garbage.json');
    fs.writeFileSync(garbage, 'not json {', 'utf8');
    expect(() => loadReservedLayers(garbage)).toThrow(ReservedLayersFileError);

    const huge = tmpFile('huge.json');
    fs.writeFileSync(huge, JSON.stringify({ ranges: [{ from: 0, to: 2_000_000_000 }] }), 'utf8');
    expect(() => loadReservedLayers(huge)).toThrow(ReservedLayersFileError);

    const invalid = tmpFile('invalid.json');
    fs.writeFileSync(invalid, JSON.stringify({ ranges: [{ from: 69, to: 60 }] }), 'utf8');
    try {
      loadReservedLayers(invalid);
      expect.unreachable('loader must throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ReservedLayersFileError);
      expect((err as Error).message).toContain('invalid.json');
    }
  });
});
