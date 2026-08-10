import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SOURCES_SET_CONFIG_REASONS, type SourceMappings } from '@cg/shared-ipc';
import {
  loadSourceMappings,
  resolveSourceMappings,
  saveSourceMappings,
  SourceMappingsFileError,
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
 * The FILE half alone. What a legal mapping IS moved to `@cg/shared-ipc` so the
 * bridge and the offline mock cannot refuse different things, and its tests
 * moved with it (`packages/shared-ipc/tests/sources.test.ts`).
 *
 * The two behaviours worth pinning hardest here are the two that are SAFETY
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

const guest1 = { id: 'guest-1', producer: { kind: 'route', channel: 2 } } as const;

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
