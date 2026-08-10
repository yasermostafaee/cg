import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOURCES_SET_ASSIGNMENTS_REASONS,
  SOURCES_SET_CONFIG_REASONS,
  type SourceAssignments,
  type SourceCatalog,
} from '@cg/shared-ipc';
import {
  loadSourceCatalog,
  resolveSourceCatalog,
  saveSourceCatalog,
  SourceCatalogFileError,
  type SourceCatalogErrorCode,
} from '../src/source-catalog-store.js';
import {
  loadSourceAssignments,
  resolveSourceAssignments,
  saveSourceAssignments,
  SourceAssignmentsFileError,
  type SourceAssignmentsErrorCode,
} from '../src/source-assignments-store.js';

// The validators' code unions and the wire's reason unions are ONE definition;
// these assignments break the BUILD on any drift, in both directions (the
// `fixed-layers-store.test.ts` S2 shape).
const _wireCoversCatalog: readonly SourceCatalogErrorCode[] = SOURCES_SET_CONFIG_REASONS;
const _catalogCoversWire: readonly (typeof SOURCES_SET_CONFIG_REASONS)[number][] =
  [] as SourceCatalogErrorCode[];
const _wireCoversAssignments: readonly SourceAssignmentsErrorCode[] =
  SOURCES_SET_ASSIGNMENTS_REASONS;
const _assignmentsCoverWire: readonly (typeof SOURCES_SET_ASSIGNMENTS_REASONS)[number][] =
  [] as SourceAssignmentsErrorCode[];
void _wireCoversCatalog;
void _catalogCoversWire;
void _wireCoversAssignments;
void _assignmentsCoverWire;

/**
 * D-137 / C-015 phase 4 — the loaders, resolvers and persistence for BOTH live
 * source stores: the installation's CATALOG and the per-plate ASSIGNMENTS.
 *
 * The FILE half alone. What a legal catalog or assignment IS lives in
 * `@cg/shared-ipc` so the bridge and the offline mock cannot refuse different
 * things, and those tests live with it
 * (`packages/shared-ipc/tests/sources.test.ts`).
 *
 * The behaviours worth pinning hardest here are the ones that are SAFETY
 * properties rather than conveniences: an ABSENT file means NOTHING with no
 * guessed default, and a PRESENT-but-unusable file refuses to load at all rather
 * than yielding the half of it that parsed.
 */

const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-source-store-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const studioA = {
  id: 'src-aaa',
  name: 'Studio A',
  producer: { kind: 'route', channel: 2 },
} as const;

describe('the absent catalog means NO SOURCES, and there is no built-in default', () => {
  it('an absent file loads as null', () => {
    expect(loadSourceCatalog(path.join(tmpDir(), 'nothing.json'))).toBeNull();
  });

  it('resolves an absent file to the EMPTY catalog, never to a guess', () => {
    // The whole doctrine in one assertion: a default fixed-layer BANK is safe
    // because it guesses about our own numbering; a default INPUT definition
    // would guess about hardware nobody here can see, and a wrong guess puts the
    // wrong camera behind a guest's frame.
    const resolved = resolveSourceCatalog({
      sourceCatalogPath: path.join(tmpDir(), 'nothing.json'),
    });
    expect(resolved.value).toEqual({ sources: [] });
    expect(resolved.source).toBe('absent');
  });

  it('holds ABSENT and NONE apart, because only one has a file to write', () => {
    expect(resolveSourceCatalog({}).source).toBe('none');
    expect(resolveSourceCatalog({ sourceCatalog: { sources: [studioA] } }).source).toBe('explicit');
  });
});

describe('a present but unusable catalog is a HARD failure', () => {
  it('throws on invalid JSON, naming the file', () => {
    const file = path.join(tmpDir(), 'sources.json');
    fs.writeFileSync(file, '{ not json', 'utf8');
    expect(() => loadSourceCatalog(file)).toThrow(SourceCatalogFileError);
    expect(() => loadSourceCatalog(file)).toThrow(/invalid JSON/);
    expect(() => loadSourceCatalog(file)).toThrow(file);
  });

  it('throws on a schema-invalid file rather than keeping the entries that parsed', () => {
    const file = path.join(tmpDir(), 'sources.json');
    // Two entries, one of which names a producer kind nothing can play. A
    // partially parsed catalog is worse than none: the station would boot
    // defining `Studio A` and silently dropping the other with nothing said.
    fs.writeFileSync(
      file,
      JSON.stringify({
        sources: [studioA, { id: 'src-bbb', name: 'Baku', producer: { kind: 'sdi', device: 3 } }],
      }),
      'utf8',
    );
    expect(() => loadSourceCatalog(file)).toThrow(/schema-invalid/);
  });

  it('throws on a source with no NAME — nobody could assign it', () => {
    const file = path.join(tmpDir(), 'sources.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ sources: [{ id: 'src-aaa', producer: studioA.producer }] }),
      'utf8',
    );
    expect(() => loadSourceCatalog(file)).toThrow(/schema-invalid/);
  });
});

describe('the absent assignments file means NOTHING ASSIGNED', () => {
  it('resolves to the empty set, and holds ABSENT and NONE apart', () => {
    const resolved = resolveSourceAssignments({
      sourceAssignmentsPath: path.join(tmpDir(), 'nothing.json'),
    });
    expect(resolved.value).toEqual({ assignments: [] });
    expect(resolved.source).toBe('absent');
    expect(resolveSourceAssignments({}).source).toBe('none');
  });

  it('an unusable assignments file is still a HARD failure', () => {
    // The DANGLING case is pruned rather than fatal (it has a clear reading);
    // an UNPARSEABLE file has no reading at all, so this rule is unchanged.
    const file = path.join(tmpDir(), 'plates.json');
    fs.writeFileSync(file, '{ not json', 'utf8');
    expect(() => loadSourceAssignments(file)).toThrow(SourceAssignmentsFileError);
    fs.writeFileSync(file, JSON.stringify({ assignments: [{ templateId: 'tpl-1' }] }), 'utf8');
    expect(() => loadSourceAssignments(file)).toThrow(/schema-invalid/);
  });
});

describe('persistence', () => {
  it('writes the catalog atomically through a tmp file and reads back byte-equal', () => {
    const file = path.join(tmpDir(), 'nested', 'sources.json');
    const value: SourceCatalog = {
      sources: [
        { id: 'src-aaa', name: 'Studio A', format: '1080i5000', producer: studioA.producer },
        { id: 'src-bbb', name: 'Baku', producer: { kind: 'decklink', device: 1, keyDevice: 2 } },
      ],
      layerRange: { start: 10, end: 59 },
    };
    saveSourceCatalog(file, value);
    expect(loadSourceCatalog(file)).toEqual(value);
    // mkdir -p happened, and no tmp file was left behind.
    expect(fs.readdirSync(path.dirname(file))).toEqual(['sources.json']);
  });

  it('writes the assignments the same way, in their own file', () => {
    // Its OWN file, never inside `templatesDir`: the registry reads every
    // `*.json` there as a template (B-116), and this one is ABOUT templates.
    const file = path.join(tmpDir(), 'nested', 'plates.json');
    const value: SourceAssignments = {
      assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    saveSourceAssignments(file, value);
    expect(loadSourceAssignments(file)).toEqual(value);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['plates.json']);
  });
});
