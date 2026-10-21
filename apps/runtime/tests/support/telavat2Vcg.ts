import { deflateSync } from 'node:zlib';
import { pack, sha256Hex } from '@cg/vcg-format';
import type { AssetEntry, DynamicField, FieldBinding, Scene } from '@cg/shared-schema';

/**
 * 🔴 `B-353` — **THE OWNER'S `telavat2.vcg`, IN ITS EXACT SHAPE, WITH SMALL PICTURES.** Read from the
 * file the owner exported on 2026-10-15: one layer, one sequence `el-1792090411157` of picture items
 * `page-mv9wduov-N` named `MRN (N).jpg`, `advance: 'auto'`, one pass, fade/fade; one `list` field `a1`
 * whose default is those pages, carrying `digits` and `allowFileSource` and NO `pages` mark (the
 * Designer dropped it); one `sequence-items` binding. The manifest id is the project's scene id, as
 * every export carried before `B-352`. The pictures are 8×8 PNGs, each a different colour (the real
 * ones are 80–120 KB JPGs: the shape is the subject, not the bytes).
 *
 * `keyed: false` builds the same book with no Data key at all (BOOK-EXPORT Q2). `textPageAfter: n`
 * (`RUN-NEXT-VERSION-03` 1.6) puts a TEXT page after picture n, in the sequence and the default alike.
 */
export const TELAVAT2_ID = '5c3c6424-3208-44e9-b235-2e9b4a23ef1b';
export const TELAVAT2_SEQUENCE = 'el-1792090411157';

export async function buildTelavat2Vcg(
  opts: { templateId?: string; pages?: number; keyed?: boolean; textPageAfter?: number } = {},
): Promise<Uint8Array> {
  const count = opts.pages ?? 87;
  const assets = new Map<string, Uint8Array>();
  const assetIndex: AssetEntry[] = [];
  const pictures = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const png = pagePng(n);
    const sha256 = sha256Hex(png);
    const path = `assets/image/${sha256}.png`;
    const assetId = `page-asset-${String(n)}`;
    assets.set(path, png);
    assetIndex.push({
      id: assetId,
      path,
      kind: 'image',
      bytes: png.byteLength,
      sha256,
      mime: 'image/png',
    });
    return {
      id: `page-mv9wduov-${String(n)}`,
      kind: 'image' as const,
      assetId,
      name: `MRN (${String(n)}).jpg`,
    };
  });
  const items: ((typeof pictures)[number] | { id: string; text: string })[] = [...pictures];
  if (opts.textPageAfter !== undefined) {
    items.splice(opts.textPageAfter, 0, { id: 'note-1', text: 'یادداشت سردبیر' });
  }
  const keyed = opts.keyed ?? true;
  const fields: DynamicField[] = keyed
    ? [
        {
          id: 'a1',
          label: 'a1',
          required: false,
          type: 'list',
          default: items.map((i) => ({ ...i })),
          digits: 'persian',
          allowFileSource: true,
        },
      ]
    : [];
  const bindings: FieldBinding[] = keyed
    ? [{ fieldId: 'a1', target: { kind: 'sequence-items', elementId: TELAVAT2_SEQUENCE } }]
    : [];
  const scene: Scene = {
    schemaVersion: 1,
    id: TELAVAT2_ID,
    name: 'comp1',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1792090411157',
        name: 'Layer 1',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: TELAVAT2_SEQUENCE,
            name: 'Sequence',
            type: 'sequence',
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 0,
            transform: {
              position: { x: 0, y: 0 },
              size: { w: 1924, h: 1080 },
              rotation: 0,
              scale: { x: 1, y: 1 },
              anchor: { x: 0.5, y: 0.5 },
            },
            font: {
              family: 'Vazirmatn',
              weight: 500,
              style: 'normal',
              size: 36,
              lineHeight: 1.4,
              letterSpacing: 0,
            },
            color: '#FFFFFF',
            align: 'start',
            verticalAlign: 'middle',
            direction: 'ltr',
            items,
            defaultDwellMs: 5000,
            advance: 'auto',
            transitionIn: 'fade',
            transitionOut: 'fade',
            transitionTiming: 'simultaneous',
            transitionMs: 400,
            repeat: 1,
            digits: 'persian',
            imageFit: 'cover',
          },
        ],
      },
    ],
    fields,
    bindings,
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-10-15T18:53:24.326Z', updatedAt: '2026-10-15T18:53:24.326Z' },
    arrangements: [],
    lookGroups: [],
  } as unknown as Scene;
  return pack({
    scene,
    manifestExtras: {
      id: opts.templateId ?? TELAVAT2_ID,
      name: 'comp1',
      authoring: {
        designerVersion: '0.0.0',
        createdAt: '2026-10-15T18:53:24.326Z',
        exportedAt: '2026-10-15T18:57:52.290Z',
      },
      compatibility: { minRuntimeVersion: '1.0.0', minCasparCGVersion: '2.3.0' },
      fontDeps: [],
      assetIndex,
    },
    indexHtml: '<!doctype html><html><body>placeholder</body></html>',
    cgJs: '/* placeholder template runtime */',
    cgCss: '/* placeholder template styles */',
    assets,
  });
}

/** An 8×8 PNG of one colour, distinct per `n` (so every page has its own bytes and hash). */
export function pagePng(n: number): Uint8Array {
  const w = 8;
  const h = 8;
  const rgb = [(n * 53) % 256, (n * 97) % 256, (n * 151) % 256];
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y += 1) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x += 1) raw.set(rgb, row + 1 + x * 3);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour, deflate, no filter, no interlace
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)));
  return out;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
