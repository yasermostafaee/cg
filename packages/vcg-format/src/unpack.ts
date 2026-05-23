import { ManifestSchema, SceneSchema, type Manifest, type Scene } from '@cg/shared-schema';
import { readZip } from './zip.js';

export interface UnpackResult {
  scene: Scene;
  manifest: Manifest;
  /** All zip entries by relative path. Includes manifest.json + template.json. */
  files: Map<string, Buffer>;
}

/**
 * Read a `.vcg` archive, validate the manifest and the embedded Scene, and
 * return both alongside the raw file map. Throws if either is missing,
 * malformed, or version-incompatible at the schema level. Integrity
 * verification is a separate step — see `verify()`.
 */
export async function unpack(buf: Buffer): Promise<UnpackResult> {
  const files = await readZip(buf);

  const manifestBuf = files.get('manifest.json');
  if (!manifestBuf) {
    throw new Error('Missing manifest.json in .vcg');
  }
  const manifest = ManifestSchema.parse(JSON.parse(manifestBuf.toString('utf-8')) as unknown);

  const sceneBuf = files.get('template.json');
  if (!sceneBuf) {
    throw new Error('Missing template.json in .vcg');
  }
  const scene = SceneSchema.parse(JSON.parse(sceneBuf.toString('utf-8')) as unknown);

  return { scene, manifest, files };
}
