import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOURCES_SET_CONFIG_REASONS,
  type FixedLayerBank,
  type SourceMappings,
} from '@cg/shared-ipc';
import {
  loadSourceMappings,
  resolveSourceMappings,
  saveSourceMappings,
  SourceMappingsConfigError,
  SourceMappingsFileError,
  validateSourceMappings,
  type SourceMappingsErrorCode,
} from '../src/source-mapping-store.js';

// The validator's code union and the wire's reason union are ONE definition;
// these two assignments break the BUILD on any drift, in both directions (the
// `fixed-layers-store.test.ts` S2 shape).
const _wireCoversValidator: readonly SourceMappingsErrorCode[] = SOURCES_SET_CONFIG_REASONS;
const _validatorCoversWire: readonly (typeof SOURCES_SET_CONFIG_REASONS)[number][] =
  [] as SourceMappingsErrorCode[];
void _wireCoversValidator;
void _validatorCoversWire;

/**
 * D-137 / C-015 phase 4 — the installation mapping's loader, validator and
 * persistence.
 *
 * The two behaviours worth pinning hardest are the two that are SAFETY
 * properties rather than conveniences: an ABSENT file means NO MAPPINGS with no
 * guessed default, and a PRESENT-but-unusable file refuses to load at all
 * rather than yielding the half of it that parsed.
 */

const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-source-mappings-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function bank(overrides: Partial<FixedLayerBank> = {}): FixedLayerBank {
  return { channel: 1, start: 70, count: 30, ...overrides };
}

const guest1 = { id: 'guest-1', producer: { kind: 'route', channel: 2 } } as const;

function codeOf(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof SourceMappingsConfigError) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error('expected SourceMappingsConfigError');
}

describe('the absent file means NO MAPPINGS, and there is no built-in default', () => {
  it('an absent file loads as null', () => {
    expect(loadSourceMappings(path.join(tmpDir(), 'nothing.json'))).toBeNull();
  });

  it('resolves an absent file to the EMPTY mapping, never to a guess', () => {
    // The whole doctrine in one assertion: a default fixed-layer BANK is safe
    // because it guesses about our own numbering; a default INPUT mapping would
    // guess about hardware nobody here can see, and a wrong guess puts the
    // wrong camera behind a guest's frame.
    const resolved = resolveSourceMappings({
      sourceMappingsPath: path.join(tmpDir(), 'nothing.json'),
    });
    expect(resolved.value).toEqual({ mappings: [] });
    expect(resolved.source).toBe('absent');
  });

  it('holds ABSENT and NONE apart, because only one has a file to write', () => {
    expect(resolveSourceMappings({}).source).toBe('none');
    expect(resolveSourceMappings({ sourceMappings: { mappings: [guest1] } }).source).toBe(
      'explicit',
    );
  });
});

describe('a present but unusable file is a HARD failure', () => {
  it('throws on invalid JSON, naming the file', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'sources.json');
    fs.writeFileSync(file, '{ not json', 'utf8');
    expect(() => loadSourceMappings(file)).toThrow(SourceMappingsFileError);
    expect(() => loadSourceMappings(file)).toThrow(/invalid JSON/);
    expect(() => loadSourceMappings(file)).toThrow(file);
  });

  it('throws on a schema-invalid file rather than keeping the entries that parsed', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'sources.json');
    // Two entries, one of which names a producer kind nothing can play. A
    // partially parsed mapping is worse than none: the station would boot
    // resolving `guest-1` and silently refusing `guest-2` with nothing said.
    fs.writeFileSync(
      file,
      JSON.stringify({
        mappings: [guest1, { id: 'guest-2', producer: { kind: 'sdi', device: 3 } }],
      }),
      'utf8',
    );
    expect(() => loadSourceMappings(file)).toThrow(/schema-invalid/);
  });

  it('throws on a device-shaped id, which could never match a declaration', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'sources.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ mappings: [{ id: 'DECKLINK DEVICE 3', producer: guest1.producer }] }),
      'utf8',
    );
    expect(() => loadSourceMappings(file)).toThrow(/schema-invalid/);
  });
});

describe('validateSourceMappings — at load AND at change', () => {
  it('accepts a band clear of both the bank and the reservation', () => {
    expect(() =>
      validateSourceMappings(
        { mappings: [guest1], layerRange: { start: 10, end: 59 } },
        { fixedBank: bank(), reservedLayers: [60, 61, 62] },
      ),
    ).not.toThrow();
  });

  it('refuses two mappings claiming one id', () => {
    const { code, message } = codeOf(() =>
      validateSourceMappings(
        { mappings: [guest1, { id: 'guest-1', producer: { kind: 'media', file: 'AMB' } }] },
        { fixedBank: null, reservedLayers: [] },
      ),
    );
    expect(code).toBe('duplicate-id');
    // Which producer a template got would depend on array order — the message
    // has to say that, not merely "duplicate".
    expect(message).toContain('guest-1');
    expect(message).toMatch(/order/i);
  });

  it('refuses a band overlapping the candidate bank, naming BOTH ranges', () => {
    const { code, message } = codeOf(() =>
      validateSourceMappings(
        { mappings: [], layerRange: { start: 50, end: 75 } },
        { fixedBank: bank(), reservedLayers: [] },
      ),
    );
    expect(code).toBe('overlaps-fixed-bank');
    expect(message).toContain('50-75');
    expect(message).toContain('70-99');
  });

  it('refuses a band overlapping the reserved playout range, naming the layers', () => {
    const { code, message } = codeOf(() =>
      validateSourceMappings(
        { mappings: [], layerRange: { start: 55, end: 65 } },
        { fixedBank: null, reservedLayers: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69] },
      ),
    );
    expect(code).toBe('overlaps-reserved');
    expect(message).toContain('55-65');
    expect(message).toContain('60-69');
    expect(message).toContain('60, 61');
  });

  it('compares LAYER NUMBERS regardless of channel — the conservative direction', () => {
    // The band carries no channel because a Live Source lands on whatever
    // channel its template is on. Refusing an overlap the bank declares on
    // channel 2 refuses more than is strictly necessary, and that is right for
    // a check whose failure mode is a graphic landing on somebody else's layer.
    expect(() =>
      validateSourceMappings(
        { mappings: [], layerRange: { start: 70, end: 80 } },
        { fixedBank: bank({ channel: 2 }), reservedLayers: [] },
      ),
    ).toThrow(SourceMappingsConfigError);
  });

  it('checks nothing about layers when no band is declared', () => {
    // A mapping with no band is legal — nothing can be placed, which is phase
    // 5's problem, not a config error.
    expect(() =>
      validateSourceMappings({ mappings: [guest1] }, { fixedBank: bank(), reservedLayers: [60] }),
    ).not.toThrow();
  });
});

describe('persistence', () => {
  it('writes atomically through a tmp file and reads back byte-equal', () => {
    const file = path.join(tmpDir(), 'nested', 'sources.json');
    const value: SourceMappings = {
      mappings: [
        { id: 'guest-1', label: 'Studio camera 2', format: '1080i5000', producer: guest1.producer },
        { id: 'guest-2', producer: { kind: 'decklink', device: 1, keyDevice: 2 } },
      ],
      layerRange: { start: 10, end: 59 },
    };
    saveSourceMappings(file, value);
    expect(loadSourceMappings(file)).toEqual(value);
    // mkdir -p happened, and no tmp file was left behind.
    expect(fs.readdirSync(path.dirname(file))).toEqual(['sources.json']);
  });
});
