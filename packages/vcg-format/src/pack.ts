import {
  SceneSchema,
  type AssetEntry,
  type FontReference,
  type Manifest,
  type Scene,
} from '@cg/shared-schema';
import { writeZip } from './zip.js';
import { computeIntegrity } from './integrity.js';

export interface PackInput {
  /** The Scene to embed as template.json. Validated before packing. */
  scene: Scene;
  /**
   * Manifest fields the Scene doesn't already carry: identity, authoring
   * provenance, compatibility floor, declared font deps, and the asset
   * index. The rest of the manifest is derived from the scene and the
   * file map.
   */
  manifestExtras: Pick<Manifest, 'id' | 'name' | 'authoring' | 'compatibility'> & {
    fontDeps: readonly FontReference[];
    assetIndex: readonly AssetEntry[];
  };
  /** Broadcast HTML to ship as index.html. */
  indexHtml: string;
  /** @cg/template-runtime bundle. */
  cgJs: string;
  cgCss: string;
  /** Path → bytes. Paths must be relative (e.g. 'assets/img/logo.png'). */
  assets?: ReadonlyMap<string, Buffer>;
  fonts?: ReadonlyMap<string, Buffer>;
  thumbnails?: ReadonlyMap<string, Buffer>;
}

/**
 * Pack a Scene + assets + runtime into a deterministic `.vcg` archive.
 *
 * Steps (matches Phase 4 §7):
 *   1. Validate the Scene with Zod.
 *   2. Assemble the file map (template.json, index.html, cg.{js,css},
 *      assets/, fonts/, thumbnails/).
 *   3. Compute sha256 per file and the Merkle integrity root.
 *   4. Build the Manifest, populate `integrity`, and add `manifest.json` to
 *      the map. (Manifest's own hash is *not* part of integrity — that's
 *      circular.)
 *   5. Write a deterministic zip (sorted paths, fixed dates).
 *
 * Re-packing the same input returns byte-identical bytes — verified by
 * `tests/roundtrip.test.ts`.
 */
export async function pack(input: PackInput): Promise<Buffer> {
  SceneSchema.parse(input.scene);

  const files = new Map<string, Buffer>();

  // Core artifacts. JSON is pretty-printed for diff-ability; the zip
  // already compresses it, so the readability cost is essentially free.
  files.set('template.json', Buffer.from(JSON.stringify(input.scene, null, 2), 'utf-8'));
  files.set('index.html', Buffer.from(input.indexHtml, 'utf-8'));
  files.set('cg.js', Buffer.from(input.cgJs, 'utf-8'));
  files.set('cg.css', Buffer.from(input.cgCss, 'utf-8'));

  copyInto(files, input.assets);
  copyInto(files, input.fonts);
  copyInto(files, input.thumbnails);

  // Integrity is computed over the file map *excluding* manifest.json
  // (which contains the integrity block itself).
  const integrity = computeIntegrity(files);

  const manifest: Manifest = {
    schemaVersion: 1,
    format: 'vcg',
    formatVersion: '1.0',
    id: input.manifestExtras.id,
    name: input.manifestExtras.name,
    templateType: input.scene.templateType,
    resolution: input.scene.resolution,
    frameRate: input.scene.frameRate,
    fields: input.scene.fields.map((f) => ({
      id: f.id,
      type: f.type,
      required: f.required,
    })),
    fontDeps: [...input.manifestExtras.fontDeps],
    assetIndex: [...input.manifestExtras.assetIndex],
    integrity: {
      files: integrity.files,
      root: integrity.root,
    },
    authoring: input.manifestExtras.authoring,
    compatibility: input.manifestExtras.compatibility,
  };

  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  return writeZip(files);
}

function copyInto(
  dest: Map<string, Buffer>,
  source: ReadonlyMap<string, Buffer> | undefined,
): void {
  if (!source) return;
  for (const [path, content] of source) {
    if (dest.has(path)) {
      throw new Error(`Duplicate path in .vcg: ${path}`);
    }
    dest.set(path, content);
  }
}
