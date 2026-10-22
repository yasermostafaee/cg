import { describe, expect, it } from 'vitest';
import { TEMPLATE_MEDIA_MAX_BYTES, type AssetMeta, type ExportProgress } from '@cg/shared-ipc';
import type { Scene, SequenceElement } from '@cg/shared-schema';
import { verify } from '@cg/vcg-format';
import { ExportBlockedError, Exporter, ExportUnreadableError } from '../src/platform/Exporter.js';
import type { AssetStore } from '../src/platform/AssetStore.js';
import {
  exportFailureOf,
  settleFailedFile,
  writeInChunks,
  writeIntoPicked,
  WRITE_CHUNK_BYTES,
} from '../src/platform/export-file.js';
import {
  exportFailedLine,
  exportWrittenLine,
  sizeLabel,
} from '../src/renderer/features/compositions/export-answer.js';
import { defaultSequence } from '../src/renderer/state/element-defaults.js';
import { CG_CONTROL_TOO_LARGE } from '../src/shared/designer-bridge.js';

/**
 * 🔴 `BOOK-EXPORT-01` — the owner exported a book (a Sequence filled by `Add folder…`) and got a
 * `telavat.vcg` of 0 bytes, with no word. Measured: the save dialog made the file empty, `produce`
 * threw (a stale dev server's module), and the rejection reached no one (`B-349`). And a book past
 * CG Bridge's 64 MiB frame could never be imported (`B-351`). These pin the answers.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function meta(i: number, byteSize = PNG.byteLength): AssetMeta {
  return {
    assetId: `asset-${String(i)}`,
    kind: 'image',
    filename: `page${String(i)}.png`,
    sha256: String(i % 10)
      .repeat(64)
      .slice(0, 64),
    byteSize,
    workingPath: `projects/p/assets/image/${String(i)}.png`,
  };
}

/** A store of `n` pages; `unreadable` ids are listed but their bytes cannot be read. */
function store(metas: AssetMeta[], unreadable: ReadonlySet<string> = new Set()): AssetStore {
  return {
    list: async () => metas,
    get: async (id: string) => metas.find((m) => m.assetId === id) ?? null,
    bytes: async (id: string) => (unreadable.has(id) ? null : PNG),
  } as unknown as AssetStore;
}

function bookScene(pageIds: string[]): Scene {
  const seq: SequenceElement = {
    ...defaultSequence('sq', 0, 0),
    name: 'Book pages',
    items: pageIds.map((assetId, i) => ({
      kind: 'image' as const,
      id: `p${String(i + 1)}`,
      assetId,
      name: `page${String(i + 1)}.png`,
    })),
  };
  return {
    schemaVersion: 1,
    id: 's-book',
    name: 'telavat',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [seq],
      },
    ],
    compositions: [],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
  } as unknown as Scene;
}

function exporterOf(assets: AssetStore): Exporter {
  return new Exporter({
    assets,
    cgJs: 'export const createRuntime = () => ({ ready: Promise.resolve() }); export const installCasparGlobals = () => {};',
    cgCss: 'html{background:transparent}',
  });
}

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `asset-${String(i + 1)}`);

describe('B-349 — a book page that cannot be read is never dropped in silence', () => {
  it('🔴 a page naming an asset the project does not have is a preflight ERROR on the sequence', async () => {
    const issues = await exporterOf(store([meta(1)])).preflight(bookScene(['asset-1', 'asset-9']));
    const missing = issues.filter((i) => i.code === 'missing-asset');
    expect(missing).toEqual([
      {
        severity: 'error',
        code: 'missing-asset',
        message: 'Page 2 of "Book pages" references unknown asset asset-9.',
        elementId: 'sq',
      },
    ]);
  });

  it('🔴 a page whose BYTES cannot be read fails the export, naming the file and the sequence', async () => {
    const exporter = exporterOf(store([meta(1), meta(2)], new Set(['asset-2'])));
    const run = exporter.produce(bookScene(['asset-1', 'asset-2']));
    await expect(run).rejects.toBeInstanceOf(ExportUnreadableError);
    await expect(run).rejects.toMatchObject({
      message: 'page2.png in "Book pages" could not be read from the project',
      elementId: 'sq',
    });
  });

  it('a refusal by validation is typed and keeps its old message shape', async () => {
    const run = exporterOf(store([meta(1)])).produce(bookScene(['asset-1', 'asset-9']));
    await expect(run).rejects.toBeInstanceOf(ExportBlockedError);
    await expect(run).rejects.toThrow(/^export blocked by validation: missing-asset — Page 2/);
  });

  it('a book that reads exports, and its progress only moves forward to the write', async () => {
    const exporter = exporterOf(store([meta(1), meta(2), meta(3)]));
    const seen: ExportProgress[] = [];
    const off = exporter.progress.subscribe((p) => seen.push(p));
    const { vcg } = await exporter.produce(bookScene(ids(3)));
    off();
    expect((await verify(vcg)).ok).toBe(true);
    const shares = seen.map((p) => p.progress);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(shares.at(-1)).toBe(0.9);
    // The packing reports from inside (it used to be one jump, then a long silence).
    expect(seen.filter((p) => p.step === 'pack').length).toBeGreaterThan(2);
  });
});

