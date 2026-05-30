import { ManifestSchema, SceneSchema, type Manifest, type Scene } from '@cg/shared-schema';
import { readZip } from './zip.js';

export interface UnpackResult {
  scene: Scene;
  manifest: Manifest;
  /** All zip entries by relative path. Includes manifest.json + template.json. */
  files: Map<string, Uint8Array>;
}

const decoder = new TextDecoder();
function decodeUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * Read a `.vcg` archive, validate the manifest and the embedded Scene, and
 * return both alongside the raw file map. Throws if either is missing,
 * malformed, or version-incompatible at the schema level. Integrity
 * verification is a separate step — see `verify()`.
 */
export async function unpack(buf: Uint8Array): Promise<UnpackResult> {
  const files = await readZip(buf);

  const manifestBuf = files.get('manifest.json');
  if (!manifestBuf) {
    throw new Error('Missing manifest.json in .vcg');
  }
  const manifest = ManifestSchema.parse(JSON.parse(decodeUtf8(manifestBuf)) as unknown);

  const sceneBuf = files.get('template.json');
  if (!sceneBuf) {
    throw new Error('Missing template.json in .vcg');
  }
  const scene = SceneSchema.parse(JSON.parse(decodeUtf8(sceneBuf)) as unknown);

  return { scene, manifest, files };
}