describe('B-351 — a template too large for CG Control is refused before the save dialog', () => {
  it('🔴 the owner-sized book (150 pictures, 671 MB) is an ERROR naming the count, the size and the limit', async () => {
    const each = Math.floor((671 * 1024 * 1024) / 150);
    const metas = ids(150).map((_, i) => meta(i + 1, each));
    const issues = await exporterOf(store(metas)).preflight(bookScene(ids(150)));
    const big = issues.find((i) => i.code === CG_CONTROL_TOO_LARGE);
    expect(big?.severity).toBe('error');
    expect(big?.elementId).toBe('sq');
    expect(big?.message).toBe(
      '"Book pages" makes this template too large for CG Control: 150 pictures, 671 MB of ' +
        'pictures and media; one template can carry at most 45 MB. Use fewer or smaller pictures, ' +
        'or load the pages in CG Control instead (Load pages…).',
    );
  });

  it('a book just under the limit is not refused (the line is the limit, not a guess near it)', async () => {
    const metas = [meta(1, TEMPLATE_MEDIA_MAX_BYTES - 1024)];
    const issues = await exporterOf(store(metas)).preflight(bookScene(['asset-1']));
    expect(issues.some((i) => i.code === CG_CONTROL_TOO_LARGE)).toBe(false);
    const over = await exporterOf(store([meta(1, TEMPLATE_MEDIA_MAX_BYTES + 4096)])).preflight(
      bookScene(['asset-1']),
    );
    expect(over.some((i) => i.code === CG_CONTROL_TOO_LARGE)).toBe(true);
  });

  it('the limit is 45 MB: CG Bridge’s 64 MiB frame, less 4 MiB for the page, before base64', () => {
    expect(TEMPLATE_MEDIA_MAX_BYTES).toBe(45 * 1024 * 1024);
  });
});

/** A file handle as Chrome's save dialog hands one over, its behaviour scripted per test. */
function handle(opts: {
  size: number;
  remove?: 'works' | 'throws' | 'absent' | 'pretends';
}): FileSystemFileHandle & { removed: boolean } {
  const h = {
    name: 'telavat.vcg',
    removed: false,
    getFile: async () => {
      if (h.removed) throw new DOMException('gone', 'NotFoundError');
      return { size: opts.size } as File;
    },
    ...(opts.remove !== 'absent' && {
      remove: async () => {
        if (opts.remove === 'throws') throw new DOMException('no', 'NotAllowedError');
        if (opts.remove === 'works') h.removed = true;
      },
    }),
  };
  return h as unknown as FileSystemFileHandle & { removed: boolean };
}

describe('B-349 — the file the save dialog made, after a failure', () => {
  it('🔴 an EMPTY file is removed, and the claim is made only when reading it back finds nothing', async () => {
    const h = handle({ size: 0, remove: 'works' });
    expect(await settleFailedFile(h)).toBe('removed');
    expect(h.removed).toBe(true);
  });

  it('🔴 a file that still holds bytes is the author’s earlier file: never removed', async () => {
    const h = handle({ size: 1234, remove: 'works' });
    expect(await settleFailedFile(h)).toBe('unchanged');
    expect(h.removed).toBe(false);
  });

  it('a browser with no remove(), one that refuses it, or one whose remove() leaves the file: "left empty"', async () => {
    expect(await settleFailedFile(handle({ size: 0, remove: 'absent' }))).toBe('left-empty');
    expect(await settleFailedFile(handle({ size: 0, remove: 'throws' }))).toBe('left-empty');
    expect(await settleFailedFile(handle({ size: 0, remove: 'pretends' }))).toBe('left-empty');
  });

  it('writes in chunks with progress, and ABORTS (leaving the file as it was) when a write throws', async () => {
    const writes: number[] = [];
    let aborted = false;
    let closed = false;
    const failAt = 2;
    const h = {
      createWritable: async () => ({
        write: async (chunk: Uint8Array) => {
          if (writes.length === failAt) throw new DOMException('full', 'QuotaExceededError');
          writes.push(chunk.byteLength);
        },
        close: async () => {
          closed = true;
        },
        abort: async () => {
          aborted = true;
        },
      }),
    } as unknown as FileSystemFileHandle;
    const shares: number[] = [];
    const bytes = new Uint8Array(WRITE_CHUNK_BYTES * 3 + 10);
    await expect(writeInChunks(h, bytes, (s) => shares.push(s))).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    expect(writes).toEqual([WRITE_CHUNK_BYTES, WRITE_CHUNK_BYTES]);
    expect(shares.length).toBe(2);
    expect(aborted).toBe(true);
    expect(closed).toBe(false);
  });
});

describe('BOOK-EXPORT Q4 — Save As writes into the picked file the way the export does', () => {
  /** A handle whose file the dialog made EMPTY, and whose every write fails. */
  function failingEmpty(): FileSystemFileHandle & { removed: boolean; aborted: boolean } {
    const h = Object.assign(handle({ size: 0, remove: 'works' }), {
      aborted: false,
      createWritable: async () => ({
        write: async () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
        close: async () => undefined,
        abort: async () => {
          h.aborted = true;
        },
      }),
    });
    return h as FileSystemFileHandle & { removed: boolean; aborted: boolean };
  }

  it('🔴 a failed write is answered with its cause, and the EMPTY file the dialog made is removed', async () => {
    const h = failingEmpty();
    expect(await writeIntoPicked(h, new Uint8Array(10))).toEqual({
      cause: 'there is not enough space on the disk for the file',
      file: 'removed',
    });
    expect(h.aborted).toBe(true);
    expect(h.removed).toBe(true);
  });

  it('a write that succeeds answers nothing', async () => {
    const h = {
      createWritable: async () => ({
        write: async () => undefined,
        close: async () => undefined,
        abort: async () => undefined,
      }),
    } as unknown as FileSystemFileHandle;
    expect(await writeIntoPicked(h, new Uint8Array(10))).toBeNull();
  });

  it('the sentence is the export’s, with its own verb', () => {
    expect(
      exportFailedLine(
        {
          cause: 'there is not enough space on the disk for the file',
          filename: 'telavat.cgproj',
          file: 'removed',
        },
        'Save',
      ),
    ).toBe(
      'Save failed: there is not enough space on the disk for the file. telavat.cgproj was removed; nothing was saved.',
    );
  });
});

describe('B-349 — the cause and the sentence, in the author’s words', () => {
  it('🔴 the owner’s fault reads as what it was, and says what became of the file', () => {
    const owner = exportFailureOf(new ReferenceError('collectAudioElements is not defined'));
    expect(owner).toEqual({
      cause: 'the Designer hit an error (collectAudioElements is not defined)',
    });
    expect(exportFailedLine({ ...owner, filename: 'telavat.vcg', file: 'removed' })).toBe(
      'Export failed: the Designer hit an error (collectAudioElements is not defined). ' +
        'telavat.vcg was removed; nothing was saved.',
    );
    expect(exportFailedLine({ ...owner, filename: 'telavat.vcg', file: 'left-empty' })).toBe(
      'Export failed: the Designer hit an error (collectAudioElements is not defined). ' +
        'telavat.vcg was left empty; delete it.',
    );
    expect(exportFailedLine({ ...owner, filename: 'telavat.vcg', file: 'unchanged' })).toContain(
      'telavat.vcg was not changed.',
    );
    expect(exportFailedLine({ ...owner, filename: null, file: 'none' })).toMatch(
      /\. Nothing was saved\.$/,
    );
  });

  it('a full disk, a locked file and an unreadable page are named; a cause’s own full stop is not doubled', () => {
    expect(exportFailureOf(new DOMException('x', 'QuotaExceededError')).cause).toBe(
      'there is not enough space on the disk for the file',
    );
    expect(exportFailureOf(new DOMException('x', 'NoModificationAllowedError')).cause).toBe(
      'the file is open in another program',
    );
    expect(
      exportFailureOf(
        new ExportUnreadableError('page2.png in "Book" could not be read from the project', 'sq'),
      ),
    ).toEqual({
      cause: 'page2.png in "Book" could not be read from the project',
      elementId: 'sq',
    });
    expect(
      exportFailedLine({
        cause: 'Image element references unknown asset a.',
        filename: null,
        file: 'none',
      }),
    ).toBe('Export failed: Image element references unknown asset a. Nothing was saved.');
  });

  it('a written file is named with its size, as Windows counts it', () => {
    expect(exportWrittenLine('telavat.vcg', 29_225_439)).toBe('Exported telavat.vcg · 27.9 MB');
    expect(sizeLabel(2048)).toBe('2 KB');
    expect(sizeLabel(10)).toBe('1 KB');
  });

  it('a throw it does not know is still said, never swallowed', () => {
    expect(exportFailureOf('a string').cause).toBe('the Designer hit an error (a string)');
  });
});
